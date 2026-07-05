import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtractedVoucher } from "@check/ocr";
import type { ParsedBankEmail } from "@check/parsers";
import { toCents } from "@check/shared";

import type { DefenseContext, DefenseInput } from "../src/index.ts";
import { allDefenses, runDefenses } from "../src/index.ts";

/**
 * Integración final de la Épica 6 (E06-T10): corre las 7 defensas REALES
 * (`allDefenses`, sin mocks) a través del agregador real (`runDefenses`) sobre
 * escenarios construidos a mano.
 *
 * Cubre explícitamente la aceptación de esta tarea — **ningún camino produce
 * VERIFIED (🟢) sin que la Defensa 1 (cruce con correo real del banco receptor,
 * `bank_email_match`) haya pasado** — además de la distinción de producto decidida
 * en esta tarea entre "aún no llegó el correo" (PENDING, se reintenta) y "llegó un
 * correo pero no coincide" (SUSPICIOUS, señal fuerte de fraude).
 */

const voucher: ExtractedVoucher = {
  issuerBank: "nequi",
  amount: toCents(5_000_000),
  approvalNumber: "1234567", // 7 dígitos: formato válido para nequi (Defensa 6).
  paidAtUtc: "2026-07-03T15:30:00.000Z",
  destinationAccount: "3001234567",
  beneficiary: "Panaderia Ejemplo",
};

const matchingEmail: ParsedBankEmail = {
  bank: "bancolombia",
  amount: voucher.amount,
  approvalNumber: voucher.approvalNumber,
  occurredAtUtc: "2026-07-03T15:35:00.000Z", // +5 min respecto al pago.
  destinationAccount: voucher.destinationAccount,
};

/** Contexto "todo perfecto": correo real matchea, cuenta/beneficiario declarados
 * coinciden, número no reutilizado, dentro de ventana, sin intentos fallidos. */
function cleanContext(overrides: Partial<DefenseContext> = {}): DefenseContext {
  return {
    business: {
      businessId: "biz_1",
      declaredAccountLast4: "4567",
      declaredBeneficiary: "Panaderia Ejemplo",
      verificationWindowMinutes: 30,
    },
    receivedBankEmails: [matchingEmail],
    approvalNumberSeenGlobally: false,
    recentFailedAttemptsByClient: 0,
    nowUtc: "2026-07-03T15:40:00.000Z", // +10 min respecto al pago, dentro de ventana de 30.
    ...overrides,
  };
}

function buildInput(context: DefenseContext): DefenseInput {
  return { voucher, context };
}

test("escenario limpio: correo real matchea + las otras 6 defensas en orden → VERIFIED", async () => {
  const verdict = await runDefenses(allDefenses, buildInput(cleanContext()));

  assert.equal(verdict.status, "VERIFIED");
  assert.ok(verdict.evidenceSources.every((e) => e.passed || e.kind === "image_forensics"));
  const bankEmail = verdict.evidenceSources.find((e) => e.kind === "bank_email_match");
  assert.equal(bankEmail?.passed, true);
});

test("número de aprobación reutilizado (Defensa 2 falla) aunque el correo matchee → SUSPICIOUS", async () => {
  const verdict = await runDefenses(
    allDefenses,
    buildInput(cleanContext({ approvalNumberSeenGlobally: true })),
  );

  assert.equal(verdict.status, "SUSPICIOUS");
  const bankEmail = verdict.evidenceSources.find((e) => e.kind === "bank_email_match");
  assert.equal(bankEmail?.passed, true, "la Defensa 1 sigue pasando: el fail de otra defensa gana igual");
  const globalApproval = verdict.evidenceSources.find((e) => e.kind === "global_approval");
  assert.equal(globalApproval?.passed, false);
});

test("sin correo real todavía (nada recibido) pero todo lo demás perfecto → PENDING, nunca VERIFIED", async () => {
  const verdict = await runDefenses(
    allDefenses,
    buildInput(cleanContext({ receivedBankEmails: [] })),
  );

  assert.equal(verdict.status, "PENDING");
  assert.notEqual(verdict.status, "VERIFIED");
  const bankEmail = verdict.evidenceSources.find((e) => e.kind === "bank_email_match");
  assert.equal(bankEmail?.passed, true, "not_applicable se reporta como passed=true (no penaliza)");
});

test("llegó un correo pero no coincide con el comprobante → SUSPICIOUS (señal más fuerte que 'aún no llega')", async () => {
  const mismatchedEmail: ParsedBankEmail = { ...matchingEmail, approvalNumber: "0000000" };
  const verdict = await runDefenses(
    allDefenses,
    buildInput(cleanContext({ receivedBankEmails: [mismatchedEmail] })),
  );

  assert.equal(verdict.status, "SUSPICIOUS");
  const bankEmail = verdict.evidenceSources.find((e) => e.kind === "bank_email_match");
  assert.equal(bankEmail?.passed, false);
});

