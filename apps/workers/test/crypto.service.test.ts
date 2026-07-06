import assert from "node:assert/strict";
import { test } from "node:test";

import { generateKeyBase64 } from "@check/shared";

import { CryptoService } from "../src/crypto/crypto.service";

/**
 * Test del `CryptoService` de los workers (Épica 12, E12-T1): round-trip del auth-state de
 * WhatsApp y del artefacto de Storage. La clave se toma de `ENCRYPTION_KEYS` fijada aquí ANTES
 * de instanciar el servicio (env se lee en el constructor vía `../src/env`, ya precargado por
 * el setup de tests con dummies; aquí sobrescribimos `ENCRYPTION_KEYS`).
 */

test("encryptJson/decryptJson: round-trip del auth-state y no legible en claro", () => {
  process.env.ENCRYPTION_KEYS = `v1:${generateKeyBase64()}`;
  const crypto = new CryptoService();
  assert.equal(crypto.enabled, true);

  const authState = { creds: { me: "573001234567" }, keys: { pre: [1, 2, 3] } };
  const stored = crypto.encryptJson(authState) as { enc: string };
  // El blob persistido NO contiene el número en claro.
  assert.ok(!JSON.stringify(stored).includes("573001234567"));
  assert.ok(stored.enc.startsWith("enc:v"));
  // Descifra al objeto original.
  assert.deepEqual(crypto.decryptJson(stored), authState);
});

test("decryptJson tolera auth-state en claro heredado (sin sobre)", () => {
  process.env.ENCRYPTION_KEYS = `v1:${generateKeyBase64()}`;
  const crypto = new CryptoService();
  const legacy = { creds: { me: "x" } };
  assert.deepEqual(crypto.decryptJson(legacy), legacy);
});

test("bytes de Storage: round-trip cifrado", () => {
  process.env.ENCRYPTION_KEYS = `v1:${generateKeyBase64()}`;
  const crypto = new CryptoService();
  const bytes = new Uint8Array([1, 2, 3, 4, 250, 251, 252]);
  const enc = crypto.encryptBytes(bytes);
  assert.notDeepEqual([...enc], [...bytes]);
  assert.deepEqual([...crypto.decryptBytes(enc)], [...bytes]);
});

test("sin ENCRYPTION_KEYS opera en passthrough (dev)", () => {
  delete process.env.ENCRYPTION_KEYS;
  const crypto = new CryptoService();
  assert.equal(crypto.enabled, false);
  const authState = { creds: 1 };
  assert.deepEqual(crypto.encryptJson(authState), authState);
});
