import assert from "node:assert/strict";
import { test } from "node:test";

import type { AlertEvent } from "@check/shared";
import type { WhatsAppNumberHealth } from "@check/whatsapp";

import type { AlertPort } from "../src/observability/alert.port";
import {
  type BanContextPort,
  BanAlertHealthStore,
  type HealthPersistPort,
} from "../src/whatsapp/ban-alert.service";

/**
 * E11-T3: el decorador de `HealthStore` dispara la alerta de baneo con contexto SOLO en la
 * transición hacia `banned`, delegando la persistencia al store real.
 */

function makeContext(overrides: Partial<Awaited<ReturnType<BanContextPort["getBanContext"]>>> = {}) {
  return {
    phoneNumber: "+573001112233",
    affectedBusinesses: 3,
    hasReplacement: false,
    replacementNumberIds: [],
    ...overrides,
  };
}

function setup(ctx = makeContext()) {
  const saved: Array<{ id: string; health: WhatsAppNumberHealth }> = [];
  const dispatched: AlertEvent[] = [];
  const store: HealthPersistPort = { saveHealth: async (id, health) => void saved.push({ id, health }) };
  const banContext: BanContextPort = { getBanContext: async () => ctx };
  const alerts: AlertPort = { dispatch: async (e) => void dispatched.push(e) };
  return { decorator: new BanAlertHealthStore(store, banContext, alerts), saved, dispatched };
}

test("persiste siempre y no alerta si la salud no es banned", async () => {
  const { decorator, saved, dispatched } = setup();
  await decorator.saveHealth("wa-1", "connected");
  await decorator.saveHealth("wa-1", "degraded");
  assert.equal(saved.length, 2);
  assert.equal(dispatched.length, 0);
});

test("alerta en la transición a banned con contexto (negocios, sin reemplazo → warmeo)", async () => {
  const { decorator, dispatched } = setup(makeContext({ affectedBusinesses: 4, hasReplacement: false }));
  await decorator.saveHealth("wa-1", "connected");
  await decorator.saveHealth("wa-1", "banned");

  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]?.kind, "whatsapp_number_banned");
  assert.equal(dispatched[0]?.context?.affectedBusinesses, 4);
  assert.equal(dispatched[0]?.context?.needsWarmup, true);
  assert.equal(dispatched[0]?.severity, "critical");
});

test("con reemplazo → warning, needsWarmup false", async () => {
  const { decorator, dispatched } = setup(
    makeContext({ hasReplacement: true, replacementNumberIds: ["wa-2"] }),
  );
  await decorator.saveHealth("wa-1", "banned");
  assert.equal(dispatched[0]?.severity, "warning");
  assert.equal(dispatched[0]?.context?.needsWarmup, false);
});

test("no re-alerta en ticks sucesivos mientras siga banned", async () => {
  const { decorator, dispatched } = setup();
  await decorator.saveHealth("wa-1", "banned");
  await decorator.saveHealth("wa-1", "banned");
  await decorator.saveHealth("wa-1", "banned");
  assert.equal(dispatched.length, 1);
});
