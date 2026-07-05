import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtractedVoucher } from "@check/ocr";
import { toCents } from "@check/shared";

import { timeWindowDefense } from "../../src/defenses/time-window.ts";
import type { DefenseInput } from "../../src/index.ts";

const voucher: ExtractedVoucher = {
  issuerBank: "nequi",
  amount: toCents(5_000_000),
  approvalNumber: "1234567",
  paidAtUtc: "2026-07-03T15:30:00.000Z",
  destinationAccount: "3001234567",
  beneficiary: "Panaderia Ejemplo",
};

function buildInput(overrides: Partial<DefenseInput["context"]> = {}): DefenseInput {
  return {
    voucher,
    context: {
      business: { businessId: "biz_1", verificationWindowMinutes: 60 },
      receivedBankEmails: [],
      nowUtc: "2026-07-03T16:00:00.000Z",
      ...overrides,
    },
  };
}

test("dentro de la ventana configurada → pass", () => {
  const signal = timeWindowDefense.evaluate(buildInput());

  assert.equal(signal.kind, "time_window");
  assert.equal(signal.outcome, "pass");
  assert.equal(signal.enablesGreen, false);
});

test("fuera de la ventana configurada → fail", () => {
  const signal = timeWindowDefense.evaluate(
    buildInput({ nowUtc: "2026-07-03T18:00:00.000Z" }),
  );

  assert.equal(signal.outcome, "fail");
  assert.match(signal.detail ?? "", /fuera de la ventana/);
});

test("comprobante pagado en el futuro respecto a nowUtc también cae fuera de ventana", () => {
  const signal = timeWindowDefense.evaluate(
    buildInput({ nowUtc: "2026-07-03T13:00:00.000Z" }),
  );

  assert.equal(signal.outcome, "fail");
});

test("ventana configurable distinta por negocio cambia el resultado para el mismo comprobante", () => {
  const input = buildInput({ nowUtc: "2026-07-03T18:00:00.000Z" });

  const strict = timeWindowDefense.evaluate({
    ...input,
    context: { ...input.context, business: { businessId: "biz_1", verificationWindowMinutes: 60 } },
  });
  const lenient = timeWindowDefense.evaluate({
    ...input,
    context: {
      ...input.context,
      business: { businessId: "biz_2", verificationWindowMinutes: 24 * 60 },
    },
  });

  assert.equal(strict.outcome, "fail");
  assert.equal(lenient.outcome, "pass");
});

test("sin nowUtc → not_applicable, no penaliza", () => {
  const input = buildInput();
  const signal = timeWindowDefense.evaluate({
    ...input,
    context: { ...input.context, nowUtc: undefined },
  });

  assert.equal(signal.outcome, "not_applicable");
  assert.equal(signal.weight, 0);
});

test("sin verificationWindowMinutes configurado → not_applicable, no penaliza", () => {
  const input = buildInput();
  const signal = timeWindowDefense.evaluate({
    ...input,
    context: {
      ...input.context,
      business: { businessId: "biz_1", verificationWindowMinutes: undefined },
    },
  });

  assert.equal(signal.outcome, "not_applicable");
});

test("fechas no parseables → not_applicable", () => {
  const signal = timeWindowDefense.evaluate({
    voucher: { ...voucher, paidAtUtc: "no-es-una-fecha" },
    context: buildInput().context,
  });

  assert.equal(signal.outcome, "not_applicable");
});

test("determinista: mismo input produce misma señal", () => {
  const input = buildInput();

  const first = timeWindowDefense.evaluate(input);
  const second = timeWindowDefense.evaluate(input);

  assert.deepEqual(first, second);
});
