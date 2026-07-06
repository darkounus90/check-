import assert from "node:assert/strict";
import { test } from "node:test";

import { createMemorySink, StructuredLogger } from "../src/logger.js";

const fixedClock = () => new Date("2026-07-06T12:00:00.000Z");

test("emite un LogRecord con nivel, mensaje, timestamp y contexto base", () => {
  const { sink, records } = createMemorySink();
  const log = new StructuredLogger({ context: { service: "workers" }, sink, clock: fixedClock });

  log.info("arranque", { port: 3001 });

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    level: "info",
    message: "arranque",
    timestamp: "2026-07-06T12:00:00.000Z",
    context: { service: "workers", port: 3001 },
  });
});

test("child acumula contexto de correlación", () => {
  const { sink, records } = createMemorySink();
  const log = new StructuredLogger({ context: { service: "workers" }, sink, clock: fixedClock });

  const jobLog = log.child({ businessId: "biz-1", voucherId: "v-9" });
  jobLog.warn("lento", { durationMs: 5000 });

  assert.deepEqual(records[0]?.context, {
    service: "workers",
    businessId: "biz-1",
    voucherId: "v-9",
    durationMs: 5000,
  });
});

test("respeta el nivel mínimo (debug filtrado bajo info)", () => {
  const { sink, records } = createMemorySink();
  const log = new StructuredLogger({ level: "info", sink, clock: fixedClock });

  log.debug("no debería salir");
  log.info("sí sale");

  assert.equal(records.length, 1);
  assert.equal(records[0]?.message, "sí sale");
});

test("error normaliza un Error a { name, message, stack }", () => {
  const { sink, records } = createMemorySink();
  const log = new StructuredLogger({ sink, clock: fixedClock });

  log.error("falló", new Error("boom"));

  const err = records[0]?.context.error as { name: string; message: string };
  assert.equal(err.name, "Error");
  assert.equal(err.message, "boom");
});

test("error normaliza meta.error cuando viene anidado", () => {
  const { sink, records } = createMemorySink();
  const log = new StructuredLogger({ sink, clock: fixedClock });

  log.error("falló", { voucherId: "v-1", error: new Error("db down") });

  assert.equal(records[0]?.context.voucherId, "v-1");
  const err = records[0]?.context.error as { message: string };
  assert.equal(err.message, "db down");
});