test("Defensa 3 (cuenta/beneficiario) falla aunque el correo matchee → SUSPICIOUS, no VERIFIED", async () => {
  const verdict = await runDefenses(
    allDefenses,
    buildInput(
      cleanContext({
        business: {
          businessId: "biz_1",
          declaredAccountLast4: "9999",
          declaredBeneficiary: "Otro Negocio Completamente Distinto",
          verificationWindowMinutes: 30,
        },
      }),
    ),
  );

  assert.equal(verdict.status, "SUSPICIOUS");
  const accountMatch = verdict.evidenceSources.find((e) => e.kind === "account_match");
  assert.equal(accountMatch?.passed, false);
});

test("Defensa 4 (ventana de tiempo estricta) falla aunque el correo matchee → SUSPICIOUS, no VERIFIED", async () => {
  const verdict = await runDefenses(
    allDefenses,
    buildInput(cleanContext({ nowUtc: "2026-07-03T20:00:00.000Z" })), // +4.5h, fuera de ventana de 30 min
  );

  assert.equal(verdict.status, "SUSPICIOUS");
  const timeWindow = verdict.evidenceSources.find((e) => e.kind === "time_window");
  assert.equal(timeWindow?.passed, false);
  const bankEmail = verdict.evidenceSources.find((e) => e.kind === "bank_email_match");
  assert.equal(bankEmail?.passed, true, "Defensa 1 no depende de nowUtc, solo del correo vs comprobante");
});

test("Defensa 6 (formato estructural) falla aunque el correo matchee → SUSPICIOUS, no VERIFIED", async () => {
  const invalidVoucher: ExtractedVoucher = { ...voucher, approvalNumber: "AB12C45" };
  const invalidEmail: ParsedBankEmail = { ...matchingEmail, approvalNumber: "AB12C45" };
  const verdict = await runDefenses(allDefenses, {
    voucher: invalidVoucher,
    context: cleanContext({ receivedBankEmails: [invalidEmail] }),
  });

  assert.equal(verdict.status, "SUSPICIOUS");
  const structural = verdict.evidenceSources.find((e) => e.kind === "structural");
  assert.equal(structural?.passed, false);
});

test("Defensa 7 (patrones sospechosos) falla aunque el correo matchee → SUSPICIOUS, no VERIFIED", async () => {
  const verdict = await runDefenses(
    allDefenses,
    buildInput(cleanContext({ recentFailedAttemptsByClient: 10 })),
  );

  assert.equal(verdict.status, "SUSPICIOUS");
  const suspiciousPatterns = verdict.evidenceSources.find((e) => e.kind === "suspicious_patterns");
  assert.equal(suspiciousPatterns?.passed, false);
});

test("regla dura: barrido de escenarios donde la Defensa 1 no pasa a 'pass' → ninguno da VERIFIED", async () => {
  const scenarios: DefenseContext[] = [
    cleanContext({ receivedBankEmails: [] }), // aún no llega el correo
    cleanContext({ receivedBankEmails: [{ ...matchingEmail, amount: toCents(1) }] }), // monto no coincide
    cleanContext({
      receivedBankEmails: [{ ...matchingEmail, destinationAccount: "9998887777" }],
    }), // cuenta no coincide
  ];

  for (const context of scenarios) {
    const verdict = await runDefenses(allDefenses, buildInput(context));
    assert.notEqual(
      verdict.status,
      "VERIFIED",
      `no debería ser VERIFIED sin Defensa 1 en pass: ${JSON.stringify(context.receivedBankEmails)}`,
    );
  }
});

test("regla dura: aunque las otras 6 defensas pasen perfecto, sin Defensa 1 en pass nunca hay VERIFIED", async () => {
  // Mismo escenario "limpio" que el primer test, pero forzando que el correo no
  // llegue (única variable que cambia) — debe perder la posibilidad de VERIFIED.
  const verdict = await runDefenses(
    allDefenses,
    buildInput(cleanContext({ receivedBankEmails: [] })),
  );

  const evidenceExceptBankEmail = verdict.evidenceSources.filter((e) => e.kind !== "bank_email_match");
  assert.ok(
    evidenceExceptBankEmail.every((e) => e.passed),
    "las otras 6 defensas deben seguir pasando en este escenario",
  );
  assert.notEqual(verdict.status, "VERIFIED");
  assert.equal(verdict.status, "PENDING");
});
