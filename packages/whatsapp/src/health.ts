/**
 * Health checks del pool por número (E07-T9). Cada número/instancia reporta un estado de
 * salud consultable que la Épica 8 (selección de número sano) consumirá vía `getPoolHealth()`.
 *
 * Dos piezas:
 * - `healthFromDisconnect`: mapeo PURO `DisconnectReason` (evento `connection.update` de
 *   Baileys) → estado de salud. Determina si una desconexión es un baneo (irrecuperable),
 *   una degradación transitoria (reconecta sola) o un logout (requiere nuevo QR).
 * - `HealthMonitor`: agenda un chequeo periódico (por defecto cada 60s) con reloj/intervalo
 *   inyectables. No abre conexiones: consulta el estado que las instancias ya mantienen y lo
 *   persiste. El intervalo se inyecta para poder dispararlo a mano en test sin esperar 60s.
 *
 * Diseño testeable: sin `Date.now()`/`setInterval` directos; el "tick" se controla desde
 * fuera (scheduler inyectado) para verificar deterministamente el ciclo de 60s.
 */

import { DisconnectReason } from "@whiskeysockets/baileys";

import type { WhatsAppNumberHealth } from "./types.js";

/** Intervalo por defecto del health check por número (E07-T9): cada 60s. */
export const HEALTH_CHECK_INTERVAL_MS = 60_000;

/**
 * Mapea el motivo de cierre de Baileys (`DisconnectReason`, leído del `statusCode` del Boom
 * de `connection.update`) a un estado de salud del número (E07-T9).
 *
 * - `loggedOut` / `forbidden` / `multideviceMismatch`: la sesión ya no sirve. Para nuestro
 *   modelo de riesgo esto es un número **baneado/inutilizable** (`banned`): hay que
 *   reemplazarlo (nuevo QR / nuevo número). No se reconecta solo.
 * - `badSession`: el auth-state quedó corrupto; tratamos también como `banned` (requiere
 *   re-vinculación). Radio de daño acotado: la Épica 8 dejará de enrutar a este número.
 * - `connectionClosed` / `connectionLost` / `timedOut` / `connectionReplaced` /
 *   `restartRequired`: caídas transitorias; el número está **degradado** (`degraded`) pero la
 *   instancia reconecta sola sin re-escanear QR.
 * - Sin `statusCode` reconocible: `degraded` por prudencia (no lo damos por baneado).
 */
export function healthFromDisconnect(statusCode: number | undefined): WhatsAppNumberHealth {
  switch (statusCode) {
    case DisconnectReason.loggedOut:
    case DisconnectReason.forbidden:
    case DisconnectReason.multideviceMismatch:
    case DisconnectReason.badSession:
      return "banned";
    case DisconnectReason.connectionClosed:
    case DisconnectReason.connectionLost:
    case DisconnectReason.timedOut:
    case DisconnectReason.connectionReplaced:
    case DisconnectReason.restartRequired:
      return "degraded";
    default:
      return "degraded";
  }
}

/** Extrae el `DisconnectReason` (statusCode) del error Boom de cierre, o `undefined`. */
export function disconnectStatusCode(error: unknown): number | undefined {
  return (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

/** Fuente del estado de salud actual de un número (lo implementa el pool sobre sus instancias). */
export interface HealthProbe {
  /** Estado de salud vigente en memoria del número, o `null` si la instancia no existe. */
  currentHealth(waNumberId: string): WhatsAppNumberHealth | null;
}

/** Persiste el estado de salud de un número (adaptador Prisma en apps/workers). */
export interface HealthStore {
  saveHealth(waNumberId: string, health: WhatsAppNumberHealth): Promise<void>;
}

/** Programador de intervalos inyectable (en prod `setInterval`; en test se dispara a mano). */
export interface IntervalScheduler {
  /** Agenda `fn` cada `ms`; devuelve un handle para cancelar. */
  schedule(fn: () => void, ms: number): { cancel(): void };
}

/** Scheduler real basado en `setInterval` (producción). */
export const realIntervalScheduler: IntervalScheduler = {
  schedule(fn, ms) {
    const handle = setInterval(fn, ms);
    // No mantiene vivo el proceso solo por el health check.
    if (typeof handle.unref === "function") handle.unref();
    return { cancel: () => clearInterval(handle) };
  },
};

/** Dependencias del monitor de salud (E07-T9). */
export interface HealthMonitorDeps {
  readonly probe: HealthProbe;
  readonly store: HealthStore;
  readonly scheduler?: IntervalScheduler;
  readonly intervalMs?: number;
  /** Números a chequear cada tick. Se recalcula por tick (números pueden entrar/salir). */
  readonly numbersToCheck: () => readonly string[];
  readonly onError?: (waNumberId: string, error: unknown) => void;
}

/**
 * Chequea la salud de cada número cada `intervalMs` (60s por defecto) y la persiste (E07-T9).
 * No hace I/O de red: lee el estado que las instancias mantienen (`probe`) y lo vuelca al
 * store. El tick es idempotente y se puede disparar a mano (`tick()`) en test.
 */
export class HealthMonitor {
  private handle: { cancel(): void } | undefined;
  private readonly intervalMs: number;
  private readonly scheduler: IntervalScheduler;

  constructor(private readonly deps: HealthMonitorDeps) {
    this.intervalMs = deps.intervalMs ?? HEALTH_CHECK_INTERVAL_MS;
    this.scheduler = deps.scheduler ?? realIntervalScheduler;
  }

  /** Arranca el chequeo periódico. Idempotente: no agenda dos veces. */
  start(): void {
    if (this.handle) return;
    this.handle = this.scheduler.schedule(() => {
      void this.tick();
    }, this.intervalMs);
  }

  /** Detiene el chequeo periódico. */
  stop(): void {
    this.handle?.cancel();
    this.handle = undefined;
  }

  /**
   * Un ciclo de chequeo: para cada número consultable, persiste su salud actual. Aislado por
   * número: un fallo persistiendo uno no impide chequear los demás.
   */
  async tick(): Promise<void> {
    for (const waNumberId of this.deps.numbersToCheck()) {
      const health = this.deps.probe.currentHealth(waNumberId);
      if (health == null) continue; // instancia no presente: nada que persistir
      try {
        await this.deps.store.saveHealth(waNumberId, health);
      } catch (error) {
        this.deps.onError?.(waNumberId, error);
      }
    }
  }
}
