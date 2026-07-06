/**
 * Cifrado en reposo de datos sensibles (Épica 12, E12-T1/T2).
 *
 * Objetivo: cifrar campos/artefactos sensibles (ocrText del comprobante, `WaSession.authState`,
 * PII de clientes) con cifrado AUTENTICADO (AES-256-GCM) usando una clave de entorno. Sin la
 * clave, los datos no son legibles ni manipulables sin detección (el tag GCM detecta cualquier
 * alteración del ciphertext).
 *
 * Diseño (testeable + rotable):
 * - `KeyRing` mantiene un conjunto de claves versionadas. La clave "activa" cifra; cualquier
 *   clave conocida puede descifrar. Esto habilita la ROTACIÓN sin pérdida de datos (E12-T2):
 *   se añade una clave nueva como activa, se recifra en background con `reencrypt`, y la vieja
 *   se retira cuando ya no queda ningún ciphertext que la use.
 * - El formato del sobre (envelope) es autoprefijado con la versión de clave, así que el
 *   descifrado sabe qué clave usar sin metadatos externos: `v<version>:<iv_b64>:<ct+tag_b64>`.
 * - Funciones puras sobre `KeyRing` (inyectable) ⇒ round-trip y rotación cubribles por test sin
 *   tocar entorno global.
 *
 * NOTA sobre artefactos en Storage (comprobante imagen/PDF): el mismo `encryptBytes` cifra el
 * blob antes de subirlo al bucket privado `vouchers`. Ver `.trellis/spec` y el prd de E12-T1
 * para la política del bucket (privado + cifrado a nivel de aplicación aquí).
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/** Algoritmo de cifrado autenticado. AES-256 en modo GCM (12B IV, 16B tag). */
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Prefijo del sobre para distinguir texto cifrado de texto plano heredado. */
const ENVELOPE_PREFIX = "enc";

/** Una clave versionada del anillo. `key` son 32 bytes crudos (AES-256). */
export interface VersionedKey {
  /** Versión entera monotónica (1, 2, 3…). La mayor activa suele ser la de cifrado. */
  readonly version: number;
  /** Clave cruda de 32 bytes. */
  readonly key: Buffer;
}

/**
 * Anillo de claves de cifrado. La clave ACTIVA cifra; todas las conocidas descifran.
 * Inmutable: `rotateTo`/`withKey` devuelven un anillo nuevo (facilita test de rotación).
 */
export class KeyRing {
  private readonly keys: Map<number, Buffer>;
  private readonly activeVersion: number;

  constructor(keys: readonly VersionedKey[], activeVersion?: number) {
    if (keys.length === 0) {
      throw new Error("KeyRing requiere al menos una clave");
    }
    this.keys = new Map();
    for (const { version, key } of keys) {
      if (key.length !== KEY_BYTES) {
        throw new Error(
          `La clave v${version} debe ser de ${KEY_BYTES} bytes (AES-256), recibidos ${key.length}`,
        );
      }
      this.keys.set(version, key);
    }
    // Por defecto la versión activa es la mayor conocida.
    this.activeVersion = activeVersion ?? Math.max(...this.keys.keys());
    if (!this.keys.has(this.activeVersion)) {
      throw new Error(`La versión activa v${this.activeVersion} no está en el anillo`);
    }
  }

  get active(): number {
    return this.activeVersion;
  }

  /** Versiones conocidas (para diagnósticos/tests). */
  versions(): number[] {
    return [...this.keys.keys()].sort((a, b) => a - b);
  }

  keyFor(version: number): Buffer {
    const key = this.keys.get(version);
    if (!key) {
      throw new Error(`No hay clave para la versión v${version} (¿clave retirada demasiado pronto?)`);
    }
    return key;
  }

  /** Anillo nuevo con una clave añadida (opcionalmente marcada como activa). */
  withKey(entry: VersionedKey, makeActive = false): KeyRing {
    const existing: VersionedKey[] = this.versions().map((v) => ({
      version: v,
      key: this.keyFor(v),
    }));
    return new KeyRing([...existing, entry], makeActive ? entry.version : this.activeVersion);
  }

  /** Anillo nuevo sin la versión dada (retirar una clave vieja ya no usada). */
  withoutVersion(version: number): KeyRing {
    if (version === this.activeVersion) {
      throw new Error("No se puede retirar la clave activa");
    }
    const remaining: VersionedKey[] = this.versions()
      .filter((v) => v !== version)
      .map((v) => ({ version: v, key: this.keyFor(v) }));
    return new KeyRing(remaining, this.activeVersion);
  }
}

/**
 * Parsea una definición de claves desde entorno. Formato: una o varias entradas separadas por
 * coma, cada una `v<n>:<base64-32bytes>`. La de mayor versión es la activa por defecto.
 * También acepta una sola clave cruda base64 (sin prefijo), que se interpreta como v1.
 *
 * Ej: `ENCRYPTION_KEYS="v2:AAAA...,v1:BBBB..."` ⇒ v2 activa, v1 solo para descifrar.
 */
