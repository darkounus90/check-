import assert from "node:assert/strict";
import { test } from "node:test";

import { MetricsRegistry } from "@check/shared";

import type { PrismaService } from "../src/database/prisma.service";
import { HealthService } from "../src/observability/health.service";

/**
 * E11-T7/T8: `HealthService.metrics()` vuelca el snapshot del registro. La comprobación de
 * readiness real (DB/Redis) se ejercita en integración (necesita servicios vivos); aquí
 * validamos el volcado de métricas con un Prisma fake.
 */

test("metrics() devuelve el snapshot del registro inyectado", () => {
  const metrics = new MetricsRegistry();
  metrics.increment("voucher_extraction_ok", 5);
  const prisma = {} as PrismaService;
  const service = new HealthService(prisma, metrics);

  const snapshot = service.metrics();
  assert.equal(snapshot.counters.voucher_extraction_ok, 5);
  assert.ok(typeof snapshot.uptimeSeconds === "number");
});
