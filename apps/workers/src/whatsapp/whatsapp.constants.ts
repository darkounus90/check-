/**
 * Constantes de la integración WhatsApp en los workers (Épica 7, Grupo A).
 *
 * La cola OCR y el bucket son CONTRATO con el pipeline existente (E05-T3):
 * `apps/workers/src/ocr/ocr.constants.ts` y `storage.service.ts`, y con la ingesta
 * pública (`apps/api/src/public/public.constants.ts`). Un comprobante que entra por
 * WhatsApp debe quedar en el MISMO bucket y encolarse en la MISMA cola que uno de la PWA.
 */

/** Intervalo del poller de veredictos resueltos → respuesta del semáforo (E07-T3). */
export const VERDICT_POLL_INTERVAL_MS = 15_000;

/** Máximo de comprobantes a notificar por ciclo del poller (acota el batch). */
export const VERDICT_POLL_BATCH_SIZE = 25;
