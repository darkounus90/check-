import { randomUUID } from "node:crypto";

import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  makeCacheableSignalKeyStore,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";

/** Forma de `ILogger` (pino-like) que espera `downloadMediaMessage`; Baileys no la
 * re-exporta desde la raíz, así que la declaramos localmente (subconjunto suficiente). */
interface BaileysLogger {
  level: string;
  child(obj: Record<string, unknown>): BaileysLogger;
  trace(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

import { type DbAuthState, useDbAuthState } from "./db-auth-state.js";
import { detectVoucherMedia, isProcessableIncoming, remoteJidOf } from "./incoming.js";
import { ACK_TEMPLATE, renderVerdictMessage } from "./templates.js";
import type {
  BusinessResolver,
  OcrEnqueuer,
  ResolvedVerdict,
  VoucherContextReader,
  VoucherIngestStore,
  VoucherStorageUploader,
  WaSessionStore,
  WhatsAppInstanceCallbacks,
} from "./types.js";

/** Logger mínimo (subconjunto de `ILogger` de Baileys). Se inyecta para no acoplar a pino. */
export interface WaLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/** Dependencias de una `WhatsAppInstance` (puertos + logger + callbacks). */
export interface WhatsAppInstanceDeps {
  /** Id del `WaNumber` (fila del schema) que esta instancia representa. */
  readonly waNumberId: string;
  readonly sessionStore: WaSessionStore;
  readonly businessResolver: BusinessResolver;
  readonly storage: VoucherStorageUploader;
  readonly ingestStore: VoucherIngestStore;
  readonly ocrEnqueuer: OcrEnqueuer;
  readonly contextReader: VoucherContextReader;
  readonly logger: WaLogger;
  readonly callbacks?: WhatsAppInstanceCallbacks;
}

/**
 * Wrapper de una instancia Baileys de un único número (E07-T1/T2/T3). Grupo A de la
 * Épica 7: instancia base. Multi-instancia (E07-T7), humanización (E07-T4/T5), warmeo
 * (E07-T6), pool y health (E07-T9) son olas posteriores; para engancharlas después, TODO
 * envío de texto pasa por una única función central `sendMessage`.
 *
 * Responsabilidades:
 * - E07-T1: conectar con auth-state persistido en Postgres (`useDbAuthState`), exponer el
 *   QR de vinculación por callback, y reconectar solo (sin re-escanear QR) tras caídas
 *   transitorias o reinicio de proceso.
 * - E07-T2: al llegar una imagen/PDF, descargarla, subirla a Storage con la convención del
 *   pipeline, crear el `Voucher`, persistir el mapeo conversación↔voucher y encolar el OCR.
 * - E07-T3: responder 🟡 al recibir el comprobante y 🟢/🚨 cuando el veredicto se resuelve
 *   (`sendVerdict`, invocado por el worker que escucha veredictos).
 */
export class WhatsAppInstance {
  private socket: WASocket | undefined;
  private auth: DbAuthState | undefined;
  private stopped = false;

  constructor(private readonly deps: WhatsAppInstanceDeps) {}

  /** Arranca la instancia: carga el auth-state y abre el socket. */
  async start(): Promise<void> {
    this.stopped = false;
    this.auth = await useDbAuthState(this.deps.sessionStore, this.deps.waNumberId);
    await this.connect();
  }

  /** Cierra la instancia de forma ordenada (no borra la sesión persistida). */
  async stop(): Promise<void> {
    this.stopped = true;
    // `end()` cierra el WebSocket sin desloguear (la sesión sigue válida para reconectar).
    this.socket?.end(undefined);
    this.socket = undefined;
  }

  private async connect(): Promise<void> {
    if (!this.auth) throw new Error("WhatsAppInstance.connect llamado antes de start()");

    const socket = makeWASocket({
      auth: {
        creds: this.auth.state.creds,
        // Cachea las lecturas de keys (recomendado por Baileys para rendimiento); la
        // persistencia real la hace nuestro store en cada `set`.
        keys: makeCacheableSignalKeyStore(this.auth.state.keys),
      },
    });
    this.socket = socket;

    // Persistir creds en cada cambio es lo que permite reconectar sin re-escanear QR.
    socket.ev.on("creds.update", () => {
      void this.auth?.saveCreds().catch((error: unknown) => {
        this.deps.logger.error(`No se pudo persistir creds: ${errMsg(error)}`);
      });
    });

    socket.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        this.deps.callbacks?.onQr?.(qr);
      }
      if (connection === "open") {
        this.deps.logger.info(`Instancia ${this.deps.waNumberId} conectada`);
        this.deps.callbacks?.onConnected?.();
      }
      if (connection === "close") {
        this.handleDisconnect(lastDisconnect?.error);
      }
    });

