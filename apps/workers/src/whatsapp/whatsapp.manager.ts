import {
  type BusinessHours,
  HealthMonitor,
  realSleep,
  type ResolvedVerdict,
  WhatsAppInstance,
  WhatsAppPool,
} from "@check/whatsapp";
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { env } from "../env";
import { StorageService } from "../storage/storage.service";
import {
  VERDICT_POLL_BATCH_SIZE,
  VERDICT_POLL_INTERVAL_MS,
} from "./whatsapp.constants";
import { WhatsAppStore } from "./whatsapp.store";

/**
 * Orquestador multi-instancia del pool WhatsApp en los workers (Épica 7, Grupo C).
 *
 * E07-T7: levanta N `WhatsAppInstance` (una por `WaNumber` poolable), cada una con su
 * auth-state persistido (E07-T1) y aislada de las demás (`WhatsAppPool`). Al arrancar, la
 * lista de números a levantar sale de `store.listPoolableNumberIds()` (pasaron warmeo y no
 * están baneados). Si `WHATSAPP_WA_NUMBER_ID` está fijado, se limita a ese número (modo
 * single-número, compatible con Grupo A).
 *
 * E07-T9: un `HealthMonitor` persiste la salud de cada número cada 60s (estado que las
 * instancias mantienen desde los eventos de Baileys). La consulta de salud del pool para la
 * Épica 8 vive en `store.getPoolHealth()`.
 *
 * E07-T3/T7: el poller de veredictos sondea los comprobantes resueltos de TODOS los números
 * del pool y enruta cada respuesta a su instancia dueña.
 *
 * Se activa solo con `WHATSAPP_ENABLED=true`; si no, los workers corren solo el pipeline
 * OCR/verificación (comportamiento anterior).
 */
