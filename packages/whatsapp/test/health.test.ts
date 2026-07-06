import assert from "node:assert/strict";
import { test } from "node:test";

import { DisconnectReason } from "@whiskeysockets/baileys";

import {
  disconnectStatusCode,
  HealthMonitor,
  healthFromDisconnect,
  type IntervalScheduler,
} from "../src/health.js";
import type { WhatsAppNumberHealth } from "../src/types.js";

/**
 * Health checks por número (E07-T9): mapeo DisconnectReason→estado y el monitor periódico
 * con scheduler inyectado (para disparar el ciclo de 60s a mano, sin esperar).
 */

test("healthFromDisconnect: logout/forbidden/badSession/multidevice ⇒ banned", () => {
  assert.equal(healthFromDisconnect(DisconnectReason.loggedOut), "banned");
  assert.equal(healthFromDisconnect(DisconnectReason.forbidden), "banned");
  assert.equal(healthFromDisconnect(DisconnectReason.badSession), "banned");
  assert.equal(healthFromDisconnect(DisconnectReason.multideviceMismatch), "banned");
});

test("healthFromDisconnect: caídas transitorias ⇒ degraded", () => {
  assert.equal(healthFromDisconnect(DisconnectReason.connectionClosed), "degraded");
  assert.equal(healthFromDisconnect(DisconnectReason.connectionLost), "degraded");
  assert.equal(healthFromDisconnect(DisconnectReason.timedOut), "degraded");
  assert.equal(healthFromDisconnect(DisconnectReason.restartRequired), "degraded");
  assert.equal(healthFromDisconnect(DisconnectReason.connectionReplaced), "degraded");
});

test("healthFromDisconnect: statusCode desconocido ⇒ degraded (no lo damos por baneado)", () => {
  assert.equal(healthFromDisconnect(undefined), "degraded");
  assert.equal(healthFromDisconnect(9999), "degraded");
});

test("disconnectStatusCode: extrae el statusCode del Boom o undefined", () => {
  assert.equal(disconnectStatusCode({ output: { statusCode: 401 } }), 401);
  assert.equal(disconnectStatusCode(new Error("plain")), undefined);
  assert.equal(disconnectStatusCode(undefined), undefined);
});

/** Scheduler manual: guarda el callback y el intervalo para dispararlo desde el test. */
function manualScheduler(): {
  scheduler: IntervalScheduler;
  fireAll: () => void;
  ms: () => number | undefined;
  cancelled: () => boolean;
} {
  let fn: (() => void) | undefined;
  let intervalMs: number | undefined;
  let cancelled = false;
  return {
    scheduler: {
      schedule(cb, ms) {
        fn = cb;
        intervalMs = ms;
        return {
          cancel() {
            cancelled = true;
          },
        };
      },
    },
    fireAll: () => fn?.(),
    ms: () => intervalMs,
    cancelled: () => cancelled,
  };
}

test("HealthMonitor: cada tick persiste la salud vigente de cada número (E07-T9)", async () => {
  const health = new Map<string, WhatsAppNumberHealth>([
    ["wa-1", "connected"],
    ["wa-2", "degraded"],
  ]);
  const saved: Array<{ id: string; health: WhatsAppNumberHealth }> = [];
  const { scheduler, fireAll, ms } = manualScheduler();

  const monitor = new HealthMonitor({
    probe: { currentHealth: (id) => health.get(id) ?? null },
    store: {
      saveHealth: async (id, h) => {
        saved.push({ id, health: h });
      },
    },
    scheduler,
    numbersToCheck: () => ["wa-1", "wa-2"],
  });

  monitor.start();
  assert.equal(ms(), 60_000, "el intervalo por defecto del health check es 60s");

  // Disparar un ciclo manualmente (equivale a "pasaron 60s").
  fireAll();
  await new Promise((r) => setImmediate(r)); // deja resolver los awaits del tick

  assert.deepEqual(saved, [
    { id: "wa-1", health: "connected" },
    { id: "wa-2", health: "degraded" },
  ]);
});

test("HealthMonitor: salta números sin instancia y aísla fallos de persistencia", async () => {
  const saved: string[] = [];
  const errors: string[] = [];
  const monitor = new HealthMonitor({
    probe: {
      currentHealth: (id) => (id === "wa-ausente" ? null : "connected"),
    },
    store: {
      saveHealth: async (id) => {
        if (id === "wa-falla") throw new Error("db down");
        saved.push(id);
      },
    },
    numbersToCheck: () => ["wa-ausente", "wa-falla", "wa-ok"],
    onError: (id) => errors.push(id),
  });

  await monitor.tick();

  assert.deepEqual(saved, ["wa-ok"], "solo persiste los presentes que no fallan");
  assert.deepEqual(errors, ["wa-falla"], "el fallo de uno no impide chequear los demás");
});

test("HealthMonitor: stop cancela el intervalo", () => {
  const { scheduler, cancelled } = manualScheduler();
  const monitor = new HealthMonitor({
    probe: { currentHealth: () => "connected" },
    store: { saveHealth: async () => {} },
    scheduler,
    numbersToCheck: () => [],
  });
  monitor.start();
  monitor.stop();
  assert.equal(cancelled(), true);
});
