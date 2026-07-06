import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildNumberBannedAlert,
  buildUnhandledErrorAlert,
  evaluateParserFailure,
  evaluateQueueDepth,
} from "../src/alert-triggers.js";

// ── E11-T3 ──────────────────────────────────────────────────────────

test("buildNumberBannedAlert: sin reemplazo → critical, needsWarmup", () => {
  const alert = buildNumberBannedAlert({
    waNumberId: "wa-1",
    phoneNumber: "+573001112233",
    affectedBusinesses: 4,
    hasReplacement: false,
  });
  assert.equal(alert.kind, "whatsapp_number_banned");
  assert.equal(alert.severity, "critical");
  assert.equal(alert.context?.affectedBusinesses, 4);
  assert.equal(alert.context?.needsWarmup, true);
  assert.equal(alert.context?.hasReplacement, false);
});

test("buildNumberBannedAlert: con reemplazo → warning, sin warmup", () => {
  const alert = buildNumberBannedAlert({
    waNumberId: "wa-1",
    affectedBusinesses: 1,
    hasReplacement: true,
    replacementNumberIds: ["wa-2"],
  });
  assert.equal(alert.severity, "warning");
  assert.equal(alert.context?.needsWarmup, false);
  assert.deepEqual(alert.context?.replacementNumberIds, ["wa-2"]);
});

// ── E11-T4 ──────────────────────────────────────────────────────────

test("evaluateParserFailure: dispara sobre umbral con desglose por banco", () => {
  const alert = evaluateParserFailure({
    total: 10,
    unrecognized: 8,
    byBank: { bancolombia: 6, desconocido: 2 },
    source: "bank_email",
  });
  assert.ok(alert);
  assert.equal(alert?.kind, "parser_match_failure");
  assert.equal(alert?.context?.failureRate, 0.8);
  assert.deepEqual(alert?.context?.byBank, { bancolombia: 6, desconocido: 2 });
});

test("evaluateParserFailure: no dispara bajo umbral", () => {
  assert.equal(
    evaluateParserFailure({ total: 10, unrecognized: 2, source: "bank_email" }),
    null,
  );
});

test("evaluateParserFailure: no dispara con muestra pequeña", () => {
  assert.equal(
    evaluateParserFailure({ total: 3, unrecognized: 3, source: "voucher_ocr" }),
    null,
  );
});

test("evaluateParserFailure: >=90% → critical", () => {
  const alert = evaluateParserFailure({ total: 10, unrecognized: 10, source: "voucher_ocr" });
  assert.equal(alert?.severity, "critical");
});

// ── E11-T5 ──────────────────────────────────────────────────────────

test("evaluateQueueDepth: backlog sobre umbral dispara con motivo", () => {
  const alert = evaluateQueueDepth(
    { queue: "ocr-processing", waiting: 250, active: 1, failed: 0, oldestWaitingMs: 1000 },
    { maxWaiting: 100 },
  );
  assert.ok(alert);
  assert.equal(alert?.kind, "queue_stuck");
  assert.ok((alert?.context?.reasons as string[]).some((r) => r.includes("backlog")));
});

test("evaluateQueueDepth: edad del job muy alta → critical", () => {
  const alert = evaluateQueueDepth(
    { queue: "ocr-processing", waiting: 1, active: 0, failed: 0, oldestWaitingMs: 700_000 },
    { maxOldestWaitingMs: 300_000 },
  );
  assert.equal(alert?.severity, "critical");
});

test("evaluateQueueDepth: cola sana → null", () => {
  assert.equal(
    evaluateQueueDepth({ queue: "q", waiting: 5, active: 1, failed: 0, oldestWaitingMs: 100 }),
    null,
  );
});

// ── E11-T6 ──────────────────────────────────────────────────────────

test("buildUnhandledErrorAlert: critical con origen, mensaje y stack", () => {
  const alert = buildUnhandledErrorAlert("workers:uncaughtException", new Error("kaboom"), {
    pid: 123,
  });
  assert.equal(alert.kind, "unhandled_error");
  assert.equal(alert.severity, "critical");
  assert.equal(alert.context?.origin, "workers:uncaughtException");
  assert.equal(alert.context?.message, "kaboom");
  assert.equal(alert.context?.pid, 123);
  assert.ok(typeof alert.context?.stack === "string");
});