@Injectable()
export class WhatsAppManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("whatsapp-manager");
  private pool: WhatsAppPool | undefined;
  private healthMonitor: HealthMonitor | undefined;
  private verdictPollTimer: NodeJS.Timeout | undefined;
  private polling = false;

  constructor(
    @Inject(WhatsAppStore) private readonly store: WhatsAppStore,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!env.WHATSAPP_ENABLED) {
      this.logger.log("WhatsApp deshabilitado (WHATSAPP_ENABLED=false): no se levanta el pool");
      return;
    }

    // El pool crea cada instancia bajo demanda vía esta factory (E07-T7): mismo cableado de
    // puertos que el Grupo A, ahora por número.
    this.pool = new WhatsAppPool({
      logger: {
        info: (msg) => this.logger.log(msg),
        warn: (msg) => this.logger.warn(msg),
        error: (msg) => this.logger.error(msg),
      },
      instanceFactory: (waNumberId) => this.buildInstance(waNumberId),
    });

    const numberIds = await this.resolveNumbersToStart();
    if (numberIds.length === 0) {
      this.logger.warn("No hay números poolables que levantar (¿todos en warmeo o baneados?)");
    }
    await this.pool.start(numberIds);

    // E07-T9: health check por número cada 60s. Vuelca a `WaNumber.health` el estado que cada
    // instancia mantiene (connected/degraded/banned). La lista se recalcula por tick para
    // reflejar altas/bajas del pool.
    this.healthMonitor = new HealthMonitor({
      probe: { currentHealth: (id) => this.pool?.currentHealth(id) ?? null },
      store: this.store,
      numbersToCheck: () => this.pool?.numberIds() ?? [],
      onError: (id, error) =>
        this.logger.error(`No se pudo persistir la salud de ${id}: ${errMsg(error)}`),
    });
    this.healthMonitor.start();

    // E07-T3/T7: poller de veredictos resueltos → respuesta del semáforo, para todos los
    // números del pool.
    this.verdictPollTimer = setInterval(() => {
      void this.pollVerdicts();
    }, VERDICT_POLL_INTERVAL_MS);
    this.logger.log(
      `Pool activo con ${numberIds.length} número(s); health cada 60s; poller cada ${VERDICT_POLL_INTERVAL_MS}ms`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.verdictPollTimer) clearInterval(this.verdictPollTimer);
    this.healthMonitor?.stop();
    await this.pool?.stopAll();
  }

  /**
   * Números a levantar al arrancar (E07-T7). Con `WHATSAPP_WA_NUMBER_ID` fijado se limita a ese
   * número (modo single, Grupo A). Si no, todos los poolables (pasaron warmeo, no baneados).
   */
  private async resolveNumbersToStart(): Promise<string[]> {
    if (env.WHATSAPP_WA_NUMBER_ID) return [env.WHATSAPP_WA_NUMBER_ID];
    return this.store.listPoolableNumberIds();
  }

  /** Construye una `WhatsAppInstance` cableada a los puertos Prisma/Storage para un número. */
  private buildInstance(waNumberId: string): WhatsAppInstance {
    return new WhatsAppInstance({
      waNumberId,
      sessionStore: this.store,
      businessResolver: this.store,
      storage: this.storage,
      ingestStore: this.store,
      ocrEnqueuer: this.store,
      contextReader: this.store,
      // Grupo B: rotación de plantillas (E07-T5) y motor de warmeo (E07-T6) persistidos en
      // `WaNumber` vía el mismo store Prisma.
      templateRotation: this.store,
      warmup: this.store,
      // Humanización anti-baneo (E07-T4): reloj/aleatoriedad/sleep reales en producción;
      // horario del negocio configurable por env (fuera de horario no se responde).
      humanizer: {
        clock: () => Date.now(),
        random: () => Math.random(),
        sleep: realSleep,
        businessHours: this.resolveBusinessHours(),
      },
      logger: {
        info: (msg) => this.logger.log(msg),
        warn: (msg) => this.logger.warn(msg),
        error: (msg) => this.logger.error(msg),
      },
      callbacks: {
        // E07-T1: el QR de vinculación se expone aquí. En un despliegue real lo tomaría un
        // canal de onboarding (dashboard/CLI); por ahora se loguea para vincular el número.
        onQr: (qr) => this.logger.warn(`QR de vinculación para ${waNumberId} (escanéalo):\n${qr}`),
        onConnected: () => this.logger.log(`Instancia ${waNumberId} lista`),
        onLoggedOut: () =>
          this.logger.error(`Instancia ${waNumberId} deslogueada/baneada: re-vincular (nuevo QR)`),
      },
    });
  }

  /**
   * Horario del negocio para la humanización (E07-T4), leído de env. Si no se configuraron
   * ambas horas (inicio/fin), devuelve `undefined` ⇒ la instancia responde 24/7.
   */
  private resolveBusinessHours(): BusinessHours | undefined {
    const startHour = env.WHATSAPP_BUSINESS_START_HOUR;
    const endHour = env.WHATSAPP_BUSINESS_END_HOUR;
    if (startHour == null || endHour == null) return undefined;
    return { startHour, endHour, utcOffsetMinutes: env.WHATSAPP_BUSINESS_UTC_OFFSET_MINUTES };
  }

  /** Un ciclo del poller (E07-T3/T7): responde los veredictos resueltos de todo el pool. */
  private async pollVerdicts(): Promise<void> {
    if (this.polling || !this.pool) return; // evita solapamiento de ciclos
    this.polling = true;
    try {
      const numberIds = this.pool.numberIds();
      const pending = await this.store.findPendingVerdictNotificationsForNumbers(
        numberIds,
        VERDICT_POLL_BATCH_SIZE,
      );
      for (const item of pending) {
        await this.notifyOne(item.waNumberId, item.voucherId, item.verdict);
      }
    } catch (error) {
      this.logger.error(`Poller de veredictos falló: ${errMsg(error)}`);
    } finally {
      this.polling = false;
    }
  }

  private async notifyOne(
    waNumberId: string,
    voucherId: string,
    verdict: ResolvedVerdict,
  ): Promise<void> {
    try {
      const sent = await this.pool!.sendVerdict(waNumberId, voucherId, verdict);
      if (sent) {
        // Solo marcamos como notificado si el envío tuvo éxito: si falla, el próximo ciclo
        // reintenta (el 🟡 sigue vigente para el cliente mientras tanto).
        await this.store.markNotified(voucherId);
        this.logger.log(`Veredicto ${verdict} respondido para voucher ${voucherId}`);
      }
    } catch (error) {
      this.logger.error(`No se pudo responder el veredicto del voucher ${voucherId}: ${errMsg(error)}`);
    }
  }
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
