import assert from "node:assert/strict";
import { test } from "node:test";

import { WhatsAppPool } from "../src/pool.js";
import type { ResolvedVerdict, WhatsAppNumberHealth } from "../src/types.js";

/**
 * Persistencia total sobrevive-baneo (E07-T10). Aceptación: tras un baneo simulado (la
 * instancia cae), NO se pierde ninguna conversación (`WaVoucherContext`), comprobante
 * (`Voucher`) ni sesión (`WaSession`); al reemplazar el número, el histórico persiste.
 *
 * Modelamos la BD con un store en memoria que sobrevive a la caída de la instancia (igual
 * que Postgres sobrevive a un reinicio de proceso worker). El punto clave: la instancia es
 * STATELESS respecto de los datos de negocio — todo se persiste en el store, no en memoria
 * de la instancia — así que "matar" la instancia no borra nada.
 */

/** Fake de la BD compartida entre instancias/procesos (sobrevive a caídas). */
class FakeDb {
  vouchers = new Map<string, { id: string; businessId: string; storagePath: string }>();
  contexts = new Map<string, { voucherId: string; remoteJid: string; waNumberId: string }>();
  sessions = new Map<string, unknown>(); // waNumberId → authState
}

/** Instancia fake que persiste todo en la BD compartida y puede "caer" a mitad. */
function persistentInstance(
  db: FakeDb,
  waNumberId: string,
): {
  waNumberId: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): WhatsAppNumberHealth;
  sendVerdict(voucherId: string, verdict: ResolvedVerdict): Promise<boolean>;
  receiveVoucher(voucherId: string, remoteJid: string, businessId: string): Promise<void>;
  crash(): void;
} {
  let health: WhatsAppNumberHealth = "warming";
  let alive = false;
  return {
    waNumberId,
    start: async () => {
      alive = true;
      health = "connected";
      // Reconexión sin re-escanear QR: reutiliza la sesión persistida si existe.
      if (!db.sessions.has(waNumberId)) db.sessions.set(waNumberId, { creds: "nuevo" });
    },
    stop: async () => {
      alive = false;
    },
    health: () => health,
    sendVerdict: async (voucherId: string) => {
      if (!alive) return false;
      return db.contexts.has(voucherId);
    },
    // Simula la ingesta E07-T2: persiste voucher + contexto + sesión en la BD.
    receiveVoucher: async (voucherId, remoteJid, businessId) => {
      db.vouchers.set(voucherId, { id: voucherId, businessId, storagePath: `${businessId}/x.jpg` });
      db.contexts.set(voucherId, { voucherId, remoteJid, waNumberId });
      db.sessions.set(waNumberId, { creds: `${waNumberId}-creds` });
    },
    // Baneo/caída abrupta: la instancia deja de estar viva. NO toca la BD.
    crash: () => {
      alive = false;
      health = "banned";
    },
  };
}

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

test("baneo simulado: conversación, comprobante y sesión NO se pierden (E07-T10)", async () => {
  const db = new FakeDb();
  const instances = new Map<string, ReturnType<typeof persistentInstance>>();
  const pool = new WhatsAppPool({
    logger: silentLogger,
    instanceFactory: (id) => {
      const inst = persistentInstance(db, id);
      instances.set(id, inst);
      return inst;
    },
  });

  await pool.start(["wa-1"]);
  const wa1 = instances.get("wa-1")!;

  // Llega un comprobante por WhatsApp y se persiste (voucher + contexto + sesión).
  await wa1.receiveVoucher("v-1", "57300@s.whatsapp.net", "biz-a");
  assert.equal(db.vouchers.size, 1);
  assert.equal(db.contexts.size, 1);
  assert.ok(db.sessions.has("wa-1"));

  // BANEO: la instancia cae de golpe.
  wa1.crash();
  assert.equal(pool.currentHealth("wa-1"), "banned");

  // La BD sigue intacta pese al baneo: nada se perdió.
  assert.equal(db.vouchers.size, 1, "el comprobante persiste tras el baneo");
  assert.equal(db.contexts.size, 1, "la conversación persiste tras el baneo");
  assert.deepEqual(db.contexts.get("v-1"), {
    voucherId: "v-1",
    remoteJid: "57300@s.whatsapp.net",
    waNumberId: "wa-1",
  });
  assert.ok(db.sessions.has("wa-1"), "la sesión persiste tras el baneo");
});

test("reemplazo del número: el histórico persiste y un número nuevo puede retomar (E07-T10)", async () => {
  const db = new FakeDb();
  const instances = new Map<string, ReturnType<typeof persistentInstance>>();
  const pool = new WhatsAppPool({
    logger: silentLogger,
    instanceFactory: (id) => {
      const inst = persistentInstance(db, id);
      instances.set(id, inst);
      return inst;
    },
  });

  await pool.start(["wa-1"]);
  await instances.get("wa-1")!.receiveVoucher("v-1", "57300@s.whatsapp.net", "biz-a");

  // Baneo + saca el número del pool.
  instances.get("wa-1")!.crash();
  await pool.remove("wa-1");
  assert.equal(pool.has("wa-1"), false);

  // El histórico sigue en BD (voucher + contexto).
  assert.equal(db.vouchers.size, 1);
  assert.equal(db.contexts.size, 1);

  // Reemplazo: se levanta un número NUEVO. La conversación previa sigue consultable.
  const added = await pool.add("wa-2");
  assert.equal(added, true);
  assert.equal(pool.currentHealth("wa-2"), "connected");

  // El comprobante y su contexto del número baneado siguen intactos: nada se perdió al reemplazar.
  assert.deepEqual(db.vouchers.get("v-1")?.businessId, "biz-a");
  assert.equal(db.contexts.get("v-1")?.waNumberId, "wa-1", "el histórico conserva su origen");
});
