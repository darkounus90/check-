import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregateSignals, failSignal, notApplicableSignal, passSignal } from "@check/verifier";
import type { Verdict } from "@check/verifier";

import {
  persistVerdict,
  type EvidenceSourceCreateData,
  type MoneyOpLogCreateData,
  type TransactionRecord,
  type VerificationStore,
  type VerificationTransactionClient,
} from "../src/verification/verification.service";

/**
 * Tests unitarios de la persistencia del veredicto (E06-T11), con un Prisma fake en
 * memoria (sin BD real). Simula `voucherId` como clave única de `Transaction`, igual
 * que el schema real.
 */

interface FakeTransactionRow extends TransactionRecord {
  businessId: string;
  voucherId: string;
  verdict: string;
  amountCents: number;
  approvalNumber?: string;
  resolvedAt: Date | null;
}

function makeFakeStore(): {
  store: VerificationStore;
  transactions: FakeTransactionRow[];
  evidenceSources: EvidenceSourceCreateData[];
  moneyOpLogs: MoneyOpLogCreateData[];
} {
  const transactions: FakeTransactionRow[] = [];
  const evidenceSources: EvidenceSourceCreateData[] = [];
  const moneyOpLogs: MoneyOpLogCreateData[] = [];
  let nextId = 1;

  const tx: VerificationTransactionClient = {
    transaction: {
      async upsert({ where, create, update }) {
        const existing = transactions.find((t) => t.voucherId === where.voucherId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: FakeTransactionRow = {
          id: `txn${nextId++}`,
          businessId: create.businessId,
          voucherId: create.voucherId,
          verdict: create.verdict,
          amountCents: create.amountCents,
          approvalNumber: create.approvalNumber,
          resolvedAt: create.resolvedAt,
        };
        transactions.push(row);
        return row;
      },
    },
    evidenceSource: {
      async deleteMany({ where }) {
        for (let i = evidenceSources.length - 1; i >= 0; i--) {
          if (evidenceSources[i]?.transactionId === where.transactionId) evidenceSources.splice(i, 1);
        }
        return { count: 0 };
      },
      async createMany({ data }) {
        evidenceSources.push(...data);
        return { count: data.length };
      },
    },
    moneyOpLog: {
      async create({ data }) {
        const id = `log${moneyOpLogs.length + 1}`;
        moneyOpLogs.push(data);
        return { id };
      },
    },
  };

  const store: VerificationStore = {
    async $transaction(fn) {
      return fn(tx);
    },
  };

  return { store, transactions, evidenceSources, moneyOpLogs };
}

function pendingVerdict(): Verdict {
  return aggregateSignals([
    passSignal("global_approval"),
    notApplicableSignal("account_match", { detail: "cuenta destino ilegible" }),
  ]);
}

function verifiedVerdict(): Verdict {
  return aggregateSignals([
    passSignal("bank_email", { enablesGreen: true }),
    passSignal("global_approval"),
  ]);
}

function suspiciousVerdict(): Verdict {
  return aggregateSignals([
    passSignal("bank_email", { enablesGreen: true }),
    failSignal("global_approval", { detail: "número de aprobación ya usado en otro negocio" }),
  ]);
}

test("primera evaluación PENDING: crea Transaction, EvidenceSource y una fila de MoneyOpLog", async () => {
  const { store, transactions, evidenceSources, moneyOpLogs } = makeFakeStore();
  const verdict = pendingVerdict();

  const result = await persistVerdict(store, {
    businessId: "biz1",
    voucherId: "v1",
    amountCents: 50_000,
    approvalNumber: "1234567",
    verdict,
    nowUtc: "2026-07-05T10:00:00.000Z",
  });

  assert.equal(transactions.length, 1);
  const transaction = transactions[0];
  assert.equal(transaction?.id, result.transactionId);
  assert.equal(transaction?.verdict, "PENDING");
  assert.equal(transaction?.resolvedAt, null);

  assert.equal(evidenceSources.length, 2);
  assert.deepEqual(
    evidenceSources.map((e) => ({ kind: e.kind, passed: e.passed })),
    [
      { kind: "global_approval", passed: true },
      { kind: "account_match", passed: true },
    ],
  );
  assert.equal(evidenceSources[1]?.detail, "cuenta destino ilegible");

  assert.equal(moneyOpLogs.length, 1);
  assert.equal(moneyOpLogs[0]?.businessId, "biz1");
  assert.equal(moneyOpLogs[0]?.transactionId, result.transactionId);
  assert.equal(moneyOpLogs[0]?.verdict, "PENDING");
  assert.equal(moneyOpLogs[0]?.evidenceSources.length, 2);
});

test("reintento PENDING -> VERIFIED: actualiza la misma Transaction, fija resolvedAt y agrega una fila NUEVA en MoneyOpLog (append-only)", async () => {
  const { store, transactions, moneyOpLogs } = makeFakeStore();

  const first = await persistVerdict(store, {
    businessId: "biz1",
    voucherId: "v1",
    amountCents: 50_000,
    verdict: pendingVerdict(),
    nowUtc: "2026-07-05T10:00:00.000Z",
  });

  const second = await persistVerdict(store, {
    businessId: "biz1",
    voucherId: "v1",
    amountCents: 50_000,
    approvalNumber: "1234567",
    verdict: verifiedVerdict(),
    nowUtc: "2026-07-05T10:05:00.000Z",
  });

  // Misma Transaction (mismo voucherId => mismo id), no se crea una segunda fila.
  assert.equal(transactions.length, 1);
  assert.equal(second.transactionId, first.transactionId);
  assert.equal(transactions[0]?.verdict, "VERIFIED");
  assert.equal(transactions[0]?.resolvedAt?.toISOString(), "2026-07-05T10:05:00.000Z");

  // MoneyOpLog es append-only: dos llamadas producen DOS filas distintas, la primera
  // (PENDING) no se pierde/actualiza.
  assert.equal(moneyOpLogs.length, 2);
  assert.equal(moneyOpLogs[0]?.verdict, "PENDING");
  assert.equal(moneyOpLogs[1]?.verdict, "VERIFIED");
  assert.notEqual(first.moneyOpLogId, second.moneyOpLogId);
});

test("veredicto SUSPICIOUS: fija resolvedAt y persiste evidenceSources con passed=false para la señal que falló", async () => {
  const { store, evidenceSources, moneyOpLogs } = makeFakeStore();
  const verdict = suspiciousVerdict();

  await persistVerdict(store, {
    businessId: "biz1",
    voucherId: "v2",
    amountCents: 100_000,
    verdict,
    nowUtc: "2026-07-05T11:00:00.000Z",
  });

  const failed = evidenceSources.find((e) => e.kind === "global_approval");
  assert.equal(failed?.passed, false);
  assert.equal(failed?.detail, "número de aprobación ya usado en otro negocio");
  assert.equal(moneyOpLogs[0]?.verdict, "SUSPICIOUS");
});

test("sin nowUtc inyectado: usa el reloj real para resolvedAt cuando el veredicto no es PENDING", async () => {
  const { store, transactions } = makeFakeStore();
  const before = Date.now();

  await persistVerdict(store, {
    businessId: "biz1",
    voucherId: "v3",
    amountCents: 10_000,
    verdict: verifiedVerdict(),
  });

  const after = Date.now();
  const resolvedAt = transactions[0]?.resolvedAt?.getTime() ?? 0;
  assert.ok(resolvedAt >= before && resolvedAt <= after);
});
