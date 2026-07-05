import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtractedVoucher } from "@check/ocr";
import { toCents } from "@check/shared";

import {
  DEFAULT_FAILED_ATTEMPTS_THRESHOLD,
  suspiciousPatternsDefense,
} from "../../src/defenses/suspicious-patterns.ts";
import type { DefenseContext, DefenseInput } from "../../src/index.ts";

const voucher: ExtractedVoucher = {
  issuerBank: "nequi",
  amount: toCents(5_000_000),
  approvalNumber: "1234567",
  paidAtUtc: "2026-07-03T15:30:00.000Z",
  destinationAccount: "3001234567",
  beneficiary: "Panaderia Ejemplo",
};

function inputWith(context: Partial<DefenseContext> = {}): DefenseInput {
  return {
    voucher,
    context: {
      business: { businessId: "biz_1" },
      receivedBankEmails: [],
      ...context,
    },
  };
}

test("kind es 'suspicious_patterns'", () => {
  assert.equal(suspiciousPatternsDefense.kind, "suspicious_patterns");
});

test("intentos fallidos por encima del umbral por defecto → fail, sin enablesGreen", async () => {
  const signal = await suspiciousPatternsDefense.evaluate(
    inputWith({ recentFailedAttemptsByClient: DEFAULT_FAILED_ATTEMPTS_THRESHOLD + 1 }),
  );

  assert.equal(signal.kind, "suspicious_patterns");
  assert.equal(signal.outcome, "fail");
  assert.equal(signal.enablesGreen, false);
  assert.ok(signal.detail && signal.detail.length > 0);
});

test("intentos fallidos por debajo del umbral por defecto → pass", async () => {
  const signal = await suspiciousPatternsDefense.evaluate(
    inputWith({ recentFailedAttemptsByClient: DEFAULT_FAILED_ATTEMPTS_THRESHOLD - 1 }),
  );

  assert.equal(signal.outcome, "pass");
  assert.equal(signal.enablesGreen, false);
});

test("intentos fallidos exactamente en el umbral → pass (el umbral se supera estrictamente, no se iguala)", async () => {
  const signal = await suspiciousPatternsDefense.evaluate(
    inputWith({ recentFailedAttemptsByClient: DEFAULT_FAILED_ATTEMPTS_THRESHOLD }),
  );

  assert.equal(signal.outcome, "pass");
});

test("sin dato (undefined) se trata como 0 intentos → pass, no penaliza por falta de dato", async () => {
  const signal = await suspiciousPatternsDefense.evaluate(inputWith());

  assert.equal(signal.outcome, "pass");
});

test("umbral configurable por negocio: por debajo del umbral personalizado → pass aunque supere el default", async () => {
  const signal = await suspiciousPatternsDefense.evaluate({
    voucher,
    context: {
      business: { businessId: "biz_1", failedAttemptsThreshold: 10 },
      receivedBankEmails: [],
      recentFailedAttemptsByClient: DEFAULT_FAILED_ATTEMPTS_THRESHOLD + 1,
    },
  });

  assert.equal(signal.outcome, "pass");
});

test("umbral configurable por negocio: por encima del umbral personalizado → fail", async () => {
  const signal = await suspiciousPatternsDefense.evaluate({
    voucher,
    context: {
      business: { businessId: "biz_1", failedAttemptsThreshold: 2 },
      receivedBankEmails: [],
      recentFailedAttemptsByClient: 3,
    },
  });

  assert.equal(signal.outcome, "fail");
});

test("D5: ningún valor de nowUtc (horarios) produce fail — la sub-señal de horarios está apagada en el MVP", async () => {
  const horas = [
    "2026-07-03T00:00:00.000Z",
    "2026-07-03T03:00:00.000Z",
    "2026-07-03T06:00:00.000Z",
    "2026-07-03T09:00:00.000Z",
    "2026-07-03T12:00:00.000Z",
    "2026-07-03T15:00:00.000Z",
    "2026-07-03T18:00:00.000Z",
    "2026-07-03T21:00:00.000Z",
    "2026-07-03T23:59:59.000Z",
  ];

  for (const nowUtc of horas) {
    const signal = await suspiciousPatternsDefense.evaluate(inputWith({ nowUtc }));
    assert.equal(
      signal.outcome,
      "pass",
      `nowUtc=${nowUtc} no debería producir fail (D5: horarios apagados en MVP)`,
    );
  }
});
