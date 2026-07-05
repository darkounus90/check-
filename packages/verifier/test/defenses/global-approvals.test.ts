import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtractedVoucher } from "@check/ocr";
import { toCents } from "@check/shared";

import { globalApprovalsDefense } from "../../src/defenses/global-approvals.ts";
import type { DefenseInput } from "../../src/index.ts";

const voucher: ExtractedVoucher = {
  issuerBank: "nequi",
  amount: toCents(5_000_000),
  approvalNumber: "1234567",
  paidAtUtc: "2026-07-03T15:30:00.000Z",
  destinationAccount: "3001234567",
  beneficiary: "Panaderia Ejemplo",
};

function inputWith(approvalNumberSeenGlobally: boolean | undefined): DefenseInput {
  return {
    voucher,
    context: {
      business: { businessId: "biz_1" },
      receivedBankEmails: [],
      approvalNumberSeenGlobally,
    },
  };
}

test("kind es 'global_approval'", () => {
  assert.equal(globalApprovalsDefense.kind, "global_approval");
});

test("número reutilizado (true) → fail, sin enablesGreen", async () => {
  const signal = await globalApprovalsDefense.evaluate(inputWith(true));

  assert.equal(signal.kind, "global_approval");
  assert.equal(signal.outcome, "fail");
  assert.equal(signal.enablesGreen, false);
  assert.ok(signal.detail && signal.detail.length > 0);
});

test("número no visto (false) → pass, sin enablesGreen (no es la Defensa 1)", async () => {
  const signal = await globalApprovalsDefense.evaluate(inputWith(false));

  assert.equal(signal.kind, "global_approval");
  assert.equal(signal.outcome, "pass");
  assert.equal(signal.enablesGreen, false);
});

test("indeterminado (undefined, no se pudo verificar) → not_applicable, no penaliza por falta de dato (D4 aplicado por analogía)", async () => {
  const signal = await globalApprovalsDefense.evaluate(inputWith(undefined));

  assert.equal(signal.kind, "global_approval");
  assert.equal(signal.outcome, "not_applicable");
  assert.equal(signal.weight, 0);
  assert.equal(signal.enablesGreen, false);
  assert.ok(signal.detail && signal.detail.length > 0);
});

test("indeterminado (contexto sin el campo definido) se comporta igual que undefined explícito → not_applicable", async () => {
  const input: DefenseInput = {
    voucher,
    context: {
      business: { businessId: "biz_1" },
      receivedBankEmails: [],
    },
  };

  const signal = await globalApprovalsDefense.evaluate(input);

  assert.equal(signal.outcome, "not_applicable");
});
