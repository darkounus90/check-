/**
 * Orquestador multi-instancia del pool WhatsApp (E07-T7). Generaliza el manejo de UNA
 * instancia (Grupo A) a N números corriendo en paralelo dentro de `apps/workers`, cada uno
 * como una `WhatsAppInstance` aislada con su propio auth-state.
 *
 * AISLAMIENTO (aceptación E07-T7): la caída de una instancia no tumba las demás.
 * - Arranque (`start`): cada instancia se levanta de forma independiente; si una falla al
 *   arrancar, se registra su error y se marca `banned`, pero el resto siguen levantándose.
 * - Envío (`sendVerdict`): se enruta a la instancia dueña del número; un fallo de una no
 *   afecta a las otras.
 * - Parada (`stop`): se detienen todas aunque alguna falle al cerrar.
 *
 * SELECCIÓN DE ENTRADA AL POOL: solo se levantan los números elegibles (`isPoolEligible`, es
 * decir que completaron su warmeo E07-T6) además de estar activos. El criterio de elegibilidad
 * lo decide el llamador (apps/workers) al construir la lista de números a levantar.
 *
 * SALUD (E07-T9): `getPoolHealth()` devuelve el estado de salud por número que la Épica 8
 * (selección de número sano) consumirá. Es una lectura en memoria del estado que cada
 * instancia mantiene.
 *
 * Diseño testeable: la creación de instancias se inyecta (`instanceFactory`), de modo que en
 * test se sustituye por instancias fake sin abrir sockets Baileys ni tocar BD.
 */

import type { WhatsAppInstance } from "./instance.js";
import type { ResolvedVerdict, WhatsAppNumberHealth } from "./types.js";

/** Subconjunto de `WhatsAppInstance` que el pool necesita (para poder mockear en test). */
export interface PoolInstance {
  readonly waNumberId: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): WhatsAppNumberHealth;
  sendVerdict(voucherId: string, verdict: ResolvedVerdict): Promise<boolean>;
}

/** Crea la instancia gestionada de un número (en prod construye una `WhatsAppInstance` real). */
export type InstanceFactory = (waNumberId: string) => PoolInstance;

/** Logger mínimo del pool (mismo contrato que el de la instancia). */
export interface PoolLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/** Salud de un número del pool, lista para exponer a la Épica 8 (E07-T9). */
export interface PoolNumberHealth {
  readonly waNumberId: string;
  readonly health: WhatsAppNumberHealth;
}

export interface WhatsAppPoolDeps {
  readonly instanceFactory: InstanceFactory;
  readonly logger: PoolLogger;
}

/**
 * Pool de instancias WhatsApp (E07-T7). Mantiene un mapa `waNumberId → instancia` y garantiza
 * que las operaciones de ciclo de vida están aisladas por número.
 */
export class WhatsAppPool {
  private readonly instances = new Map<string, PoolInstance>();

  constructor(private readonly deps: WhatsAppPoolDeps) {}

  /**
   * Levanta las instancias de los `waNumberIds` dados en paralelo y aisladas (E07-T7). Un
   * fallo al arrancar una NO impide arrancar las demás: se loguea y esa instancia queda
   * registrada (su salud reflejará el fallo). Idempotente por número: no re-levanta uno ya
   * presente. Devuelve los ids que arrancaron con éxito.
   */
  async start(waNumberIds: readonly string[]): Promise<string[]> {
    const results = await Promise.allSettled(
      waNumberIds.map(async (waNumberId) => {
        if (this.instances.has(waNumberId)) return waNumberId; // ya levantado
        const instance = this.deps.instanceFactory(waNumberId);
        // Registramos ANTES de arrancar: si `start` falla, la instancia sigue consultable
        // (su `health()` reportará el estado degradado/baneado) y el fallo queda aislado.
        this.instances.set(waNumberId, instance);
        await instance.start();
        return waNumberId;
      }),
    );

    const started: string[] = [];
    results.forEach((result, i) => {
      const waNumberId = waNumberIds[i]!;
      if (result.status === "fulfilled") {
        started.push(result.value);
      } else {
        // Aislamiento: el fallo de esta instancia no tumba el resto (Promise.allSettled).
        this.deps.logger.error(
          `Instancia ${waNumberId} falló al arrancar (aislada del resto): ${errMsg(result.reason)}`,
        );
      }
    });
    this.deps.logger.info(
      `Pool arrancado: ${started.length}/${waNumberIds.length} instancias activas`,
    );
    return started;
  }

  /** Añade y arranca un solo número en caliente (reemplazo tras baneo, E07-T10). */
  async add(waNumberId: string): Promise<boolean> {
    const [started] = await this.start([waNumberId]);
    return started === waNumberId;
  }

  /** Detiene y quita una instancia del pool (sin borrar su sesión persistida). */
  async remove(waNumberId: string): Promise<void> {
    const instance = this.instances.get(waNumberId);
    if (!instance) return;
    this.instances.delete(waNumberId);
    try {
      await instance.stop();
    } catch (error) {
      this.deps.logger.error(`Instancia ${waNumberId} falló al detenerse: ${errMsg(error)}`);
    }
  }

  /** Detiene TODAS las instancias, aislando fallos de cierre. */
  async stopAll(): Promise<void> {
    const all = [...this.instances.values()];
    this.instances.clear();
    await Promise.allSettled(
      all.map(async (instance) => {
        try {
          await instance.stop();
        } catch (error) {
          this.deps.logger.error(
            `Instancia ${instance.waNumberId} falló al detenerse: ${errMsg(error)}`,
          );
        }
      }),
    );
  }

  /** ¿Está esa instancia levantada en el pool? */
  has(waNumberId: string): boolean {
    return this.instances.has(waNumberId);
  }

  /** Ids de los números actualmente gestionados por el pool. */
  numberIds(): string[] {
    return [...this.instances.keys()];
  }

  /**
   * Enruta el envío de un veredicto a la instancia dueña del número (E07-T7). Si el número no
   * está en el pool, devuelve `false` (nadie a quien enrutar); el fallo queda contenido en esa
   * instancia. La instancia además verifica que el voucher le pertenece (defensa en profundidad).
   */
  async sendVerdict(
    waNumberId: string,
    voucherId: string,
    verdict: ResolvedVerdict,
  ): Promise<boolean> {
    const instance = this.instances.get(waNumberId);
    if (!instance) {
      this.deps.logger.warn(
        `No hay instancia para ${waNumberId}: no se puede responder el voucher ${voucherId}`,
      );
      return false;
    }
    return instance.sendVerdict(voucherId, verdict);
  }

  /** Salud actual (en memoria) de un número, o `null` si no está en el pool (probe E07-T9). */
  currentHealth(waNumberId: string): WhatsAppNumberHealth | null {
    return this.instances.get(waNumberId)?.health() ?? null;
  }

  /**
   * Salud de TODO el pool por número (E07-T9). Contrato que la Épica 8 (selección de número
   * sano) consume: para cada número gestionado, su estado de salud vigente. Lectura en
   * memoria, sin I/O.
   */
  getPoolHealth(): PoolNumberHealth[] {
    return [...this.instances.values()].map((instance) => ({
      waNumberId: instance.waNumberId,
      health: instance.health(),
    }));
  }
}

/** Adapta una `WhatsAppInstance` real al contrato `PoolInstance` (identidad estructural). */
export function asPoolInstance(instance: WhatsAppInstance): PoolInstance {
  return instance;
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
