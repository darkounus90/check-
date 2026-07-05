import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtractedVoucher } from "@check/ocr";
import { toCents } from "@check/shared";

import type { DefenseInput } from "../src/index.ts";
import { runDefenses } from "../src/index.ts";
import { mockDefense } from "./mock-defense.ts";

const voucher: ExtractedVoucher = {
  issuerBank: "nequi",
  amount: toCents(5_000_000),
  approvalNumber: "1234567",
  paidAtUtc: "2026-07-03T15:30:00.000Z",
  destinationAccount: "3001234567",
  beneficiary: "Panaderia Ejemplo",
};

const input: DefenseInput = {
  voucher,
  context: {
    business: { businessId: "biz_1" },
    receivedBankEmails: [],
  },
};

test("todas pasan y la Defensa 1 habilita verde → VERIFIED", async () => {
  const verdict = await runDefenses(
    [
      mockDefense({ kind: "bank_email", outcome: "pass", enablesGreen: true }),
      mockDefense({ kind: "global_approval", outcome: "pass" }),
    ],
    input,
  );

  assert.equal(verdict.status, "VERIFIED");
  assert.equal(verdict.evidenceSources.length, 2);
  assert.ok(verdict.evidenceSources.every((e) => e.passed));
});

test("una defensa falla → SUSPICIOUS aunque la Defensa 1 pase", async () => {
  const verdict = await runDefenses(
    [
      mockDefense({ kind: "bank_email", outcome: "pass", enablesGreen: true }),
      mockDefense({ kind: "global_approval", outcome: "fail", detail: "número ya usado" }),
    ],
    input,
  );

  assert.equal(verdict.status, "SUSPICIOUS");
  const failed = verdict.evidenceSources.find((e) => e.kind === "global_approval");
  assert.equal(failed?.passed, false);
  assert.equal(failed?.detail, "número ya usado");
});

test("regla dura: la Defensa 1 (enablesGreen) falla y el resto pasa → SUSPICIOUS, no VERIFIED", async () => {
  const verdict = await runDefenses(
    [
      mockDefense({
        kind: "bank_email",
        outcome: "fail",
        enablesGreen: true,
        detail: "monto no coincide con el correo",
      }),
      mockDefense({ kind: "global_approval", outcome: "pass" }),
      mockDefense({ kind: "destination_account", outcome: "pass" }),
    ],
    input,
  );

  assert.equal(verdict.status, "SUSPICIOUS");
  const bankEmail = verdict.evidenceSources.find((e) => e.kind === "bank_email");
  assert.equal(bankEmail?.passed, false);
});

test("regla dura: sin Defensa 1 configurada, nunca VERIFIED aunque el resto pase", async () => {
  const verdict = await runDefenses(
    [
      mockDefense({ kind: "global_approval", outcome: "pass" }),
      mockDefense({ kind: "destination_account", outcome: "pass" }),
    ],
    input,
  );

  assert.equal(verdict.status, "PENDING");
});

test("regla dura: Defensa 1 aún no confirma (correo no llega) → PENDING, no SUSPICIOUS", async () => {
  const verdict = await runDefenses(
    [
      mockDefense({ kind: "bank_email", outcome: "not_applicable", enablesGreen: true }),
      mockDefense({ kind: "global_approval", outcome: "pass" }),
    ],
    input,
  );

  assert.equal(verdict.status, "PENDING");
});

test("D4: destino ilegible (not_applicable) no penaliza por sí solo → sigue VERIFIED", async () => {
  const verdict = await runDefenses(
    [
      mockDefense({ kind: "bank_email", outcome: "pass", enablesGreen: true }),
      mockDefense({
        kind: "destination_account",
        outcome: "not_applicable",
        detail: "cuenta destino ilegible",
      }),
    ],
    input,
  );

  assert.equal(verdict.status, "VERIFIED");
  const destino = verdict.evidenceSources.find((e) => e.kind === "destination_account");
  assert.equal(destino?.passed, true);
  assert.equal(destino?.detail, "cuenta destino ilegible");
});

test("soporta defensas asíncronas (I/O real)", async () => {
  const verdict = await runDefenses(
    [
      mockDefense({ kind: "bank_email", outcome: "pass", enablesGreen: true, async: true }),
      mockDefense({ kind: "global_approval", outcome: "pass", async: true }),
    ],
    input,
  );

  assert.equal(verdict.status, "VERIFIED");
});

test("el veredicto es determinista para las mismas señales", async () => {
  const defenses = [
    mockDefense({ kind: "bank_email", outcome: "pass", enablesGreen: true }),
    mockDefense({ kind: "global_approval", outcome: "pass" }),
    mockDefense({ kind: "destination_account", outcome: "not_applicable" }),
  ];

  const first = await runDefenses(defenses, input);
  const second = await runDefenses(defenses, input);

  assert.deepEqual(first, second);
});