export function keyRingFromEnv(raw: string, activeVersionOverride?: number): KeyRing {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("ENCRYPTION_KEYS vacío");
  }
  const entries = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  const parsed: VersionedKey[] = entries.map((entry) => {
    const match = entry.match(/^v(\d+):(.+)$/);
    if (match && match[1] && match[2]) {
      return { version: Number(match[1]), key: decodeKey(match[2]) };
    }
    // Clave cruda sin prefijo ⇒ v1.
    return { version: 1, key: decodeKey(entry) };
  });
  return new KeyRing(parsed, activeVersionOverride);
}

function decodeKey(b64: string): Buffer {
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `Clave de cifrado inválida: se esperaban ${KEY_BYTES} bytes en base64, se obtuvieron ${buf.length}`,
    );
  }
  return buf;
}

/** Genera una clave AES-256 aleatoria en base64 (utilidad para provisioning/rotación). */
export function generateKeyBase64(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

/**
 * Cifra bytes crudos con la clave activa. Devuelve un sobre binario:
 * `[1B versionLen][versionAscii][12B IV][ciphertext][16B tag]`.
 * Autenticado: cualquier alteración se detecta al descifrar.
 */
export function encryptBytes(ring: KeyRing, plaintext: Uint8Array): Buffer {
  const version = ring.active;
  const key = ring.keyFor(version);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const versionAscii = Buffer.from(String(version), "ascii");
  const header = Buffer.from([versionAscii.length]);
  return Buffer.concat([header, versionAscii, iv, ct, tag]);
}

/** Descifra un sobre binario producido por `encryptBytes` (elige la clave por su versión). */
export function decryptBytes(ring: KeyRing, envelope: Uint8Array): Buffer {
  const buf = Buffer.from(envelope);
  const versionLen = buf[0];
  if (versionLen === undefined || buf.length < 1 + versionLen + IV_BYTES + TAG_BYTES) {
    throw new Error("Sobre cifrado corrupto o truncado");
  }
  const version = Number(buf.subarray(1, 1 + versionLen).toString("ascii"));
  const key = ring.keyFor(version);
  const ivStart = 1 + versionLen;
  const iv = buf.subarray(ivStart, ivStart + IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ct = buf.subarray(ivStart + IV_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/**
 * Cifra un string UTF-8 y devuelve el sobre en formato texto (para columnas de BD):
 * `enc:v<version>:<base64(iv+ct+tag)>`. Autoprefijado ⇒ `isEncrypted` distingue de texto plano.
 */
export function encryptString(ring: KeyRing, plaintext: string): string {
  const version = ring.active;
  const key = ring.keyFor(version);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, ct, tag]).toString("base64");
  return `${ENVELOPE_PREFIX}:v${version}:${payload}`;
}

/** Descifra un sobre en formato texto producido por `encryptString`. */
export function decryptString(ring: KeyRing, envelope: string): string {
  if (!isEncrypted(envelope)) {
    throw new Error("La cadena no tiene el prefijo de sobre cifrado");
  }
  const parts = envelope.split(":");
  if (parts.length !== 3 || !parts[1] || !parts[2]) {
    throw new Error("Sobre cifrado mal formado");
  }
  const version = Number(parts[1].slice(1));
  const key = ring.keyFor(version);
  const raw = Buffer.from(parts[2], "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(raw.length - TAG_BYTES);
  const ct = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** ¿La cadena es un sobre cifrado (tiene el prefijo)? Útil para migración incremental. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${ENVELOPE_PREFIX}:v`);
}

/**
 * Cifra si aún no lo está (idempotente). Permite convivencia de filas heredadas en claro con
 * las nuevas cifradas durante la migración.
 */
export function ensureEncrypted(ring: KeyRing, value: string | null): string | null {
  if (value == null) return value;
  return isEncrypted(value) ? value : encryptString(ring, value);
}

/** Descifra si está cifrado; si es texto plano heredado lo devuelve tal cual. */
export function maybeDecrypt(ring: KeyRing, value: string | null): string | null {
  if (value == null) return value;
  return isEncrypted(value) ? decryptString(ring, value) : value;
}

/**
 * Recifra un sobre con la clave ACTIVA del anillo (E12-T2, rotación). Descifra con la clave que
 * indique el propio sobre (que debe seguir en el anillo) y vuelve a cifrar con la activa. Si ya
 * está bajo la clave activa, lo devuelve intacto (idempotente).
 */
export function reencrypt(ring: KeyRing, envelope: string): string {
  const parts = envelope.split(":");
  if (parts.length === 3 && parts[1] && Number(parts[1].slice(1)) === ring.active) {
    return envelope; // ya bajo la clave activa
  }
  return encryptString(ring, decryptString(ring, envelope));
}

/** Comparación en tiempo constante de dos buffers (evita fuga por temporización). */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
