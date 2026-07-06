import {
  type AuthenticationCreds,
  type AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";

import type { WaSessionStore } from "./types.js";

/**
 * Forma serializable del auth-state completo de una instancia Baileys (E07-T1).
 *
 * Baileys separa el estado en `creds` (identidad del dispositivo, cambia poco) y `keys`
 * (material Signal por tipo/id: pre-keys, sesiones, sender-keys, app-state-sync…, cambia
 * constantemente). `useMultiFileAuthState` guarda cada pieza en un archivo distinto; aquí
 * las guardamos TODAS en un único blob JSON (`WaSession.authState`), porque Postgres nos
 * da atomicidad y no queremos una fila por key.
 *
 * Ambos sub-árboles contienen `Buffer`/`Uint8Array`, que JSON no representa nativamente.
 * Baileys resuelve esto con `BufferJSON.replacer`/`reviver` (marca los buffers con
 * `{ type: "Buffer", data: [...] }` al serializar y los reconstruye al leer). Respetamos
 * EXACTAMENTE ese formato: serializamos con `JSON.stringify(x, BufferJSON.replacer)` y
 * revivimos con `JSON.parse(x, BufferJSON.reviver)`.
 */
interface SerializedAuthState {
  creds: AuthenticationCreds;
  /** `keys[categoría][id] = valor`. Categorías = claves de `SignalDataTypeMap`. */
  keys: Record<string, Record<string, unknown>>;
}

/** Serializa `{creds, keys}` a un objeto JSON-safe (buffers → `{type:"Buffer",data}`). */
export function serializeAuthState(creds: AuthenticationCreds, keys: SerializedAuthState["keys"]): unknown {
  // `BufferJSON.replacer` es un reviver/replacer de JSON.stringify: para aplicarlo sin
  // producir un string, hacemos el round-trip stringify→parse. El resultado es un objeto
  // plano JSON-safe listo para guardar como `Json` en Prisma.
  return JSON.parse(JSON.stringify({ creds, keys }, BufferJSON.replacer)) as unknown;
}

/** Revive un blob JSON persistido de vuelta a `{creds, keys}` (buffers reconstruidos). */
export function deserializeAuthState(raw: unknown): SerializedAuthState {
  // El blob viene de Prisma ya como objeto (no string); lo re-stringify-amos para pasar
  // por `BufferJSON.reviver`, que reconstruye los `Buffer` desde `{type:"Buffer",data}`.
  return JSON.parse(JSON.stringify(raw), BufferJSON.reviver) as SerializedAuthState;
}

/** Resultado de `useDbAuthState`: el `state` para pasar a `makeWASocket` y `saveCreds`. */
export interface DbAuthState {
  state: AuthenticationState;
  /** Persiste el estado completo (creds + keys) en la BD. Llamar en `creds.update`. */
  saveCreds: () => Promise<void>;
}

/**
 * Equivalente a `useMultiFileAuthState` de Baileys pero respaldado en Postgres vía
 * `WaSessionStore` (E07-T1). Carga el auth-state persistido del número (o inicializa uno
 * nuevo con `initAuthCreds()` si es la primera vinculación), mantiene las `keys` en memoria
 * y las persiste junto con `creds` en cada cambio.
 *
 * Persistir el estado completo en cada `set`/`saveCreds` es lo que hace que la instancia
 * reconecte tras un reinicio de proceso SIN re-escanear QR: al arrancar, `loadAuthState`
 * devuelve el mismo `creds`+`keys` con que quedó, y Baileys retoma la sesión.
 */
export async function useDbAuthState(store: WaSessionStore, waNumberId: string): Promise<DbAuthState> {
  const persisted = await store.loadAuthState(waNumberId);
  const restored = persisted !== null ? deserializeAuthState(persisted) : null;

  const creds: AuthenticationCreds = restored?.creds ?? initAuthCreds();
  // Cache en memoria de las keys por categoría; espejo de lo persistido.
  const keys: SerializedAuthState["keys"] = restored?.keys ?? {};

  const persist = async (): Promise<void> => {
    await store.saveAuthState(waNumberId, serializeAuthState(creds, keys));
  };

  const state: AuthenticationState = {
    creds,
    keys: {
      get: <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const category = keys[type] ?? {};
        const result: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          let value = category[id];
          // Las app-state-sync-key se guardan como objeto plano y Baileys las espera como
          // instancia de proto (`useMultiFileAuthState` hace lo mismo al leerlas).
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(
              value as Record<string, unknown>,
            );
          }
          if (value !== undefined && value !== null) {
            result[id] = value as SignalDataTypeMap[T];
          }
        }
        return result;
      },
      set: async (data) => {
        for (const category in data) {
          const bucket = (keys[category] ??= {});
          const entries = data[category as keyof typeof data] ?? {};
          for (const id in entries) {
            const value = entries[id];
            if (value === null || value === undefined) {
              delete bucket[id];
            } else {
              bucket[id] = value;
            }
          }
        }
        await persist();
      },
    },
  };

  return { state, saveCreds: persist };
}
