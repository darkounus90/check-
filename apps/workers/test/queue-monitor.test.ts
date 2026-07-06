import assert from "node:assert/strict";
import { test } from "node:test";

import { createMemorySink, type QueueDepthSnapshot, StructuredLogger } from "@check/shared";

import type { AlertPort } from "../src/observability/alert.port";
import { type QueueDepthProbe, QueueMonitorService } from "../src/observability/queue-monitor.service";

/**
 * E11-T5: el monitor lee la foto de la cola y dispara alerta si supera umbral. La evaluación
 * de umbral usa los defaults de env (backlog>100, fallidos>20, edad>300s) cargados por
 * `../src/env` (NODE_ENV=test).
 */

function setup(depth: QueueDepthSnapshot | (() => Promise<never>)) {
  const dispatched: unknown[] = [];
  const probe: QueueDepthProbe = {
    getDepth: typeof depth === "function" ? depth : async () => depth,
  };
  const alerts: AlertPort = { dispatch: async (e) => void dispatched.push(e) };
  const logger = new StructuredLogger({ sink: createMemorySink().sink });
  return { monitor: new QueueMonitorService(probe, alerts, logger), dispatched };
}

test("cola sana → sin alerta", async () => {
  const { monitor, dispatched } = setup({
    queue: "ocr-processing",
    waiting: 5,
    active: 1,
    failed: 0,
    oldestWaitingMs: 1000,
  });
  const alert = await monitor.checkOnce();
  assert.equal(alert, null);
  assert.equal(dispatched.length, 0);
});

test("backlog sobre umbral → alerta despachada", async () => {
  const { monitor, dispatched } = setup({
    queue: "ocr-processing",
    waiting: 500,
    active: 1,
    failed: 0,
    oldestWaitingMs: 1000,
  });
  const alert = await monitor.checkOnce();
  assert.ok(alert);
  assert.equal(alert?.kind, "queue_stuck");
  assert.equal(dispatched.length, 1);
});

test("fallo leyendo la cola (¿Redis caído?) → no lanza, no alerta", async () => {
  const { monitor, dispatched } = setup(async () => {
    throw new Error("redis unreachable");
  });
  const alert = await monitor.checkOnce();
  assert.equal(alert, null);
  assert.equal(dispatched.length, 0);
});
