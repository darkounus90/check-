import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import {
  decryptBytes,
  decryptString,
  encryptBytes,
  encryptString,
  ensureEncrypted,
  generateKeyBase64,
  isEncrypted,
  KeyRing,
  keyRingFromEnv,
  maybeDecrypt,
  reencrypt,
  type VersionedKey,
} from "../src/crypto.js";

function keyEntry(version: number): VersionedKey {
  return { version, key: randomBytes(32) };
}

test("round-trip de string: cifrar y descifrar recupera el original", () => {
  const ring = new KeyRing([keyEntry(1)]);
  const secret = "ocrText con PII: Juan Pérez, 3001234567";
  const envelope = encryptString(ring, secret);
  assert.ok(isEncrypted(envelope));
  assert.notEqual(envelope, secret);
  assert.equal(decryptString(ring, envelope), secret);
});

test("round-trip de bytes (artefacto de Storage)", () => {
  const ring = new KeyRing([keyEntry(1)]);
  const bytes = randomBytes(2048);
  const envelope = encryptBytes(ring, bytes);
  assert.notDeepEqual(new Uint8Array(envelope), new Uint8Array(bytes));
  assert.deepEqual(new Uint8Array(decryptBytes(ring, envelope)), new Uint8Array(bytes));
});

test("sin la clave correcta, los datos no son legibles", () => {
  const ringA = new KeyRing([keyEntry(1)]);
  const envelope = encryptString(ringA, "dato sensible");
  // Un anillo con otra clave en la MISMA versión no puede descifrar (falla el tag GCM).
  const ringB = new KeyRing([{ version: 1, key: randomBytes(32) }]);
  assert.throws(() => decryptString(ringB, envelope));
});

test("detecta manipulación del ciphertext (cifrado autenticado)", () => {
  const ring = new KeyRing([keyEntry(1)]);
  const envelope = encryptString(ring, "no me toques");
  const parts = envelope.split(":");
  const raw = Buffer.from(parts[2], "base64");
  raw[raw.length - 1] ^= 0xff; // corromper el tag
  const tampered = `${parts[0]}:${parts[1]}:${raw.toString("base64")}`;
  assert.throws(() => decryptString(ring, tampered));
});

test("rotación de clave: descifra con vieja, recifra con nueva (E12-T2)", () => {
  const v1 = keyEntry(1);
  const ringV1 = new KeyRing([v1]);
  const envelopeV1 = encryptString(ringV1, "dato a rotar");

  // Se añade v2 como activa; v1 sigue disponible para descifrar lo viejo.
  const v2 = keyEntry(2);
  const ringV2 = ringV1.withKey(v2, true);
  assert.equal(ringV2.active, 2);

  // Recifrar: el sobre viejo (v1) se descifra con v1 y se recifra con v2.
  const rotated = reencrypt(ringV2, envelopeV1);
  assert.ok(rotated.startsWith("enc:v2:"));
  assert.equal(decryptString(ringV2, rotated), "dato a rotar");

  // Ya recifrado bajo v2: reencrypt es idempotente.
  assert.equal(reencrypt(ringV2, rotated), rotated);

  // Tras recifrar todo, se puede retirar v1.
  const ringOnlyV2 = ringV2.withoutVersion(1);
  assert.equal(decryptString(ringOnlyV2, rotated), "dato a rotar");
  assert.deepEqual(ringOnlyV2.versions(), [2]);
});

test("keyRingFromEnv parsea entradas versionadas y elige la mayor como activa", () => {
  const k1 = generateKeyBase64();
  const k2 = generateKeyBase64();
  const ring = keyRingFromEnv(`v2:${k2},v1:${k1}`);
  assert.equal(ring.active, 2);
  assert.deepEqual(ring.versions(), [1, 2]);
  const env = encryptString(ring, "x");
  assert.equal(decryptString(ring, env), "x");
});

test("keyRingFromEnv acepta clave cruda sin prefijo como v1", () => {
  const ring = keyRingFromEnv(generateKeyBase64());
  assert.equal(ring.active, 1);
});

test("ensureEncrypted/maybeDecrypt: convivencia con texto plano heredado", () => {
  const ring = new KeyRing([keyEntry(1)]);
  const plain = "texto en claro heredado";
  const enc = ensureEncrypted(ring, plain);
  assert.ok(isEncrypted(enc!));
  // ensureEncrypted es idempotente sobre algo ya cifrado.
  assert.equal(ensureEncrypted(ring, enc), enc);
  // maybeDecrypt descifra lo cifrado y pasa lo plano tal cual.
  assert.equal(maybeDecrypt(ring, enc), plain);
  assert.equal(maybeDecrypt(ring, plain), plain);
  assert.equal(maybeDecrypt(ring, null), null);
});

test("KeyRing rechaza clave de tamaño incorrecto y versión activa ausente", () => {
  assert.throws(() => new KeyRing([{ version: 1, key: Buffer.alloc(16) }]));
  assert.throws(() => new KeyRing([keyEntry(1)], 9));
  assert.throws(() => new KeyRing([]));
});
