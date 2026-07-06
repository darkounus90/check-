import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_RETENTION_DAYS } from "@check/shared";

import { RetentionService } from "../src/retention/retention.service";

/**
 * Test del job de purga por retención (Épica 12, E12-T3) con reloj y prisma fake: NO requiere BD.
 * Verifica que se calcula el corte por tipo con el reloj inyectado, se borran las filas fuera de
 * ventana y se deja una traza consultable por tipo.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function fakePrisma(captured: Record<string, Date>) {
  const del = (key: string) => ({
    async deleteMany({ where }: { where: Record<string, { lt: Date }> }) {
      const field = Object.keys(where)[0];
      captured[key] = where[field].lt;
      return { count: key === "voucher" ? 3 : 0 };
    },
  });
  return {
    voucher: del("voucher"),
    bankEmail: del("bankEmail"),
    qrResolutionLog: del("qrResolutionLog"),
    waSession: del("waSession"),
  } as unknown as ConstructorParameters<typeof RetentionService>[0];
}

test("purgeOnce calcula cortes por tipo con el reloj inyectado y deja traza", async () => {
  const now = new Date("2026-07-06T00:00:00.000Z");
  const captured: Record<string, Date> = {};
  const svc = new RetentionService(fakePrisma(captured), () => now);

  const traces = await svc.purgeOnce();

  // Un corte por cada tipo, con la ventana por defecto restada al reloj.
  assert.equal(
    captured.voucher.getTime(),
    now.getTime() - DEFAULT_RETENTION_DAYS.voucher * DAY_MS,
  );
  assert.equal(
    captured.waSession.getTime(),
    now.getTime() - DEFAULT_RETENTION_DAYS.waSession * DAY_MS,
  );

  // Traza: cuatro tipos, con conteo purgado.
  assert.equal(traces.length, 4);
  const voucherTrace = traces.find((t) => t.type === "voucher");
  assert.equal(voucherTrace?.purgedCount, 3);
  assert.equal(voucherTrace?.purgedAt, now.toISOString());
});

test("purgeOnce aísla un fallo de un tipo sin abortar el resto", async () => {
  const now = new Date("2026-07-06T00:00:00.000Z");
  const prisma = {
    voucher: {
      async deleteMany() {
        throw new Error("boom");
      },
    },
    bankEmail: {
      async deleteMany() {
        return { count: 5 };
      },
    },
    qrResolutionLog: {
      async deleteMany() {
        return { count: 0 };
      },
    },
    waSession: {
      async deleteMany() {
        return { count: 0 };
      },
    },
  } as unknown as ConstructorParameters<typeof RetentionService>[0];

  const svc = new RetentionService(prisma, () => now);
  const traces = await svc.purgeOnce();

  // El tipo que falló no deja traza; los demás sí (bankEmail con 5).
  assert.ok(!traces.some((t) => t.type === "voucher"));
  assert.equal(traces.find((t) => t.type === "bankEmail")?.purgedCount, 5);
});
