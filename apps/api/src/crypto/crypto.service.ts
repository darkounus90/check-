import {
  decryptBytes,
  encryptBytes,
  ensureEncrypted,
  isEncrypted,
  KeyRing,
  keyRingFromEnv,
  maybeDecrypt,
  reencrypt,
} from "@check/shared";
import { Injectable, Logger } from "@nestjs/common";

import { env } from "../env";

/**
 * Servicio de cifrado en reposo (Épica 12, E12-T1/T2). Envuelve el `KeyRing` de `@check/shared`
 * con la clave configurada en `ENCRYPTION_KEYS`. Si no hay clave configurada, opera en modo
 * "passthrough" (deja los datos en claro) y lo advierte — aceptable solo en dev; en producción
 * `ENCRYPTION_KEYS` debe estar definido.
 *
 * Diseño: `enabled` expone si el cifrado está activo, para que los llamadores (habeas data,
 * auditoría de descifrado) sepan si están manejando datos cifrados.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger("crypto");
  private readonly ring: KeyRing | null;

  constructor() {
    // Se lee de `process.env` en construcción (no del `env` congelado al importar) para que
    // sea configurable en runtime/tests. `NODE_ENV` sí viene del env validado.
    const keys = process.env.ENCRYPTION_KEYS;
    if (keys) {
      this.ring = keyRingFromEnv(keys);
    } else {
      this.ring = null;
      if (env.NODE_ENV === "production") {
        this.logger.error(
          "ENCRYPTION_KEYS no está definido en producción: los datos sensibles NO se cifrarán.",
        );
      } else {
        this.logger.warn("ENCRYPTION_KEYS no definido: cifrado en reposo desactivado (dev).");
      }
    }
  }

  get enabled(): boolean {
    return this.ring !== null;
  }

  /** Cifra un string si hay clave; idempotente sobre valores ya cifrados o texto plano. */
  encryptString(value: string | null): string | null {
    if (!this.ring || value == null) return value;
    return ensureEncrypted(this.ring, value);
  }

  /** Descifra un string cifrado; texto plano heredado pasa tal cual. */
  decryptString(value: string | null): string | null {
    if (!this.ring || value == null) return value;
    return maybeDecrypt(this.ring, value);
  }

  /** Cifra bytes (artefacto de Storage) con la clave activa. Sin clave, devuelve los bytes. */
  encryptBytes(bytes: Uint8Array): Uint8Array {
    if (!this.ring) return bytes;
    return encryptBytes(this.ring, bytes);
  }

  /** Descifra bytes cifrados por `encryptBytes`. Sin clave, devuelve los bytes. */
  decryptBytes(bytes: Uint8Array): Uint8Array {
    if (!this.ring) return bytes;
    return decryptBytes(this.ring, bytes);
  }

  /** Recifra un sobre bajo la clave activa (rotación, E12-T2). */
  reencrypt(value: string): string {
    if (!this.ring) return value;
    return reencrypt(this.ring, value);
  }

  isEncrypted(value: string | null | undefined): boolean {
    return isEncrypted(value);
  }
}
