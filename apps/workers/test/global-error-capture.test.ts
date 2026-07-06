import assert from "node:assert/strict";
import { test } from "node:test";

import { type AlertEvent, createMemorySink, StructuredLogger } from "@check/shared";

import type { AlertPort } from "../src/observability/alert.port";
import { GlobalErrorCapture } from "../src/observability/global-error-capture";

/**
 * E11-T6: un error no manejado termina como alerta crítica + log estructurado, nunca en
 * silencio. Ejercemos `report` directamente (sin `process.emit`) para no afectar al runner.
 */

test("report encola una alerta crítica y loguea el error", () => {
  const { sink, records } = createMemorySink();
  const dispatched: AlertEvent[] = [];
  const alerts: AlertPort = { dispatch: async (e) => void dispatched.push(e) };
  const capture = new GlobalErrorCapture(new StructuredLogger({ sink }), alerts);

  capture.report("uncaughtException", new Error("kaboom"));

  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]?.kind, "unhandled_error");
  assert.equal(dispatched[0]?.severity, "critical");
  assert.ok(records.some((r) => r.level === "error"));
});

test("report tolera un rechazo no-Error", () => {
  const { sink } = createMemorySink();
  const dispatched: AlertEvent[] = [];
  const alerts: AlertPort = { dispatch: async (e) => void dispatched.push(e) };
  const capture = new GlobalErrorCapture(new StructuredLogger({ sink }), alerts);

  capture.report("unhandledRejection", "string rechazado");
  assert.equal(dispatched[0]?.context?.message, "string rechazado");
});
