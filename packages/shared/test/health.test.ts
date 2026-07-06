import assert from "node:assert/strict";
import { test } from "node:test";

import { type HealthCheck, runHealthChecks } from "../src/health.js";

const okCheck = (name: string, critical = true): HealthCheck => ({
  name,
  critical,
  probe: async () => {},
});

const downCheck = (name: string, critical = true): HealthCheck => ({
  name,
  critical,
  probe: async () => {
    throw new Error(`${name} caído`);
  },
});

test("todas ok → status ok", async () => {
  const report = await runHealthChecks([okCheck("db"), okCheck("redis")]);
  assert.equal(report.status, "ok");
  assert.equal(report.checks.length, 2);
  assert.ok(report.checks.every((c) => c.status === "ok"));
});

test("una dependencia crítica caída → status down", async () => {
  const report = await runHealthChecks([okCheck("db"), downCheck("redis")]);
  assert.equal(report.status, "down");
  const redis = report.checks.find((c) => c.name === "redis");
  assert.equal(redis?.status, "down");
  assert.match(redis?.error ?? "", /caído/);
});

test("solo una no-crítica caída → status degraded", async () => {
  const report = await runHealthChecks([okCheck("db"), downCheck("cache", false)]);
  assert.equal(report.status, "degraded");
});

test("timeout de una comprobación colgada → down", async () => {
  const hanging: HealthCheck = { name: "slow", probe: () => new Promise(() => {}) };
  const report = await runHealthChecks([hanging], { timeoutMs: 20 });
  assert.equal(report.status, "down");
  assert.match(report.checks[0]?.error ?? "", /timeout/);
});
