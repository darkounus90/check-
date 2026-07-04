import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseBankEmail } from "../src/index.ts";

interface Expected {
  file: string;
  bank: string;
  amount: number;
  approvalNumber: string;
  destinationAccount: string;
  occurredAtUtc: string;
}

const cases: Expected[] = [
  {
    file: "bancolombia-1.txt",
    bank: "bancolombia",
    amount: 15_000_000,
    approvalNumber: "9087654321",
    destinationAccount: "8842",
    occurredAtUtc: "2026-07-03T19:22:00.000Z",
  },
  {
    file: "davivienda-1.txt",
    bank: "davivienda",
    amount: 7_550_000,
    approvalNumber: "5566778899",
    destinationAccount: "001234",
    occurredAtUtc: "2026-07-03T14:15:00.000Z",
  },
  {
    file: "bbva-1.txt",
    bank: "bbva",
    amount: 22_000_000,
    approvalNumber: "123456789",
    destinationAccount: "4455",
    occurredAtUtc: "2026-07-03T21:40:00.000Z",
  },
];

for (const c of cases) {
  test(`parsea ${c.file}`, () => {
    const raw = readFileSync(new URL(`./fixtures/${c.file}`, import.meta.url), "utf8");
    const result = parseBankEmail(raw);
    assert.equal(result.ok, true, result.ok ? "" : result.error);
    if (!result.ok) return;
    assert.equal(result.value.bank, c.bank);
    assert.equal(result.value.amount, c.amount, "monto en centavos");
    assert.equal(result.value.approvalNumber, c.approvalNumber);
    assert.equal(result.value.destinationAccount, c.destinationAccount);
    assert.equal(result.value.occurredAtUtc, c.occurredAtUtc, "fecha UTC");
  });
}

test("correo no reconocido devuelve error (no crashea)", () => {
  const result = parseBankEmail("Hola, esto no es un correo bancario.");
  assert.equal(result.ok, false);
});
