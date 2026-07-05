import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtractedVoucher } from "@check/ocr";
import { toCents } from "@check/shared";

import { structuralDefense } from "../../src/defenses/structural.ts";
import type { DefenseInput } from "../../src/index.ts";

function inputWith(overrides: Partial<ExtractedVoucher>): DefenseInput {
  const voucher: ExtractedVoucher = {
    issuerBank: "nequi",
    amount: toCents(5_000_000),
    approvalNumber: "1234567",
    paidAtUtc: "2026-07-03T15:30:00.000Z",
    destinationAccount: "3001234567",
    beneficiary: "Panaderia Ejemplo",
    ...overrides,
  };

  return {
    voucher,
    context: {
      business: { businessId: "biz_1" },
      receivedBankEmails: [],
    },
  };
}

test("kind es 'structural'", () => {
  assert.equal(structuralDefense.kind, "structural");
});

test("nequi: número de 7 dígitos (fixture real) → pass, sin enablesGreen", async () => {
  const signal = await structuralDefense.evaluate(
    inputWith({ issuerBank: "nequi", approvalNumber: "1234567" }),
  );

  assert.equal(signal.outcome, "pass");
  assert.equal(signal.enablesGreen, false);
});

test("bancolombia: número de 6 dígitos (fixture real) → pass", async () => {
  const signal = await structuralDefense.evaluate(
    inputWith({ issuerBank: "bancolombia", approvalNumber: "998877" }),
  );

  assert.equal(signal.outcome, "pass");
});

test("daviplata: número de 8 dígitos (fixture real) → pass", async () => {
  const signal = await structuralDefense.evaluate(
    inputWith({ issuerBank: "daviplata", approvalNumber: "55667788" }),
  );

  assert.equal(signal.outcome, "pass");
});

test("davivienda: número de 6 dígitos (fixture real) → pass", async () => {
  const signal = await structuralDefense.evaluate(
    inputWith({ issuerBank: "davivienda", approvalNumber: "123456" }),
  );

  assert.equal(signal.outcome, "pass");
});

test("bbva: número de 6 dígitos (fixture real) → pass", async () => {
  const signal = await structuralDefense.evaluate(
    inputWith({ issuerBank: "bbva", approvalNumber: "456789" }),
  );

  assert.equal(signal.outcome, "pass");
});

test("banco_de_bogota: número de 7 dígitos (fixture real) → pass", async () => {
  const signal = await structuralDefense.evaluate(
    inputWith({ issuerBank: "banco_de_bogota", approvalNumber: "7654321" }),
  );

  assert.equal(signal.outcome, "pass");
});

test("colpatria: número de 6 dígitos (fixture real) → pass", async () => {
  const signal = await structuralDefense.evaluate(
    inputWith({ issuerBank: "colpatria", approvalNumber: "246810" }),
  );

  assert.equal(signal.outcome, "pass");
});

test("nequi: número con letras → fail (formato inválido)", async () => {
  const signal = await structuralDefense.evaluate(
    inputWith({ issuerBank: "nequi", approvalNumber: "AB12C45" }),
  );

  assert.equal(signal.outcome, "fail");
  assert.equal(signal.enablesGreen, false);
  assert.ok(signal.detail && signal.detail.includes("no numéricos"));
});

test("bancolombia: número con longitud absurda → fail", async () => {
  const signal = await structuralDefense.evaluate(
    inputWith({ issuerBank: "bancolombia", approvalNumber: "1234567890123456" }),
  );

  assert.equal(signal.outcome, "fail");
  assert.ok(signal.detail && signal.detail.includes("fuera del rango"));
});

test("colpatria: número demasiado corto (1 dígito) → fail", async () => {
  const signal = await structuralDefense.evaluate(
    inputWith({ issuerBank: "colpatria", approvalNumber: "1" }),
  );

  assert.equal(signal.outcome, "fail");
});

test("approvalNumber ausente (vacío) → not_applicable, no penaliza", async () => {
  const signal = await structuralDefense.evaluate(inputWith({ approvalNumber: "" }));

  assert.equal(signal.outcome, "not_applicable");
  assert.equal(signal.weight, 0);
  assert.equal(signal.enablesGreen, false);
});

test("issuerBank ausente (vacío) → not_applicable, no penaliza", async () => {
  const signal = await structuralDefense.evaluate(inputWith({ issuerBank: "" }));

  assert.equal(signal.outcome, "not_applicable");
  assert.equal(signal.weight, 0);
});

test("banco no reconocido (sin regla en la tabla) → not_applicable, no inventa regla", async () => {
  const signal = await structuralDefense.evaluate(
    inputWith({ issuerBank: "banco_desconocido_xyz", approvalNumber: "12345" }),
  );

  assert.equal(signal.outcome, "not_applicable");
  assert.ok(signal.detail && signal.detail.includes("banco_desconocido_xyz"));
});
