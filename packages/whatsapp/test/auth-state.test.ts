import assert from "node:assert/strict";
import { test } from "node:test";

import { initAuthCreds } from "@whiskeysockets/baileys";

import {
  deserializeAuthState,
  serializeAuthState,
  useDbAuthState,
} from "../src/db-auth-state.js";
import type { WaSessionStore } from "../src/types.js";

/**
 * Tests del auth-state persistido en BD (E07-T1). Prueban la propiedad crítica: que
 * serializar → guardar → reiniciar (nuevo `useDbAuthState`) → revivir reconstruye el mismo
 * estado (creds + keys, con sus Buffers intactos), que es lo que permite reconectar sin
 * re-escanear QR. No hay conexión real a WhatsApp: solo el store se ejercita.
 */

/** Store en memoria que emula `WaSession.authState` (un blob JSON por número). */
function makeMemoryStore(): WaSessionStore & { blob: unknown } {
  const state: { blob: unknown } = { blob: null };
  return {
    get blob() {
      return state.blob;
    },
    async loadAuthState() {
      return state.blob;
    },
    async saveAuthState(_waNumberId, authState) {
      // Simula el round-trip por Postgres (JSON): clona a algo JSON-puro.
      state.blob = JSON.parse(JSON.stringify(authState)) as unknown;
    },
  };
}

test("serializeAuthState produce un objeto JSON-safe y deserializeAuthState lo revive con Buffers", () => {
  const creds = initAuthCreds();
  const serialized = serializeAuthState(creds, {});

  // Debe sobrevivir un round-trip JSON (como el que hace Postgres con una columna Json).
  const roundTripped: unknown = JSON.parse(JSON.stringify(serialized));
  const revived = deserializeAuthState(roundTripped);

  // Los Buffers (ej. la clave de ruido) se reconstruyen como Buffer, no como objeto plano.
  assert.ok(Buffer.isBuffer(revived.creds.noiseKey.private));
  assert.deepEqual(
    Buffer.from(revived.creds.noiseKey.private).toString("base64"),
    Buffer.from(creds.noiseKey.private).toString("base64"),
  );
  assert.equal(revived.creds.registrationId, creds.registrationId);
});

test("useDbAuthState: primera vinculación inicializa creds nuevas y las persiste al guardar keys", async () => {
  const store = makeMemoryStore();
  const auth = await useDbAuthState(store, "wa-1");

  assert.equal(store.blob, null, "nada persistido hasta el primer set/saveCreds");
  assert.ok(auth.state.creds.registrationId >= 0);

  // Guardar una pre-key debe persistir el estado completo.
  const keyPair = { public: new Uint8Array([1, 2, 3]), private: new Uint8Array([4, 5, 6]) };
  await auth.state.keys.set({ "pre-key": { "1": keyPair } });

  assert.notEqual(store.blob, null, "el set persiste el auth-state");
});

test("useDbAuthState: reinicio de proceso restaura creds y keys sin re-inicializar", async () => {
  const store = makeMemoryStore();

  // Sesión 1: se vincula y guarda una key + creds.
  const first = await useDbAuthState(store, "wa-1");
  const originalRegistrationId = first.state.creds.registrationId;
  const keyPair = { public: new Uint8Array([9, 8, 7]), private: new Uint8Array([6, 5, 4]) };
  await first.state.keys.set({ "pre-key": { "42": keyPair } });
  await first.saveCreds();

  // Sesión 2: simula un reinicio de proceso — nuevo useDbAuthState sobre el MISMO store.
  const second = await useDbAuthState(store, "wa-1");

  // Mismas creds (no se re-inicializaron): igual registrationId ⇒ no hará falta QR nuevo.
  assert.equal(second.state.creds.registrationId, originalRegistrationId);

  // La key guardada se recupera con su Buffer intacto.
  const got = await second.state.keys.get("pre-key", ["42"]);
  assert.ok(got["42"], "la pre-key persistida se recupera tras el reinicio");
  assert.equal(
    Buffer.from(got["42"]!.private).toString("base64"),
    Buffer.from(keyPair.private).toString("base64"),
  );
});

test("useDbAuthState: set con valor null borra la key del store", async () => {
  const store = makeMemoryStore();
  const auth = await useDbAuthState(store, "wa-1");

  const keyPair = { public: new Uint8Array([1]), private: new Uint8Array([2]) };
  await auth.state.keys.set({ "pre-key": { "7": keyPair } });
  assert.ok((await auth.state.keys.get("pre-key", ["7"]))["7"]);

  await auth.state.keys.set({ "pre-key": { "7": null } });
  const afterDelete = await auth.state.keys.get("pre-key", ["7"]);
  assert.equal(afterDelete["7"], undefined, "la key borrada ya no está");
});
