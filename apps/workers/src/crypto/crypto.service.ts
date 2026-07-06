import {
  decryptBytes,
  decryptString,
  encryptBytes,
  encryptString,
  isEncrypted,
  KeyRing,
  keyRingFromEnv,
} from "@check/shared";
import { Injectable, Logger } from "@nestjs/common";

import { env } from "../env";

/**
 * Servicio de cifrado en reposo de los workers (Épica 12, E12-T1). Espejo del `CryptoService`
 * de `apps/api`: envuelve el `KeyRing` con la clave de `ENCRYPTION_KEYS`. Cifra el auth-state
 * de WhatsApp (`WaSession.authState`) y los artefactos de comprobante antes de subirlos.
 *
 * Sin `ENCRYPTION_KEYS` opera en passthrough (dev). El auth-state se guarda como JSON en la BD:
 * lo ciframos serializándolo a string y envolviéndolo en `{ enc: "<sobre>" }` para distinguir
 * un blob cifrado de un auth-state en claro heredado.
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

  /**
   * Cifra un objeto JSON (auth-state de Baileys) para persistirlo. Devuelve un sobre
   * `{ enc: "<envelope>" }`. Sin clave, devuelve el objeto tal cual.
   */
  encryptJson(value: unknown): unknown {
    if (!this.ring) return value;
    return { enc: encryptString(this.ring, JSON.stringify(value)) };
  }

  /** Descifra un objeto persistido por `encryptJson`; si es JSON en claro heredado, lo devuelve. */
  decryptJson(value: unknown): unknown {
    if (!this.ring || value == null) return value;
    if (typeof value === "object" && value !== null && "enc" in value) {
      const envelope = (value as { enc: unknown }).enc;
      if (typeof envelope === "string" && isEncrypted(envelope)) {
        return JSON.parse(decryptString(this.ring, envelope));
      }
    }
    return value;
  }

  /** Cifra bytes (artefacto de Storage) con la clave activa. */
  encryptBytes(bytes: Uint8Array): Uint8Array {
    if (!this.ring) return bytes;
    return encryptBytes(this.ring, bytes);
  }

  /** Descifra bytes cifrados por `encryptBytes`. */
  decryptBytes(bytes: Uint8Array): Uint8Array {
    if (!this.ring) return bytes;
    return decryptBytes(this.ring, bytes);
  }
}
