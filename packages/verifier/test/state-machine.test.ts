import assert from "node:assert/strict";
import { test } from "node:test";

import type { PendingVerificationState, Verdict } from "../src/index.ts";
import {
  isPendingWindowExpired,
  resolvePendingVerdict,
  retryPendingVerification,
} from "../src/index.ts";

const pendingSinceUtc = "2026-07-05T10:00:00.000Z";
const windowMinutes = 15;

const pendingVerdict: Verdict = {
  status: "PENDING",
  evidenceSources: [{ kind: "bank_email", passed: false }],
  reason: "la Defensa 1 (correo real del banco receptor) aún no confirma la operación",
};

const verifiedVerdict: Verdict = {
  status: "VERIFIED",
  evidenceSources: [{ kind: "bank_email", passed: true }],
  reason: "todas las defensas evaluadas pasaron y la Defensa 1 (correo real) confirmó la operación",
};

const suspiciousVerdict: Verdict = {
  status: "SUSPICIOUS",
  evidenceSources: [{ kind: "global_approval", passed: false, detail: "número ya usado" }],
  reason: "una o más defensas detectaron una señal de fraude",
};

test("isPendingWindowExpired: false antes de que se cumpla la ventana", () => {
  const nowUtc = "2026-07-05T10:14:59.000Z"; // 14m59s después, ventana de 15m
  assert.equal(isPendingWindowExpired({ pendingSinceUtc, windowMinutes }, nowUtc), false);
});

test("isPendingWindowExpired: true exactamente al cumplirse la ventana", () => {
  const nowUtc = "2026-07-05T10:15:00.000Z"; // exactamente 15m después
  assert.equal(isPendingWindowExpired({ pendingSinceUtc, windowMinutes }, nowUtc), true);
});

test("isPendingWindowExpired: true bastante después de expirar", () => {
  const nowUtc = "2026-07-05T11:00:00.000Z";
  assert.equal(isPendingWindowExpired({ pendingSinceUtc, windowMinutes }, nowUtc), true);
});

test("resolvePendingVerdict: correo llega dentro de ventana → VERIFIED (el agregador manda)", () => {
  const nowUtc = "2026-07-05T10:05:00.000Z"; // dentro de ventana
  const verdict = resolvePendingVerdict({ pendingSinceUtc, windowMinutes }, nowUtc, verifiedVerdict);

  assert.equal(verdict.status, "VERIFIED");
  assert.deepEqual(verdict, verifiedVerdict);
});

test("resolvePendingVerdict: el reintento da SUSPICIOUS (ej. reutilización detectada) → SUSPICIOUS", () => {
  const nowUtc = "2026-07-05T10:05:00.000Z"; // dentro de ventana
  const verdict = resolvePendingVerdict(
    { pendingSinceUtc, windowMinutes },
    nowUtc,
    suspiciousVerdict,
  );

  assert.equal(verdict.status, "SUSPICIOUS");
  assert.deepEqual(verdict, suspiciousVerdict);
});

test("resolvePendingVerdict: sigue PENDING y la ventana no expiró → sigue PENDING", () => {
  const nowUtc = "2026-07-05T10:10:00.000Z"; // 10m después, dentro de la ventana de 15m
  const verdict = resolvePendingVerdict(
    { pendingSinceUtc, windowMinutes },
    nowUtc,
    pendingVerdict,
  );

  assert.equal(verdict.status, "PENDING");
});

test("resolvePendingVerdict: sigue PENDING y la ventana expiró → transiciona a SUSPICIOUS", () => {
  const nowUtc = "2026-07-05T10:20:00.000Z"; // 20m después, ventana de 15m ya expiró
  const verdict = resolvePendingVerdict(
    { pendingSinceUtc, windowMinutes },
    nowUtc,
    pendingVerdict,
  );

  assert.equal(verdict.status, "SUSPICIOUS");
  assert.equal(
    verdict.reason,
    "la ventana de espera del correo real del banco receptor (Defensa 1) expiró sin confirmación",
  );
  // Conserva la evidencia del último reintento para auditoría (E06-T11).
  assert.deepEqual(verdict.evidenceSources, pendingVerdict.evidenceSources);
});

test("retryPendingVerification: orquesta el reintento inyectado y resuelve a VERIFIED dentro de ventana", async () => {
  const state: PendingVerificationState = { verdict: pendingVerdict, pendingSinceUtc };
  const nowUtc = "2026-07-05T10:05:00.000Z";

  const verdict = await retryPendingVerification(state, windowMinutes, nowUtc, () => verifiedVerdict);

  assert.equal(verdict.status, "VERIFIED");
});

test("retryPendingVerification: soporta reintentos asíncronos (I/O real inyectado por el worker)", async () => {
  const state: PendingVerificationState = { verdict: pendingVerdict, pendingSinceUtc };
  const nowUtc = "2026-07-05T10:05:00.000Z";

  const verdict = await retryPendingVerification(state, windowMinutes, nowUtc, () =>
    Promise.resolve(pendingVerdict),
  );

  assert.equal(verdict.status, "PENDING");
});

test("retryPendingVerification: ventana expirada y reintento sigue PENDING → SUSPICIOUS", async () => {
  const state: PendingVerificationState = { verdict: pendingVerdict, pendingSinceUtc };
  const nowUtc = "2026-07-05T10:30:00.000Z";

  const verdict = await retryPendingVerification(state, windowMinutes, nowUtc, () => pendingVerdict);

  assert.equal(verdict.status, "SUSPICIOUS");
});

test("retryPendingVerification: lanza si el estado ya no está PENDING (error de uso)", async () => {
  const state: PendingVerificationState = { verdict: verifiedVerdict, pendingSinceUtc };
  const nowUtc = "2026-07-05T10:05:00.000Z";

  await assert.rejects(
    () => retryPendingVerification(state, windowMinutes, nowUtc, () => verifiedVerdict),
    /solo aplica sobre veredictos PENDING/,
  );
});
