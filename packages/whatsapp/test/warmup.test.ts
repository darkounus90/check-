import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canSend,
  hourlyLimit,
  isPoolEligible,
  registerSend,
  WARMUP_HOURLY_LIMITS,
  WARMUP_WINDOW_MS,
  type WarmupState,
} from "../src/warmup.js";

/**
 * Tests del motor de warmeo (E07-T6). Todo depende de un `now` (epoch ms) inyectado; no hay
 * Date.now() interno. Se verifica el escalado de límite por escalón, que un número en warmeo
 * no supera su límite horario, y que no es elegible para pool durante la ventana de 14 días.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Estado base recién dado de alta en `t0`, sin envíos. */
function freshState(t0: number): WarmupState {
  return { warmupStartedAtMs: t0, hourWindowStartMs: null, sentInWindow: 0 };
}

const T0 = Date.UTC(2026, 6, 1, 0, 0, 0);

test("hourlyLimit escala por antigüedad: día1=20, semana2=60, tras 14d=200 (E07-T6)", () => {
  assert.equal(hourlyLimit(freshState(T0), T0 + 1 * HOUR), WARMUP_HOURLY_LIMITS.day1); // día 1
  assert.equal(hourlyLimit(freshState(T0), T0 + 3 * DAY), WARMUP_HOURLY_LIMITS.day1); // día 3 (aún día1)
  assert.equal(hourlyLimit(freshState(T0), T0 + 7 * DAY), WARMUP_HOURLY_LIMITS.week2); // día 7
  assert.equal(hourlyLimit(freshState(T0), T0 + 10 * DAY), WARMUP_HOURLY_LIMITS.week2); // día 10
  assert.equal(hourlyLimit(freshState(T0), T0 + 14 * DAY), WARMUP_HOURLY_LIMITS.full); // día 14
  assert.equal(hourlyLimit(freshState(T0), T0 + 30 * DAY), WARMUP_HOURLY_LIMITS.full); // ya adulto
});

test("hourlyLimit sin warmupStartedAt usa el escalón más bajo", () => {
  const state: WarmupState = { warmupStartedAtMs: null, hourWindowStartMs: null, sentInWindow: 0 };
  assert.equal(hourlyLimit(state, T0), WARMUP_HOURLY_LIMITS.day1);
});

test("canSend + registerSend respetan el límite horario del escalón (día 1 = 20/h)", () => {
  const now = T0 + HOUR; // día 1
  let state = freshState(T0);

  // Puede enviar hasta 20 en la misma ventana horaria; el 21 ya no.
  for (let i = 0; i < WARMUP_HOURLY_LIMITS.day1; i++) {
    assert.equal(canSend(state, now), true, `envío #${i + 1} debía permitirse`);
    state = registerSend(state, now);
  }
  assert.equal(canSend(state, now), false, "el envío #21 debe bloquearse (tope 20/h)");
  assert.equal(state.sentInWindow, 20);
});

test("registerSend abre una ventana nueva cuando pasó ≥ 1h (el conteo se reinicia)", () => {
  const now = T0 + HOUR;
  let state = freshState(T0);
  for (let i = 0; i < WARMUP_HOURLY_LIMITS.day1; i++) state = registerSend(state, now);
  assert.equal(canSend(state, now), false);

  // Una hora después: ventana expirada ⇒ vuelve a poder enviar.
  const later = now + HOUR;
  assert.equal(canSend(state, later), true);
  const next = registerSend(state, later);
  assert.equal(next.sentInWindow, 1, "el conteo se reinició en la nueva ventana");
  assert.equal(next.hourWindowStartMs, later);
});

test("un número en warmeo con más volumen (semana 2) tolera hasta 60/h", () => {
  const now = T0 + 7 * DAY;
  let state = freshState(T0);
  for (let i = 0; i < WARMUP_HOURLY_LIMITS.week2; i++) {
    assert.equal(canSend(state, now), true);
    state = registerSend(state, now);
  }
  assert.equal(canSend(state, now), false, "tope 60/h en semana 2");
});

test("isPoolEligible es false durante la ventana de warmeo y true al completarla (E07-T6)", () => {
  const state = freshState(T0);
  assert.equal(isPoolEligible(state, T0 + 1 * HOUR), false); // día 1
  assert.equal(isPoolEligible(state, T0 + 7 * DAY), false); // día 7 (aún en warmeo)
  assert.equal(isPoolEligible(state, T0 + WARMUP_WINDOW_MS - 1), false); // 1ms antes de completar
  assert.equal(isPoolEligible(state, T0 + WARMUP_WINDOW_MS), true); // 14 días exactos
  assert.equal(isPoolEligible(state, T0 + 30 * DAY), true); // mucho después
});

test("isPoolEligible sin warmupStartedAt es false (nunca arrancó warmeo)", () => {
  const state: WarmupState = { warmupStartedAtMs: null, hourWindowStartMs: null, sentInWindow: 0 };
  assert.equal(isPoolEligible(state, T0 + 30 * DAY), false);
});
