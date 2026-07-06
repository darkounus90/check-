/**
 * Capa WhatsApp (Baileys) — Épica 7, Grupo A (instancia base: E07-T1/T2/T3).
 *
 * - E07-T1: `WhatsAppInstance` conecta con auth-state persistido en Postgres
 *   (`useDbAuthState`) y reconecta tras reinicio sin re-escanear QR.
 * - E07-T2: al llegar imagen/PDF, la mete al MISMO pipeline OCR (Storage + cola
 *   `ocr-processing`) y persiste el mapeo conversación↔voucher.
 * - E07-T3: responde el semáforo (🟡 al recibir, 🟢/🚨 al resolverse el veredicto) por
 *   una única función central `sendMessage`.
 *
 * Humanización, warmeo, pool multi-instancia, health y multi-tenant (Grupos B/C) son olas
 * posteriores; se enganchan en `sendMessage`/plantillas sin tocar los llamadores.
 */

export {
  type DbAuthState,
  deserializeAuthState,
  serializeAuthState,
  useDbAuthState,
} from "./db-auth-state.js";
export {
  type BusinessHours,
  type Clock,
  Humanizer,
  type HumanizerDeps,
  type HumanizerEffects,
  type HumanizerTiming,
  isWithinBusinessHours,
  localHourOf,
  type Random,
  realSleep,
  type Sleep,
} from "./humanizer.js";
export {
  ALLOWED_VOUCHER_MIME_TYPES,
  type DetectedVoucherMedia,
  detectVoucherMedia,
  isProcessableIncoming,
  remoteJidOf,
} from "./incoming.js";
export {
  type WaLogger,
  WhatsAppInstance,
  type WhatsAppInstanceDeps,
} from "./instance.js";
export {
  type PickedTemplate,
  pickTemplate,
  type TemplateKind,
  templateKindForVerdict,
  TEMPLATES,
} from "./templates.js";
export type {
  BusinessResolver,
  OcrEnqueuer,
  ResolvedVerdict,
  TemplateKindKey,
  TemplateRotationStore,
  VoucherContextReader,
  VoucherIngestStore,
  VoucherStorageUploader,
  WarmupStateSnapshot,
  WarmupStore,
  WaSessionStore,
  WhatsAppInstanceCallbacks,
  WhatsAppNumberHealth,
} from "./types.js";
export {
  canSend,
  hourlyLimit,
  isPoolEligible,
  registerSend,
  WARMUP_HOURLY_LIMITS,
  WARMUP_WINDOW_MS,
  type WarmupState,
} from "./warmup.js";