    socket.ev.on("messages.upsert", (event) => {
      // Solo mensajes nuevos entrantes ("notify"); ignoramos sincronizaciones de historial.
      if (event.type !== "notify") return;
      for (const message of event.messages) {
        void this.handleIncoming(message).catch((error: unknown) => {
          this.deps.logger.error(`Fallo procesando mensaje entrante: ${errMsg(error)}`);
        });
      }
    });
  }

  private handleDisconnect(error: unknown): void {
    // El error de cierre es un Boom; su `output.statusCode` lleva el `DisconnectReason`.
    // Lo leemos estructuralmente para no depender de `@hapi/boom` directamente.
    const statusCode = (error as { output?: { statusCode?: number } } | undefined)?.output
      ?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;

    if (loggedOut) {
      // Sesión inválida: el número fue deslogueado. Hará falta re-escanear QR; no
      // reconectamos automáticamente (sería un bucle).
      this.deps.logger.warn(`Instancia ${this.deps.waNumberId} deslogueada (se requiere nuevo QR)`);
      this.deps.callbacks?.onLoggedOut?.();
      return;
    }

    if (this.stopped) return;

    // Caída transitoria (red, restartRequired, etc.): reconecta reutilizando el auth-state
    // persistido, sin re-escanear QR.
    this.deps.logger.warn(`Instancia ${this.deps.waNumberId} desconectada, reconectando…`);
    void this.connect().catch((e: unknown) => {
      this.deps.logger.error(`Reconexión falló: ${errMsg(e)}`);
    });
  }

  /** E07-T2 + E07-T3: ingesta del comprobante al pipeline + acuse 🟡. */
  private async handleIncoming(message: WAMessage): Promise<void> {
    if (!isProcessableIncoming(message)) return;

    const media = detectVoucherMedia(message.message);
    if (!media) return; // no es imagen/PDF procesable: se ignora

    const remoteJid = remoteJidOf(message);
    if (!remoteJid) return;

    const businessId = await this.deps.businessResolver.resolveBusinessId(this.deps.waNumberId);
    if (!businessId) {
      this.deps.logger.warn(
        `Número ${this.deps.waNumberId} sin negocio asignado: comprobante de ${remoteJid} descartado`,
      );
      return;
    }

    // Descarga los bytes del media (imagen/PDF) directamente de WhatsApp.
    const buffer = await downloadMediaMessage(message, "buffer", {}, {
      logger: baileysLogger(this.deps.logger) as never,
      reuploadRequest: this.socket!.updateMediaMessage,
    });
    const bytes = new Uint8Array(buffer);

    // MISMA convención de ruta que la ingesta pública (`{businessId}/{uuid}.{ext}`) y el
    // MISMO bucket privado `vouchers` (lo aplica el uploader inyectado en apps/workers).
    const storagePath = `${businessId}/${randomUUID()}.${media.extension}`;
    await this.deps.storage.uploadVoucher(storagePath, bytes, media.mimeType);

    const voucher = await this.deps.ingestStore.createVoucher(businessId, storagePath);
    // Persiste el mapeo conversación↔voucher para poder responder el veredicto luego.
    await this.deps.ingestStore.saveVoucherContext(voucher.id, remoteJid, this.deps.waNumberId);

    // MISMA cola OCR del pipeline (`ocr-processing`, job `ocr`, payload `{voucherId}`).
    await this.deps.ocrEnqueuer.enqueueVoucherOcr(voucher.id);
    this.deps.logger.info(`Comprobante WhatsApp ${voucher.id} de ${remoteJid} encolado para OCR`);

    // E07-T3: acuse inmediato 🟡 al chat de origen.
    await this.sendMessage(remoteJid, ACK_TEMPLATE);
  }

  /**
   * E07-T3: responde el veredicto resuelto de un comprobante al chat de origen. Lo invoca
   * el worker que escucha las resoluciones de `Transaction` (ver apps/workers). Devuelve
   * `false` si el comprobante no vino por WhatsApp (sin contexto): no hay a quién responder.
   */
  async sendVerdict(voucherId: string, verdict: ResolvedVerdict): Promise<boolean> {
    const context = await this.deps.contextReader.getVoucherContext(voucherId);
    if (!context) return false;
    // Defensa: esta instancia solo responde comprobantes que ella misma recibió.
    if (context.waNumberId !== this.deps.waNumberId) return false;
    await this.sendMessage(context.remoteJid, renderVerdictMessage(verdict));
    return true;
  }

  /**
   * ÚNICA función de envío de texto de la instancia (E07-T3). Todo outbound pasa por aquí
   * para que Grupo B (humanización E07-T4: delays, "escribiendo…", presencia; rotación de
   * plantillas E07-T5) se enganche en un solo punto sin tocar los llamadores.
   */
  async sendMessage(to: string, body: string): Promise<void> {
    if (!this.socket) throw new Error(`Instancia ${this.deps.waNumberId} no conectada`);
    await this.socket.sendMessage(to, { text: body });
  }
}

/** Adapta nuestro `WaLogger` mínimo al `ILogger` (pino-like) que espera `downloadMediaMessage`. */
function baileysLogger(logger: WaLogger): BaileysLogger {
  const noop = (): void => {};
  return {
    level: "silent",
    child: () => baileysLogger(logger),
    trace: noop,
    debug: noop,
    info: noop,
    warn: (obj: unknown) => logger.warn(String(obj)),
    error: (obj: unknown) => logger.error(String(obj)),
  };
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
