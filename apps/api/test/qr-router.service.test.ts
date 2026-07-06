import assert from "node:assert/strict";
import { test } from "node:test";

import { NotFoundException } from "@nestjs/common";
import { NumberHealth } from "@prisma/client";

import { QrRouterService, type QrRouterStore } from "../src/public/qr-router.service";

/**
 * Tests de I/O del enrutador de QR (E08-T1 contrato + E08-T5 traza). Prisma fake en memoria:
 * verifican que cada resolución (WhatsApp/PWA) deja una fila `QrResolutionLog` consultable, que
 * la respuesta nunca filtra el businessId/waNumberId, y el 404 de opaqueId inexistente.
 */

interface FakeAssignment {
  priority: number;
  createdAt: Date;
  waNumber: { id: string; phoneNumber: string; health: NumberHealth };
}

function makeStore(options: {
  business?: { id: string; opaqueId: string };
  assignments?: FakeAssignment[];
}): {
  store: QrRouterStore;
  logs: Array<{ businessId: string; waNumberId: string | null; reason: string }>;
} {
  const logs: Array<{ businessId: string; waNumberId: string | null; reason: string }> = [];
  const store: QrRouterStore = {
    business: {
      async findUnique({ where }) {
        const b = options.business;
        if (!b || b.opaqueId !== where.opaqueId) return null;
        return { id: b.id };
      },
    },
    numberPoolAssignment: {
      async findMany({ where }) {
        if (!options.business || where.businessId !== options.business.id) return [];
        return options.assignments ?? [];
      },
    },
    qrResolutionLog: {
      async create({ data }) {
        logs.push(data);
        return { id: `log-${logs.length}` };
      },
    },
  };
  return { store, logs };
}

const BUSINESS = { id: "biz-1", opaqueId: "opq-abc" };

function assignment(
  id: string,
  phone: string,
  health: NumberHealth,
  priority: number,
  createdAtMs: number,
): FakeAssignment {
  return {
    priority,
    createdAt: new Date(createdAtMs),
    waNumber: { id, phoneNumber: phone, health },
  };
}

test("opaqueId inexistente: 404 y no registra nada", async () => {
  const { store, logs } = makeStore({ business: BUSINESS });
  const service = new QrRouterService(store);

  await assert.rejects(service.resolveRoute("no-existe"), NotFoundException);
  assert.equal(logs.length, 0);
});

test("número connected: devuelve wa.me y registra reason PRIMARY (sin filtrar ids internos)", async () => {
  const { store, logs } = makeStore({
    business: BUSINESS,
    assignments: [assignment("n1", "+573001112233", NumberHealth.CONNECTED, 10, 1000)],
  });
  const service = new QrRouterService(store);

  const dto = await service.resolveRoute("opq-abc");

  assert.deepEqual(dto, {
    action: "whatsapp",
    waMeUrl: "https://wa.me/573001112233",
    reason: "primary",
  });
  // La respuesta NO expone businessId ni waNumberId (D3).
  assert.deepEqual(Object.keys(dto).sort(), ["action", "reason", "waMeUrl"]);
  // E08-T5: traza consultable con el número elegido y el motivo.
  assert.deepEqual(logs, [{ businessId: "biz-1", waNumberId: "n1", reason: "PRIMARY" }]);
});

test("primario caído: failover al secundario y registra reason FAILOVER", async () => {
  const { store, logs } = makeStore({
    business: BUSINESS,
    assignments: [
      assignment("n1", "+573001112233", NumberHealth.BANNED, 10, 1000),
      assignment("n2", "+573009998877", NumberHealth.CONNECTED, 5, 2000),
    ],
  });
  const service = new QrRouterService(store);

  const dto = await service.resolveRoute("opq-abc");

  assert.deepEqual(dto, {
    action: "whatsapp",
    waMeUrl: "https://wa.me/573009998877",
    reason: "failover",
  });
  assert.deepEqual(logs, [{ businessId: "biz-1", waNumberId: "n2", reason: "FAILOVER" }]);
});

test("todo el pool caído: action=pwa y registra FALLBACK_PWA con waNumberId null", async () => {
  const { store, logs } = makeStore({
    business: BUSINESS,
    assignments: [
      assignment("n1", "+573001112233", NumberHealth.BANNED, 10, 1000),
      assignment("n2", "+573009998877", NumberHealth.WARMING, 5, 2000),
    ],
  });
  const service = new QrRouterService(store);

  const dto = await service.resolveRoute("opq-abc");

  assert.deepEqual(dto, { action: "pwa" });
  assert.deepEqual(logs, [{ businessId: "biz-1", waNumberId: null, reason: "FALLBACK_PWA" }]);
});

test("negocio sin números asignados: action=pwa y traza FALLBACK_PWA", async () => {
  const { store, logs } = makeStore({ business: BUSINESS, assignments: [] });
  const service = new QrRouterService(store);

  assert.deepEqual(await service.resolveRoute("opq-abc"), { action: "pwa" });
  assert.deepEqual(logs, [{ businessId: "biz-1", waNumberId: null, reason: "FALLBACK_PWA" }]);
});

test("un fallo al registrar la traza no tumba la resolución del cliente", async () => {
  const { store } = makeStore({
    business: BUSINESS,
    assignments: [assignment("n1", "+573001112233", NumberHealth.CONNECTED, 10, 1000)],
  });
  store.qrResolutionLog.create = async () => {
    throw new Error("db caída");
  };
  const service = new QrRouterService(store);

  const dto = await service.resolveRoute("opq-abc");
  assert.equal(dto.action, "whatsapp");
});
