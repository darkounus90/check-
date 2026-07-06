import {
  type BusinessHours,
  realSleep,
  type ResolvedVerdict,
  WhatsAppInstance,
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
 * Proceso gestionado de la instancia WhatsApp en los workers (Épica 7, Grupo A). Levanta
 * UNA instancia Baileys (E07-T7 multi-instancia es otra ola) para el `WaNumber` configurado
 * por env, con auth-state persistido en Postgres (E07-T1), e ingesta/respuesta enganchadas
 * a los puertos implementados en `WhatsAppStore` (E07-T2/T3).
 *
 * Se activa solo con `WHATSAPP_ENABLED=true` y `WHATSAPP_WA_NUMBER_ID` presente; si no,
 * los workers corren solo el pipeline OCR/verificación (comportamiento anterior).
 *
 * `@check/whatsapp` es ESM y estos workers son CJS: se importa igual que el resto de
 * packages ESM del monorepo (`@check/database`, `@check/ocr`), vía el `require(ESM)` que
 * soporta Node ≥ 22 (probado en 24). No hace falta dynamic import.
 */
@Injectable()
export class WhatsAppManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("whatsapp-manager");
  private instance: WhatsAppInstance | undefined;
  private verdictPollTimer: NodeJS.Timeout | undefined;
  private polling = false;

  constructor(
    @Inject(WhatsAppStore) private readonly store: WhatsAppStore,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!env.WHATSAPP_ENABLED) {
      this.logger.log("WhatsApp deshabilitado (WHATSAPP_ENABLED=false): no se levanta instancia");
      return;
    }
    const waNumberId = env.WHATSAPP_WA_NUMBER_ID;
    if (!waNumberId) {
      this.logger.error("WHATSAPP_ENABLED=true pero falta WHATSAPP_WA_NUMBER_ID: no se levanta instancia");
      return;
    }

    this.instance = new WhatsAppInstance({
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
          this.logger.error(`Instancia ${waNumberId} deslogueada: re-vincular (nuevo QR)`),
      },
    });

    await this.instance.start();

    // E07-T3: poller de veredictos resueltos → respuesta del semáforo. Enfoque MENOS
    // invasivo: no toca el worker de verificación (E06) ni añade una cola de salida; sondea
    // las `Transaction` ya resueltas cuyo comprobante vino por WhatsApp y aún no se respondió.
    this.verdictPollTimer = setInterval(() => {
      void this.pollVerdicts(waNumberId);
    }, VERDICT_POLL_INTERVAL_MS);
    this.logger.log(`Poller de veredictos activo (cada ${VERDICT_POLL_INTERVAL_MS}ms)`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.verdictPollTimer) clearInterval(this.verdictPollTimer);
    await this.instance?.stop();
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

  /** Un ciclo del poller (E07-T3): responde los veredictos resueltos pendientes. */
  private async pollVerdicts(waNumberId: string): Promise<void> {
    if (this.polling || !this.instance) return; // evita solapamiento de ciclos
    this.polling = true;
    try {
      const pending = await this.store.findPendingVerdictNotifications(
        waNumberId,
        VERDICT_POLL_BATCH_SIZE,
      );
      for (const item of pending) {
        await this.notifyOne(item.voucherId, item.verdict);
      }
    } catch (error) {
      this.logger.error(`Poller de veredictos falló: ${errMsg(error)}`);
    } finally {
      this.polling = false;
    }
  }

  private async notifyOne(voucherId: string, verdict: ResolvedVerdict): Promise<void> {
    try {
      const sent = await this.instance!.sendVerdict(voucherId, verdict);
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
