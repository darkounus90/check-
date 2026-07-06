import assert from "node:assert/strict";
import { test } from "node:test";

import { MetricsRegistry } from "../src/metrics.js";

test("counters se acumulan", () => {
  const m = new MetricsRegistry();
  m.increment("ocr_processed");
  m.increment("ocr_processed", 2);
  assert.equal(m.snapshot().counters.ocr_processed, 3);
});

test("durations resumen count/p50/p95/max/avg", () => {
  const m = new MetricsRegistry();
  for (const ms of [100, 200, 300, 400, 500]) m.recordDuration("time_to_verdict", ms);
  const stats = m.snapshot().durations.time_to_verdict;
  assert.equal(stats?.count, 5);
  assert.equal(stats?.maxMs, 500);
  assert.equal(stats?.avgMs, 300);
  assert.equal(stats?.p50Ms, 300);
  assert.equal(stats?.p95Ms, 500);
});

test("rates por etiqueta calculan successRate (tasa de parseo por banco)", () => {
  const m = new MetricsRegistry();
  m.recordOutcome("parse", "bancolombia", true);
  m.recordOutcome("parse", "bancolombia", true);
  m.recordOutcome("parse", "bancolombia", false);
  m.recordOutcome("parse", "bbva", false);

  const rates = m.snapshot().rates.parse;
  assert.equal(rates?.bancolombia?.total, 3);
  assert.equal(rates?.bancolombia?.ok, 2);
  assert.ok(Math.abs((rates?.bancolombia?.successRate ?? 0) - 2 / 3) < 1e-9);
  assert.equal(rates?.bbva?.successRate, 0);
});

test("uptimeSeconds usa el reloj inyectable", () => {
  let now = 1_000_000;
  const m = new MetricsRegistry({ clock: () => now });
  now += 90_000; // +90s
  assert.equal(m.snapshot().uptimeSeconds, 90);
});

test("histograma acotado por maxSamples (ventana móvil)", () => {
  const m = new MetricsRegistry({ maxSamples: 3 });
  for (const ms of [1, 2, 3, 4, 5]) m.recordDuration("x", ms);
  const stats = m.snapshot().durations.x;
  assert.equal(stats?.count, 3);
  assert.equal(stats?.maxMs, 5);
});
