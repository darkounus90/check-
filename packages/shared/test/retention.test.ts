import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPurgeTrace,
  DEFAULT_RETENTION_DAYS,
  isBeyondRetention,
  resolveRetentionPolicy,
  retentionCutoff,
} from "../src/retention.js";

const DAY_MS = 24 * 60 * 60 * 1000;

test("retentionCutoff resta la ventana de días al reloj inyectado", () => {
  const now = new Date("2026-07-06T00:00:00.000Z");
  const cutoff = retentionCutoff("voucher", now);
  const expected = new Date(now.getTime() - DEFAULT_RETENTION_DAYS.voucher * DAY_MS);
  assert.equal(cutoff.getTime(), expected.getTime());
});

test("isBeyondRetention detecta filas fuera de ventana con reloj fijo", () => {
  const now = new Date("2026-07-06T00:00:00.000Z");
  // qrResolutionLog = 180 días.
  const old = new Date(now.getTime() - 181 * DAY_MS);
  const recent = new Date(now.getTime() - 179 * DAY_MS);
  assert.equal(isBeyondRetention("qrResolutionLog", old, now), true);
  assert.equal(isBeyondRetention("qrResolutionLog", recent, now), false);
});

test("resolveRetentionPolicy aplica overrides y cae a defaults", () => {
  const policy = resolveRetentionPolicy({ voucher: 30, waSession: undefined });
  assert.equal(policy.voucher, 30);
  assert.equal(policy.waSession, DEFAULT_RETENTION_DAYS.waSession);
  assert.equal(policy.bankEmail, DEFAULT_RETENTION_DAYS.bankEmail);
});

test("buildPurgeTrace deja traza consultable del ciclo de purga", () => {
  const now = new Date("2026-07-06T12:00:00.000Z");
  const cutoff = retentionCutoff("bankEmail", now);
  const trace = buildPurgeTrace("bankEmail", cutoff, 42, now);
  assert.equal(trace.type, "bankEmail");
  assert.equal(trace.purgedCount, 42);
  assert.equal(trace.cutoff, cutoff.toISOString());
  assert.equal(trace.purgedAt, now.toISOString());
});
