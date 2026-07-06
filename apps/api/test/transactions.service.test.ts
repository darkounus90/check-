import assert from "node:assert/strict";
import { test } from "node:test";

import { VerdictStatus } from "@prisma/client";

import type { TenantService } from "../src/tenant/tenant.service";
import {
  type ListTransactionsFilters,
  TransactionsService,
  type TransactionsTxClient,
} from "../src/me/transactions.service";

/**
 * Gap #8: listado autenticado de transacciones del negocio. Tests unitarios con un
 * `runAsTenant` FAKE que expone un cliente Prisma en memoria — sin BD ni RLS reales, pero
 * verificando que el servicio filtra por estado/fecha/cuenta y resuelve el `accountId` desde
 * el `destinationAccount` del voucher.
 */

interface Row {
  id: string;
  verdict: VerdictStatus;
  amountCents: number;
  approvalNumber: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  voucher: { destinationAccount: string | null } | null;
}

const ACCOUNTS = [
  { id: "acc-1", accountNumber: "1111" },
  { id: "acc-2", accountNumber: "2222" },
];

const ROWS: Row[] = [
  {
    id: "t1",
    verdict: VerdictStatus.SUSPICIOUS,
    amountCents: 50_000,
    approvalNumber: "A1",
    createdAt: new Date("2026-07-01T10:00:00.000Z"),
    resolvedAt: new Date("2026-07-01T10:05:00.000Z"),
    voucher: { destinationAccount: "1111" },
  },
  {
    id: "t2",
    verdict: VerdictStatus.VERIFIED,
    amountCents: 20_000,
    approvalNumber: null,
    createdAt: new Date("2026-07-03T12:00:00.000Z"),
    resolvedAt: null,
    voucher: { destinationAccount: "2222" },
  },
  {
    id: "t3",
    verdict: VerdictStatus.PENDING,
    amountCents: 9_900,
    approvalNumber: "A3",
    createdAt: new Date("2026-07-05T08:00:00.000Z"),
    resolvedAt: null,
    voucher: { destinationAccount: "9999" }, // no coincide con ninguna cuenta configurada
  },
];

/** Aplica los filtros equivalentes a los que el servicio delega a Prisma. */
function applyWhere(where: Record<string, unknown>): Row[] {
  return ROWS.filter((row) => {
    const verdictFilter = where.verdict as { in: VerdictStatus[] } | undefined;
    if (verdictFilter && !verdictFilter.in.includes(row.verdict)) return false;

    const createdAt = where.createdAt as { gte?: Date; lte?: Date } | undefined;
    if (createdAt?.gte && row.createdAt < createdAt.gte) return false;
    if (createdAt?.lte && row.createdAt > createdAt.lte) return false;

    const voucher = where.voucher as { destinationAccount: string } | undefined;
    if (voucher && row.voucher?.destinationAccount !== voucher.destinationAccount) return false;

    return true;
  });
}

function makeTenant(businessSeen: string[]): TenantService {
  const client: TransactionsTxClient = {
    transaction: {
      async findMany({ where }) {
        return applyWhere(where as Record<string, unknown>)
          .slice()
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      },
    },
    receivingAccount: {
      async findMany() {
        return ACCOUNTS.map((a) => ({ ...a }));
      },
    },
  };
  return {
    async runAsTenant(businessId: string, fn: (tx: TransactionsTxClient) => Promise<unknown>) {
      businessSeen.push(businessId);
      return fn(client);
    },
  } as unknown as TenantService;
}

function makeService(businessSeen: string[] = []): TransactionsService {
  return new TransactionsService(makeTenant(businessSeen));
}

async function list(filters: ListTransactionsFilters = {}) {
  return makeService().list("biz-1", filters);
}

test("sin filtros: devuelve todas, más recientes primero, con accountId resuelto", async () => {
  const result = await list();

  assert.deepEqual(
    result.map((r) => r.id),
    ["t3", "t2", "t1"],
  );
  // accountId inferido del destinationAccount; t3 no coincide con ninguna cuenta ⇒ null.
  const byId = new Map(result.map((r) => [r.id, r]));
  assert.equal(byId.get("t1")?.accountId, "acc-1");
  assert.equal(byId.get("t2")?.accountId, "acc-2");
  assert.equal(byId.get("t3")?.accountId, null);
});

test("mapea centavos, veredicto y fechas ISO (createdAt/resolvedAt)", async () => {
  const result = await list();
  const t1 = result.find((r) => r.id === "t1");

  assert.equal(t1?.amountCents, 50_000);
  assert.equal(t1?.verdict, VerdictStatus.SUSPICIOUS);
  assert.equal(t1?.approvalNumber, "A1");
  assert.equal(t1?.createdAt, "2026-07-01T10:00:00.000Z");
  assert.equal(t1?.resolvedAt, "2026-07-01T10:05:00.000Z");

  const t2 = result.find((r) => r.id === "t2");
  assert.equal(t2?.resolvedAt, null);
  assert.equal(t2?.approvalNumber, null);
});

test("filtro por veredicto (server-side)", async () => {
  const result = await list({ verdicts: [VerdictStatus.SUSPICIOUS] });
  assert.deepEqual(
    result.map((r) => r.id),
    ["t1"],
  );
});

test("filtro por rango de fecha inclusivo sobre createdAt", async () => {
  const result = await list({
    from: new Date("2026-07-02T00:00:00.000Z"),
    to: new Date("2026-07-04T00:00:00.000Z"),
  });
  assert.deepEqual(
    result.map((r) => r.id),
    ["t2"],
  );
});

test("filtro por accountId: traduce a número de cuenta y acota por destinationAccount", async () => {
  const result = await list({ accountId: "acc-2" });
  assert.deepEqual(
    result.map((r) => r.id),
    ["t2"],
  );
});

test("accountId desconocido para el negocio: lista vacía sin consultar transacciones", async () => {
  const result = await list({ accountId: "acc-inexistente" });
  assert.deepEqual(result, []);
});

test("corre bajo runAsTenant con el businessId del usuario (RLS server-side)", async () => {
  const seen: string[] = [];
  await makeService(seen).list("biz-abc");
  assert.deepEqual(seen, ["biz-abc"]);
});
