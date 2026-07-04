import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { assessOcrQuality, detectIssuerBank, extractVoucher } from "../src/index.ts";

interface Expected {
  file: string;
  bank: string;
  amount: number;
  approvalNumber: string;
  destinationAccount: string;
  paidAtUtc: string;
}

const cases: Expected[] = [
  {
    file: "nequi-1.txt",
    bank: "nequi",
    amount: 5_000_000,
    approvalNumber: "1234567",
    destinationAccount: "3001234567",
    paidAtUtc: "2026-07-03T15:30:00.000Z",
  },
  {
    file: "bancolombia-1.txt",
    bank: "bancolombia",
    amount: 12_000_000,
    approvalNumber: "998877",
    destinationAccount: "1234",
    paidAtUtc: "2026-07-03T16:15:00.000Z",
  },
  {
    file: "daviplata-1.txt",
    bank: "daviplata",
    amount: 3_000_000,
    approvalNumber: "55667788",
    destinationAccount: "3109998888",
    paidAtUtc: "2026-07-03T14:00:00.000Z",
  },
  {
    file: "davivienda-1.txt",
    bank: "davivienda",
    amount: 8_000_000,
    approvalNumber: "123456",
    destinationAccount: "5566",
    paidAtUtc: "2026-07-03T19:05:00.000Z",
  },
  {
    file: "bbva-1.txt",
    bank: "bbva",
    amount: 9_500_000,
    approvalNumber: "456789",
    destinationAccount: "7788",
    paidAtUtc: "2026-07-03T21:20:00.000Z",
  },
  {
    file: "banco-de-bogota-1.txt",
    bank: "banco_de_bogota",
    amount: 6_000_000,
    approvalNumber: "7654321",
    destinationAccount: "3344",
    paidAtUtc: "2026-07-03T13:45:00.000Z",
  },
  {
    file: "colpatria-1.txt",
    bank: "colpatria",
    amount: 4_500_000,
    approvalNumber: "246810",
    destinationAccount: "2233",
    paidAtUtc: "2026-07-03T18:30:00.000Z",
  },
];

for (const c of cases) {
  test(`extrae ${c.file}`, () => {
    const raw = readFileSync(new URL(`./fixtures/${c.file}`, import.meta.url), "utf8");
    assert.equal(detectIssuerBank(raw), c.bank, "detector de banco emisor");
    const result = extractVoucher(raw);
    assert.equal(result.ok, true, result.ok ? "" : result.error);
    if (!result.ok) return;
    assert.equal(result.value.issuerBank, c.bank);
    assert.equal(result.value.amount, c.amount, "monto en centavos");
    assert.equal(result.value.approvalNumber, c.approvalNumber);
    assert.equal(result.value.destinationAccount, c.destinationAccount);
    assert.equal(result.value.paidAtUtc, c.paidAtUtc, "fecha UTC");
  });
}

test("comprobante no reconocido → error", () => {
  assert.equal(extractVoucher("una imagen cualquiera sin banco").ok, false);
});

test("calidad: texto pobre pide mejor foto (no falso rechazo)", () => {
  const bad = assessOcrQuality("borroso");
  assert.equal(bad.ok, false);
  assert.ok(bad.reason && bad.reason.length > 0);
  const good = assessOcrQuality("Nequi Enviaste $50.000 Comprobante 123 03/07/2026 10:30");
  assert.equal(good.ok, true);
});
