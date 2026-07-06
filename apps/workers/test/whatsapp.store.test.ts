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
