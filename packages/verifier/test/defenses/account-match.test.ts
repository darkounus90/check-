import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtractedVoucher } from "@check/ocr";
import { toCents } from "@check/shared";

import { accountMatchDefense } from "../../src/defenses/account-match.ts";
import type { DefenseContext, DefenseInput } from "../../src/index.ts";

const baseVoucher: ExtractedVoucher = {
  issuerBank: "nequi",
  amount: toCents(5_000_000),
  approvalNumber: "1234567",
  paidAtUtc: "2026-07-03T15:30:00.000Z",
  destinationAccount: "3001234567",
  beneficiary: "Panadería Ejemplo SAS",
};

function makeInput(
  voucherOverrides: Partial<ExtractedVoucher>,
  context: DefenseContext,
): DefenseInput {
  return {
    voucher: { ...baseVoucher, ...voucherOverrides },
    context,
  };
}

test("coincide por últimos 4 dígitos de cuenta → pass", async () => {
  const input = makeInput(
    { destinationAccount: "9999994567" },
    {
      business: { businessId: "biz_1", declaredAccountLast4: "4567" },
      receivedBankEmails: [],
    },
  );

  const signal = await accountMatchDefense.evaluate(input);

  assert.equal(signal.outcome, "pass");
  assert.equal(signal.kind, "account_match");
  assert.ok(signal.weight > 0);
  assert.equal(signal.enablesGreen, false);
});

test("coincide por nombre de beneficiario (normalizado, sin acentos) → pass", async () => {
  const input = makeInput(
    { destinationAccount: "", beneficiary: "PANADERIA   ejemplo sas" },
    {
      business: { businessId: "biz_1", declaredBeneficiary: "Panadería Ejemplo SAS" },
      receivedBankEmails: [],
    },
  );

  const signal = await accountMatchDefense.evaluate(input);

  assert.equal(signal.outcome, "pass");
  assert.ok(signal.weight > 0);
  assert.equal(signal.enablesGreen, false);
});

test("no coincide ni cuenta ni beneficiario, ambos legibles → fail", async () => {
  const input = makeInput(
    { destinationAccount: "1112223334", beneficiary: "Otro Negocio Distinto" },
    {
      business: {
        businessId: "biz_1",
        declaredAccountLast4: "9999",
        declaredBeneficiary: "Panadería Ejemplo SAS",
      },
      receivedBankEmails: [],
    },
  );

  const signal = await accountMatchDefense.evaluate(input);

  assert.equal(signal.outcome, "fail");
  assert.equal(signal.enablesGreen, false);
});

test("sin dato legible de cuenta/beneficiario en el comprobante → not_applicable, nunca fail", async () => {
  const input = makeInput(
    { destinationAccount: "", beneficiary: "" },
    {
      business: {
        businessId: "biz_1",
        declaredAccountLast4: "4567",
        declaredBeneficiary: "Panadería Ejemplo SAS",
      },
      receivedBankEmails: [],
    },
  );

  const signal = await accountMatchDefense.evaluate(input);

  assert.equal(signal.outcome, "not_applicable");
  assert.equal(signal.weight, 0);
});

test("sin datos declarados por el negocio (nada que comparar) → not_applicable, nunca fail", async () => {
  const input = makeInput(
    {},
    {
      business: { businessId: "biz_1" },
      receivedBankEmails: [],
    },
  );

  const signal = await accountMatchDefense.evaluate(input);

  assert.equal(signal.outcome, "not_applicable");
});
