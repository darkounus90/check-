import assert from "node:assert/strict";
import { test } from "node:test";

import type { PrismaService } from "../src/database/prisma.service";
import type { OcrQueueService } from "../src/ocr/ocr.queue";
import { WhatsAppStore } from "../src/whatsapp/whatsapp.store";

/**
 * Tests de los adaptadores Prisma de la capa WhatsApp en los workers (E07-T2/T3), con un
 * Prisma fake: resolución de negocio (incluida la limitación N↔M) y armado del batch de
 * veredictos pendientes para el poller. No requieren BD, Redis ni Baileys reales.
 */

function makeStore(prisma: Partial<PrismaService>): WhatsAppStore {
  const ocrQueue = { enqueueVoucherOcr: async () => {} } as unknown as OcrQueueService;
  return new WhatsAppStore(prisma as PrismaService, ocrQueue);
}

test("resolveBusinessId: devuelve el negocio asignado de mayor prioridad", async () => {
  let capturedArgs: unknown;
  const store = makeStore({
    numberPoolAssignment: {
      findFirst: async (args: unknown) => {
        capturedArgs = args;
        return { businessId: "biz-priority" };
      },
    } as never,
  });

  const businessId = await store.resolveBusinessId("wa-1");
  assert.equal(businessId, "biz-priority");
  // La query ordena por prioridad desc y desempata por antigüedad (limitación N↔M, E07-T8).
  assert.deepEqual((capturedArgs as { orderBy: unknown }).orderBy, [
    { priority: "desc" },
    { createdAt: "asc" },
  ]);
});

test("resolveBusinessId: null si el número no tiene negocio asignado", async () => {
  const store = makeStore({
    numberPoolAssignment: { findFirst: async () => null } as never,
  });
  assert.equal(await store.resolveBusinessId("wa-huerfano"), null);
});

test("findPendingVerdictNotifications: mapea filas resueltas a notificaciones con su veredicto", async () => {
  const store = makeStore({
    waVoucherContext: {
      findMany: async () => [
        {
          voucherId: "v1",
          remoteJid: "57300@s.whatsapp.net",
          waNumberId: "wa-1",
          voucher: { transaction: { verdict: "VERIFIED" } },
        },
        {
          voucherId: "v2",
          remoteJid: "57301@s.whatsapp.net",
          waNumberId: "wa-1",
          voucher: { transaction: { verdict: "SUSPICIOUS" } },
        },
        // Fila sin transaction (defensa): se descarta, no debe romper el batch.
        {
          voucherId: "v3",
          remoteJid: "57302@s.whatsapp.net",
          waNumberId: "wa-1",
          voucher: { transaction: null },
        },
      ],
    } as never,
  });

  const pending = await store.findPendingVerdictNotifications("wa-1", 25);
  assert.equal(pending.length, 2);
  assert.deepEqual(pending[0], {
    voucherId: "v1",
    remoteJid: "57300@s.whatsapp.net",
    waNumberId: "wa-1",
    verdict: "VERIFIED",
  });
  assert.equal(pending[1]?.verdict, "SUSPICIOUS");
});

test("getVoucherContext: devuelve remoteJid + waNumberId o null", async () => {
  const store = makeStore({
    waVoucherContext: {
      findUnique: async () => ({ remoteJid: "57300@s.whatsapp.net", waNumberId: "wa-1" }),
    } as never,
  });
  assert.deepEqual(await store.getVoucherContext("v1"), {
    remoteJid: "57300@s.whatsapp.net",
    waNumberId: "wa-1",
  });

  const empty = makeStore({
    waVoucherContext: { findUnique: async () => null } as never,
  });
  assert.equal(await empty.getVoucherContext("nope"), null);
});

// ── Grupo C: pool (E07-T7), asignación (E07-T8), health (E07-T9) ──

test("listPoolableNumberIds: solo números que pasaron warmeo y no baneados (E07-T7)", async () => {
  let capturedArgs: unknown;
  const store = makeStore({
    waNumber: {
      findMany: async (args: unknown) => {
        capturedArgs = args;
        return [{ id: "wa-1" }, { id: "wa-2" }];
      },
    } as never,
  });

  const ids = await store.listPoolableNumberIds();
  assert.deepEqual(ids, ["wa-1", "wa-2"]);
  // Excluye WARMING (aún en calentamiento) y BANNED (inutilizable).
  assert.deepEqual((capturedArgs as { where: { health: { notIn: string[] } } }).where.health.notIn, [
    "WARMING",
    "BANNED",
  ]);
});

test("listAssignments: mapea filas a PoolAssignment con createdAt en epoch ms (E07-T8)", async () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const store = makeStore({
    numberPoolAssignment: {
      findMany: async () => [
        { waNumberId: "wa-1", businessId: "biz-a", priority: 10, createdAt: now },
      ],
    } as never,
  });

  const assignments = await store.listAssignments();
  assert.deepEqual(assignments, [
    { waNumberId: "wa-1", businessId: "biz-a", priority: 10, createdAtMs: now.getTime() },
  ]);
});

test("saveHealth: mapea el estado del dominio al enum Prisma NumberHealth (E07-T9)", async () => {
  const updates: Array<{ where: unknown; data: unknown }> = [];
  const store = makeStore({
    waNumber: {
      update: async (args: { where: unknown; data: unknown }) => {
        updates.push(args);
        return {} as never;
      },
    } as never,
  });

  await store.saveHealth("wa-1", "connected");
  await store.saveHealth("wa-2", "banned");
  await store.saveHealth("wa-3", "degraded");
  await store.saveHealth("wa-4", "warming");

  assert.deepEqual(
    updates.map((u) => (u.data as { health: string }).health),
    ["CONNECTED", "BANNED", "DEGRADED", "WARMING"],
  );
});

test("getPoolHealth: mapea el enum Prisma de vuelta al estado del dominio (E07-T9)", async () => {
  const store = makeStore({
    waNumber: {
      findMany: async () => [
        { id: "wa-1", health: "CONNECTED" },
        { id: "wa-2", health: "BANNED" },
      ],
    } as never,
  });

  assert.deepEqual(await store.getPoolHealth(), [
    { waNumberId: "wa-1", health: "connected" },
    { waNumberId: "wa-2", health: "banned" },
  ]);
});

test("findPendingVerdictNotificationsForNumbers: vacío si no hay números (E07-T7)", async () => {
  let called = false;
  const store = makeStore({
    waVoucherContext: {
      findMany: async () => {
        called = true;
        return [];
      },
    } as never,
  });

  const pending = await store.findPendingVerdictNotificationsForNumbers([], 25);
  assert.deepEqual(pending, []);
  assert.equal(called, false, "no consulta la BD si no hay números en el pool");
});

test("findPendingVerdictNotificationsForNumbers: filtra por los números del pool (E07-T7)", async () => {
  let capturedArgs: { where: { waNumberId: { in: string[] } } } | undefined;
  const store = makeStore({
    waVoucherContext: {
      findMany: async (args: unknown) => {
        capturedArgs = args as typeof capturedArgs;
        return [
          {
            voucherId: "v1",
            remoteJid: "57300@s.whatsapp.net",
            waNumberId: "wa-2",
            voucher: { transaction: { verdict: "VERIFIED" } },
          },
        ];
      },
    } as never,
  });

  const pending = await store.findPendingVerdictNotificationsForNumbers(["wa-1", "wa-2"], 25);
  assert.deepEqual(capturedArgs?.where.waNumberId.in, ["wa-1", "wa-2"]);
  assert.equal(pending[0]?.waNumberId, "wa-2");
  assert.equal(pending[0]?.verdict, "VERIFIED");
});
