import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtractedVoucher } from "@check/ocr";
import type { ParsedBankEmail } from "@check/parsers";
import { toCents } from "@check/shared";

import { BANK_EMAIL_MATCH_KIND, emailMatchDefense } from "../../src/defenses/email-match.ts";
import type { DefenseInput } from "../../src/index.ts";

const voucher: ExtractedVoucher = {
  issuerBank: "nequi",
  amount: toCents(5_000_000),
  approvalNumber: "1234567",
  paidAtUtc: "2026-07-03T15:30:00.000Z",
  destinationAccount: "3001234567",
  beneficiary: "Panaderia Ejemplo",
};

const matchingEmail: ParsedBankEmail = {
  bank: "bancolombia",
  amount: voucher.amount,
  approvalNumber: voucher.approvalNumber,
  occurredAtUtc: "2026-07-03T15:35:00.000Z", // +5 min, dentro de la ventana default de 15
  destinationAccount: voucher.destinationAccount,
};

function buildInput(
  receivedBankEmails: readonly ParsedBankEmail[],
  verificationWindowMinutes?: number,
): DefenseInput {
  return {
    voucher,
    context: {
      business: { businessId: "biz_1", verificationWindowMinutes },
      receivedBankEmails,
    },
  };
}

test("kind expuesto es bank_email_match", () => {
  assert.equal(emailMatchDefense.kind, BANK_EMAIL_MATCH_KIND);
});

test("match exacto (monto, aprobación, cuenta, dentro de ventana) → pass + enablesGreen", async () => {
  const signal = await emailMatchDefense.evaluate(buildInput([matchingEmail]));

  assert.equal(signal.kind, BANK_EMAIL_MATCH_KIND);
  assert.equal(signal.outcome, "pass");
  assert.equal(signal.enablesGreen, true);
});

test("monto distinto al del comprobante → fail + enablesGreen", async () => {
  const email: ParsedBankEmail = { ...matchingEmail, amount: toCents(4_999_000) };
  const signal = await emailMatchDefense.evaluate(buildInput([email]));

  assert.equal(signal.outcome, "fail");
  assert.equal(signal.enablesGreen, true);
});

test("número de aprobación distinto → fail", async () => {
  const email: ParsedBankEmail = { ...matchingEmail, approvalNumber: "7654321" };
  const signal = await emailMatchDefense.evaluate(buildInput([email]));

  assert.equal(signal.outcome, "fail");
});

test("cuenta destino distinta → fail", async () => {
  const email: ParsedBankEmail = { ...matchingEmail, destinationAccount: "9998887777" };
  const signal = await emailMatchDefense.evaluate(buildInput([email]));

  assert.equal(signal.outcome, "fail");
});

test("fuera de la ventana de tiempo por defecto (±15 min) → fail", async () => {
  const email: ParsedBankEmail = {
    ...matchingEmail,
    occurredAtUtc: "2026-07-03T15:46:00.000Z", // +16 min, fuera de ventana default
  };
  const signal = await emailMatchDefense.evaluate(buildInput([email]));

  assert.equal(signal.outcome, "fail");
});

test("justo en el borde de la ventana por defecto (15 min exactos) → pass", async () => {
  const email: ParsedBankEmail = {
    ...matchingEmail,
    occurredAtUtc: "2026-07-03T15:45:00.000Z", // +15 min exactos
  };
  const signal = await emailMatchDefense.evaluate(buildInput([email]));

  assert.equal(signal.outcome, "pass");
});

test("sin correos recibidos todavía → not_applicable (PENDING), no fail/SUSPICIOUS por timing", async () => {
  const signal = await emailMatchDefense.evaluate(buildInput([]));

  assert.equal(signal.outcome, "not_applicable");
  assert.equal(signal.enablesGreen, true);
  assert.match(signal.detail ?? "", /todavía no se recibió ningún correo/);
});

test("correos recibidos pero ninguno matchea → fail (señal de fraude, no solo timing)", async () => {
  const email: ParsedBankEmail = { ...matchingEmail, approvalNumber: "0000000" };
  const signal = await emailMatchDefense.evaluate(buildInput([email]));

  assert.equal(signal.outcome, "fail");
  assert.equal(signal.enablesGreen, true);
  assert.match(signal.detail ?? "", /ningún correo recibido coincide/);
});

test("ventana configurable por negocio: 5 min hace fallar un correo que con la ventana default pasaría", async () => {
  const email: ParsedBankEmail = {
    ...matchingEmail,
    occurredAtUtc: "2026-07-03T15:35:00.000Z", // +5 min, dentro de default (15) pero fuera de 3
  };
  const signal = await emailMatchDefense.evaluate(buildInput([email], 3));

  assert.equal(signal.outcome, "fail");
});

test("ventana configurable por negocio: 30 min hace pasar un correo que con la ventana default fallaría", async () => {
  const email: ParsedBankEmail = {
    ...matchingEmail,
    occurredAtUtc: "2026-07-03T15:46:00.000Z", // +16 min, fuera de default pero dentro de 30
  };
  const signal = await emailMatchDefense.evaluate(buildInput([email], 30));

  assert.equal(signal.outcome, "pass");
});

test("varios correos candidatos: basta con que uno matchee", async () => {
  const noise: ParsedBankEmail = { ...matchingEmail, approvalNumber: "0000000" };
  const signal = await emailMatchDefense.evaluate(buildInput([noise, matchingEmail]));

  assert.equal(signal.outcome, "pass");
});
