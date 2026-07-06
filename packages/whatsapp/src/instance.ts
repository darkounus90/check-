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
import { disconnectStatusCode, healthFromDisconnect } from "./health.js";
import {
  Humanizer,
  type HumanizerDeps,
  type HumanizerEffects,
  realSleep,
} from "./humanizer.js";
import { detectVoucherMedia, isProcessableIncoming, remoteJidOf } from "./incoming.js";
import { pickTemplate, type TemplateKind, templateKindForVerdict } from "./templates.js";
import type {
  BusinessResolver,
  OcrEnqueuer,
  ResolvedVerdict,
  TemplateRotationStore,
  VoucherContextReader,
  VoucherIngestStore,
  VoucherStorageUploader,
  WarmupStore,
  WaSessionStore,
  WhatsAppInstanceCallbacks,
  WhatsAppNumberHealth,
} from "./types.js";
import { canSend, registerSend } from "./warmup.js";

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
  /**
   * Configuración de humanización anti-baneo (E07-T4): reloj/aleatoriedad/sleep inyectables
   * y horario del negocio. Si se omite, se usan defaults reales (`Date.now`, `Math.random`,
   * `setTimeout`) y horario 24/7. Se inyecta en test para fijar delays y presencia.
   */
  readonly humanizer?: HumanizerDeps;
  /** Persistencia del último índice de plantilla por (número, tipo) para no repetir (E07-T5). */
  readonly templateRotation?: TemplateRotationStore;
  /** Persistencia y control del estado de warmeo del número (E07-T6): límite horario. */
  readonly warmup?: WarmupStore;
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
  /**
   * Estado de salud vigente en memoria del número (E07-T9). Arranca en `warming` (aún no
   * conectado) y transiciona con los eventos `connection.update` de Baileys. Lo lee el
   * health monitor / el pool vía `health()` para consultar y persistir el estado cada 60s.
   */
  private currentHealth: WhatsAppNumberHealth = "warming";
  /** Humanizador anti-baneo (E07-T4). Con defaults reales si no se inyecta config. */
  private readonly humanizer: Humanizer;

  constructor(private readonly deps: WhatsAppInstanceDeps) {
    this.humanizer = new Humanizer(
      deps.humanizer ?? {
        clock: () => Date.now(),
        random: () => Math.random(),
        sleep: realSleep,
      },
    );
  }

  /** Arranca la instancia: carga el auth-state y abre el socket. */
  async start(): Promise<void> {
    this.stopped = false;
    this.auth = await useDbAuthState(this.deps.sessionStore, this.deps.waNumberId);
    await this.connect();
  }

  /**
   * Estado de salud vigente del número (E07-T9): `connected` cuando el socket está abierto,
   * `degraded` en caídas transitorias (reconectando), `banned` si la sesión ya no sirve
   * (logout/forbidden/badSession), `warming` antes de la primera conexión. Lo consulta el
   * health monitor / el pool para `getPoolHealth()`. Es una lectura en memoria, sin I/O.
   */
  health(): WhatsAppNumberHealth {
    return this.currentHealth;
  }

  /** Id del `WaNumber` que esta instancia representa (identidad para el pool E07-T7). */
  get waNumberId(): string {
    return this.deps.waNumberId;
  }

  /**
   * Seam de test (E07-T4/T5/T6): inyecta un socket fake para ejercitar el pipeline de envío
   * (humanización, rotación, warmeo) sin abrir una conexión Baileys real. NO usar en prod.
   */
  setSocketForTest(socket: Pick<WASocket, "sendMessage" | "sendPresenceUpdate" | "readMessages">): void {
    this.socket = socket as WASocket;
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
        this.currentHealth = "connected"; // E07-T9: número sano
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
    const statusCode = disconnectStatusCode(error);
    // E07-T9: mapea el motivo de cierre a un estado de salud consultable/persistible. Un
    // `banned` (logout/forbidden/badSession/multideviceMismatch) es irrecuperable sin nuevo
    // QR; un `degraded` es una caída transitoria que reconecta sola.
    this.currentHealth = healthFromDisconnect(statusCode);
    const loggedOut = statusCode === DisconnectReason.loggedOut;

    if (this.currentHealth === "banned") {
      // Sesión inválida/baneada: el número ya no sirve. Hará falta re-escanear QR / reemplazar
      // el número; no reconectamos automáticamente (sería un bucle). El pool (E07-T7) dejará
      // de enrutar a este número y la Épica 8 elegirá otro sano.
      const reason = loggedOut ? "deslogueada" : `no utilizable (statusCode ${statusCode})`;
      this.deps.logger.warn(`Instancia ${this.deps.waNumberId} ${reason} (se requiere nuevo QR)`);
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

    // E07-T4: marca leído el mensaje entrante con un pequeño delay humano (nunca outbound,
    // solo un read-receipt). Se hace antes de procesar/acusar.
    await this.markReadHumanized(remoteJid, message);

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

    // E07-T3: acuse inmediato 🟡 al chat de origen (con rotación de plantilla E07-T5 y
    // humanización E07-T4 aplicadas en `sendTemplated`).
    await this.sendTemplated(remoteJid, "ack");
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
    return this.sendTemplated(context.remoteJid, templateKindForVerdict(verdict));
  }

  /**
   * Envía una respuesta de tipo `kind` (ack/verified/suspicious) rotando plantilla (E07-T5)
   * y con humanización (E07-T4). Selecciona una variante distinta de la última usada para
   * ese (número, tipo), y persiste el índice elegido. Devuelve `false` si el envío se pospuso
   * por horario del negocio (E07-T4) o por límite de warmeo (E07-T6). Si no hay store de
   * rotación configurado, usa la primera variante (comportamiento base).
   */
  private async sendTemplated(to: string, kind: TemplateKind): Promise<boolean> {
    const lastIndex = this.deps.templateRotation
      ? await this.deps.templateRotation.getLastTemplateIndex(this.deps.waNumberId, kind)
      : null;
    const picked = pickTemplate(kind, lastIndex);
    const sent = await this.sendMessage(to, picked.text);
    if (sent && this.deps.templateRotation) {
      // Solo avanzamos el índice si de verdad se envió (no si se pospuso por horario/warmeo),
      // para no "gastar" una variante en un mensaje que no salió.
      await this.deps.templateRotation.setLastTemplateIndex(this.deps.waNumberId, kind, picked.index);
    }
    return sent;
  }

  /**
   * ÚNICA función de envío de texto de la instancia (E07-T3). Todo outbound pasa por aquí; es
   * el gancho central donde se aplica la humanización (E07-T4: presencia "escribiendo…",
   * delay aleatorio 1–4s, respeto del horario) y el límite de warmeo (E07-T6). Devuelve
   * `false` si el mensaje NO se envió por estar fuera de horario o por tope de warmeo; nunca
   * origina outbound espontáneo (solo entrega lo que se le pide).
   */
  async sendMessage(to: string, body: string): Promise<boolean> {
    if (!this.socket) throw new Error(`Instancia ${this.deps.waNumberId} no conectada`);

    // E07-T6: respeta el límite horario del warmeo del número. Si ya llegó a su tope, no
    // envía (el llamador/poller reintentará más tarde, cuando la ventana horaria avance).
    if (this.deps.warmup) {
      const now = this.humanizer.clockNow();
      const state = await this.deps.warmup.getWarmupState(this.deps.waNumberId);
      if (!canSend(state, now)) {
        this.deps.logger.warn(
          `Número ${this.deps.waNumberId} alcanzó su límite de warmeo esta hora: envío pospuesto`,
        );
        return false;
      }
    }

    // E07-T4: presencia "escribiendo…" + delay 1–4s + entrega, respetando horario del negocio.
    const delivered = await this.humanizer.send(to, body, this.humanizerEffects());
    if (!delivered) {
      this.deps.logger.warn(
        `Número ${this.deps.waNumberId}: respuesta a ${to} pospuesta (fuera de horario del negocio)`,
      );
      return false;
    }

    // E07-T6: registra el envío en la ventana horaria (transición de estado persistida).
    if (this.deps.warmup) {
      const now = this.humanizer.clockNow();
      const state = await this.deps.warmup.getWarmupState(this.deps.waNumberId);
      await this.deps.warmup.saveWarmupState(this.deps.waNumberId, registerSend(state, now));
    }
    return true;
  }

  /** E07-T4: marca leído un mensaje entrante con delay humano (no-op sin socket presente). */
  private async markReadHumanized(to: string, message: WAMessage): Promise<void> {
    if (!this.socket) return;
    await this.humanizer.markReadHumanized(to, this.humanizerEffects(message.key));
  }

  /**
   * Efectos de la humanización (presencia/leído/entrega) sobre el socket Baileys (E07-T4).
   * `messageKey` (opcional) es la key del mensaje entrante a marcar como leído; en el envío
   * de salida no aplica el read-receipt.
   */
  private humanizerEffects(messageKey?: WAMessage["key"]): HumanizerEffects {
    return {
      setPresence: async (to, presence) => {
        await this.socket?.sendPresenceUpdate(presence, to);
      },
      markRead: async () => {
        if (messageKey) await this.socket?.readMessages([messageKey]);
      },
      deliver: async (to, body) => {
        await this.socket?.sendMessage(to, { text: body });
      },
    };
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
