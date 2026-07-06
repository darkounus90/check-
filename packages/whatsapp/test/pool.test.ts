import assert from "node:assert/strict";
import { test } from "node:test";

import type { PoolInstance } from "../src/pool.js";
import { WhatsAppPool } from "../src/pool.js";
import type { ResolvedVerdict, WhatsAppNumberHealth } from "../src/types.js";

/**
 * Orquestador multi-instancia (E07-T7): varios números corren en paralelo AISLADOS. Se
 * inyectan instancias fake (sin Baileys/BD) vía `instanceFactory` para verificar arranque,
 * aislamiento de fallos, enrutado de veredictos y `getPoolHealth()`.
 */

interface FakeConfig {
  failStart?: boolean;
  failStop?: boolean;
  health?: WhatsAppNumberHealth;
  verdictResult?: boolean;
}

function fakeInstance(waNumberId: string, cfg: FakeConfig = {}): PoolInstance & {
  started: boolean;
  stopped: boolean;
  verdicts: string[];
} {
  let health: WhatsAppNumberHealth = cfg.health ?? "warming";
  const state = { started: false, stopped: false, verdicts: [] as string[] };
  return {
    waNumberId,
    get started() {
      return state.started;
    },
    get stopped() {
      return state.stopped;
    },
    get verdicts() {
      return state.verdicts;
    },
    start: async () => {
      if (cfg.failStart) throw new Error(`boom-start ${waNumberId}`);
      state.started = true;
      health = "connected";
    },
    stop: async () => {
      if (cfg.failStop) throw new Error(`boom-stop ${waNumberId}`);
      state.stopped = true;
    },
    health: () => health,
    sendVerdict: async (voucherId: string, _v: ResolvedVerdict) => {
      state.verdicts.push(voucherId);
      return cfg.verdictResult ?? true;
    },
  };
}

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

test("start: levanta N instancias en paralelo (E07-T7)", async () => {
  const created = new Map<string, ReturnType<typeof fakeInstance>>();
  const pool = new WhatsAppPool({
    logger: silentLogger,
    instanceFactory: (id) => {
      const inst = fakeInstance(id);
      created.set(id, inst);
      return inst;
    },
  });

  const started = await pool.start(["wa-1", "wa-2", "wa-3"]);

  assert.deepEqual(started.sort(), ["wa-1", "wa-2", "wa-3"]);
  assert.equal(pool.numberIds().length, 3);
  for (const id of ["wa-1", "wa-2", "wa-3"]) {
    assert.equal(created.get(id)?.started, true);
    assert.equal(pool.currentHealth(id), "connected");
  }
});

test("aislamiento: si una instancia falla al arrancar, las demás siguen (E07-T7)", async () => {
  const created = new Map<string, ReturnType<typeof fakeInstance>>();
  const pool = new WhatsAppPool({
    logger: silentLogger,
    instanceFactory: (id) => {
      const inst = fakeInstance(id, { failStart: id === "wa-2" });
      created.set(id, inst);
      return inst;
    },
  });

  const started = await pool.start(["wa-1", "wa-2", "wa-3"]);

  assert.deepEqual(started.sort(), ["wa-1", "wa-3"], "solo las sanas se reportan arrancadas");
  assert.equal(created.get("wa-1")?.started, true);
  assert.equal(created.get("wa-3")?.started, true);
  // wa-2 sigue registrada y consultable (su salud refleja el fallo), pero no tumbó al resto.
  assert.equal(pool.has("wa-2"), true);
  assert.equal(pool.currentHealth("wa-2"), "warming");
});

test("start es idempotente por número (no re-levanta uno ya presente)", async () => {
  let creations = 0;
  const pool = new WhatsAppPool({
    logger: silentLogger,
    instanceFactory: (id) => {
      creations += 1;
      return fakeInstance(id);
    },
  });
  await pool.start(["wa-1"]);
  await pool.start(["wa-1", "wa-2"]);
  assert.equal(creations, 2, "wa-1 no se recrea; solo se crea wa-2");
  assert.equal(pool.numberIds().sort().join(","), "wa-1,wa-2");
});

test("sendVerdict: enruta a la instancia dueña del número (E07-T7)", async () => {
  const created = new Map<string, ReturnType<typeof fakeInstance>>();
  const pool = new WhatsAppPool({
    logger: silentLogger,
    instanceFactory: (id) => {
      const inst = fakeInstance(id);
      created.set(id, inst);
      return inst;
    },
  });
  await pool.start(["wa-1", "wa-2"]);

  const ok = await pool.sendVerdict("wa-2", "v-99", "VERIFIED");
  assert.equal(ok, true);
  assert.deepEqual(created.get("wa-2")?.verdicts, ["v-99"]);
  assert.deepEqual(created.get("wa-1")?.verdicts, [], "no toca la instancia equivocada");

  // Número no gestionado ⇒ false, sin romper nada.
  assert.equal(await pool.sendVerdict("wa-desconocido", "v-1", "VERIFIED"), false);
});

test("getPoolHealth: expone el estado por número para la Épica 8 (E07-T9)", async () => {
  const pool = new WhatsAppPool({
    logger: silentLogger,
    instanceFactory: (id) => fakeInstance(id, { health: id === "wa-2" ? "degraded" : "connected" }),
  });
  await pool.start(["wa-1", "wa-2"]);

  const health = pool.getPoolHealth().sort((a, b) => a.waNumberId.localeCompare(b.waNumberId));
  assert.deepEqual(health, [
    { waNumberId: "wa-1", health: "connected" },
    { waNumberId: "wa-2", health: "connected" },
  ]);
  // Nota: `start` fake pone connected; el health del factory aplica antes de start. Verificamos
  // que getPoolHealth lee el estado vigente de cada instancia (aquí post-start).
});

test("stopAll: detiene todas aislando fallos de cierre (E07-T7)", async () => {
  const created = new Map<string, ReturnType<typeof fakeInstance>>();
  const pool = new WhatsAppPool({
    logger: silentLogger,
    instanceFactory: (id) => {
      const inst = fakeInstance(id, { failStop: id === "wa-1" });
      created.set(id, inst);
      return inst;
    },
  });
  await pool.start(["wa-1", "wa-2"]);

  await pool.stopAll();

  assert.equal(pool.numberIds().length, 0, "el pool queda vacío");
  assert.equal(created.get("wa-2")?.stopped, true, "wa-2 se detuvo pese al fallo de wa-1");
});

test("remove + add: reemplazo en caliente de un número (E07-T10)", async () => {
  const pool = new WhatsAppPool({
    logger: silentLogger,
    instanceFactory: (id) => fakeInstance(id),
  });
  await pool.start(["wa-viejo"]);
  await pool.remove("wa-viejo");
  assert.equal(pool.has("wa-viejo"), false);

  const added = await pool.add("wa-nuevo");
  assert.equal(added, true);
  assert.equal(pool.currentHealth("wa-nuevo"), "connected");
});
