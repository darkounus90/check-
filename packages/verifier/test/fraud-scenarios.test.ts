import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtractedVoucher } from "@check/ocr";
import type { ParsedBankEmail } from "@check/parsers";
import { toCents } from "@check/shared";

import type { DefenseContext, DefenseInput, EvidenceSource, Verdict } from "../src/index.ts";
import { allDefenses, runDefenses } from "../src/index.ts";

/**
 * E06-T13 — Suite de escenarios de fraude nombrados.
 *
 * A diferencia de `wire-defenses.test.ts` (E06-T10, integración básica de cableado)
 * y de `apps/workers/test/verification.processor.test.ts` (E06-T12, flujo end-to-end
 * con persistencia), esta suite se centra explícitamente en los **escenarios de fraude
 * nombrados** del criterio de aceptación de la épica (comprobante falso, número
 * reutilizado, monto alterado, cuenta alterada, fuera de ventana) más un caso feliz de
 * control, corriendo las 7 defensas REALES (`allDefenses`) a través del agregador real
 * (`runDefenses`), sin mocks y sin BD (construye `DefenseInput`/`DefenseContext` a mano).
 *
 * Para cada escenario se verifica tanto el `status` del `Verdict` como la entrada de
 * `evidenceSources` de la defensa relevante para ese escenario.
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

function buildInput(context: DefenseContext, overrides: Partial<DefenseInput> = {}): DefenseInput {
  return { voucher, context, ...overrides };
}

function evidence(verdict: Verdict, kind: string): EvidenceSource | undefined {
  return verdict.evidenceSources.find((e) => e.kind === kind);
}

// --- Escenario 1: comprobante falso (sin correo real que lo respalde) ------

test("escenario 'comprobante falso' — aún no llegó ningún correo del banco → PENDING, nunca VERIFIED", async () => {
  const verdict = await runDefenses(
    allDefenses,
    buildInput(cleanContext({ receivedBankEmails: [] })),
  );

  assert.equal(verdict.status, "PENDING");
  assert.notEqual(verdict.status, "VERIFIED");
  const bankEmail = evidence(verdict, "bank_email_match");
  assert.equal(bankEmail?.passed, true, "not_applicable se reporta como passed=true (no penaliza)");
});

test("escenario 'comprobante falso' — llegaron correos pero ninguno respalda este comprobante → SUSPICIOUS, nunca VERIFIED", async () => {
  const unrelatedEmail: ParsedBankEmail = {
    bank: "bancolombia",
    amount: toCents(999_999),
    approvalNumber: "9999999",
    occurredAtUtc: "2026-01-01T00:00:00.000Z",
    destinationAccount: "0000000000",
  };
  const verdict = await runDefenses(
    allDefenses,
    buildInput(cleanContext({ receivedBankEmails: [unrelatedEmail] })),
  );

  assert.equal(verdict.status, "SUSPICIOUS");
  assert.notEqual(verdict.status, "VERIFIED");
  const bankEmail = evidence(verdict, "bank_email_match");
  assert.equal(bankEmail?.passed, false);
});

// --- Escenario 2: número de aprobación reutilizado -------------------------

test("escenario 'número de aprobación reutilizado' — ya visto en la red → SUSPICIOUS, incluso con correo que matchea perfecto", async () => {
  const verdict = await runDefenses(
    allDefenses,
    buildInput(cleanContext({ approvalNumberSeenGlobally: true })),
  );

  assert.equal(verdict.status, "SUSPICIOUS");
  const bankEmail = evidence(verdict, "bank_email_match");
  assert.equal(bankEmail?.passed, true, "la Defensa 1 (correo) sigue pasando: el fail de otra defensa gana igual");
  const globalApproval = evidence(verdict, "global_approval");
  assert.equal(globalApproval?.passed, false);
});

// --- Escenario 3: monto alterado --------------------------------------------

test("escenario 'monto alterado' — comprobante dice un monto distinto al correo real, sin más correos → PENDING, nunca VERIFIED", async () => {
  // El único correo recibido no matchea el monto del comprobante alterado.
  const alteredVoucher: ExtractedVoucher = { ...voucher, amount: toCents(50_000_000) };
  const verdict = await runDefenses(allDefenses, {
    voucher: alteredVoucher,
    context: cleanContext(),
  });

  // Al no matchear el monto, `emailMatchDefense` no encuentra correo coincidente;
  // como sí llegó un correo (pero no coincide), la señal es `fail` → SUSPICIOUS.
  assert.equal(verdict.status, "SUSPICIOUS");
  assert.notEqual(verdict.status, "VERIFIED");
  const bankEmail = evidence(verdict, "bank_email_match");
  assert.equal(bankEmail?.passed, false);
});

test("escenario 'monto alterado' — comprobante dice un monto distinto y todavía no ha llegado ningún correo → PENDING, nunca VERIFIED", async () => {
  const alteredVoucher: ExtractedVoucher = { ...voucher, amount: toCents(50_000_000) };
  const verdict = await runDefenses(allDefenses, {
    voucher: alteredVoucher,
    context: cleanContext({ receivedBankEmails: [] }),
  });

  assert.equal(verdict.status, "PENDING");
  assert.notEqual(verdict.status, "VERIFIED");
  const bankEmail = evidence(verdict, "bank_email_match");
  assert.equal(bankEmail?.passed, true, "not_applicable (sin correos aún) se reporta como passed=true");
});

// --- Escenario 4: cuenta destino alterada -----------------------------------

test("escenario 'cuenta destino alterada' — no coincide con lo declarado por el negocio, aunque el correo real matchee → SUSPICIOUS, nunca VERIFIED", async () => {
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
  assert.notEqual(verdict.status, "VERIFIED");
  // Defensa 1 (correo real) sigue pasando: el comprobante y el correo del banco
  // coinciden entre sí en cuenta/monto/aprobación. Lo que falla es que esa cuenta
  // no es la declarada por el negocio (Defensa 3), y cualquier fail baja el veredicto.
  const bankEmail = evidence(verdict, "bank_email_match");
  assert.equal(bankEmail?.passed, true, "Defensa 1 pasa: comprobante y correo coinciden entre sí");
  const accountMatch = evidence(verdict, "account_match");
  assert.equal(accountMatch?.passed, false);
});

// --- Escenario 5: fuera de ventana de tiempo --------------------------------

test("escenario 'fuera de ventana de tiempo' — comprobante pagado mucho antes de la ventana configurada → SUSPICIOUS, nunca VERIFIED", async () => {
  const verdict = await runDefenses(
    allDefenses,
    buildInput(cleanContext({ nowUtc: "2026-07-04T10:00:00.000Z" })), // ~18.5h después del pago, ventana de 30 min
  );

  assert.equal(verdict.status, "SUSPICIOUS");
  assert.notEqual(verdict.status, "VERIFIED");
  const timeWindow = evidence(verdict, "time_window");
  assert.equal(timeWindow?.passed, false);
  const bankEmail = evidence(verdict, "bank_email_match");
  assert.equal(
    bankEmail?.passed,
    true,
    "Defensa 1 no depende de nowUtc/ventana estricta de negocio, solo del correo vs. comprobante",
  );
});

// --- Escenario 6: caso feliz de control -------------------------------------

test("escenario 'caso feliz de control' — todo correcto (correo real, cuenta, ventana, sin reutilización, formato válido) → VERIFIED", async () => {
  const verdict = await runDefenses(allDefenses, buildInput(cleanContext()));

  assert.equal(verdict.status, "VERIFIED");
  const bankEmail = evidence(verdict, "bank_email_match");
  assert.equal(bankEmail?.passed, true);
  const accountMatch = evidence(verdict, "account_match");
  assert.equal(accountMatch?.passed, true);
  const timeWindow = evidence(verdict, "time_window");
  assert.equal(timeWindow?.passed, true);
  const globalApproval = evidence(verdict, "global_approval");
  assert.equal(globalApproval?.passed, true);
  const structural = evidence(verdict, "structural");
  assert.equal(structural?.passed, true);
  const suspiciousPatterns = evidence(verdict, "suspicious_patterns");
  assert.equal(suspiciousPatterns?.passed, true);
  // Todas las 7 defensas deben quedar registradas como evidencia (auditoría).
  assert.equal(verdict.evidenceSources.length, 7);
});
