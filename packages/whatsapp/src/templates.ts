import type { ResolvedVerdict } from "./types.js";

/**
 * Plantillas de respuesta del semáforo (E07-T3). Grupo A usa UNA plantilla fija por
 * estado; la rotación de 5–8 plantillas sin repetición (anti-baneo) llega en E07-T5
 * (Grupo B) enganchándose en el mismo punto (`renderVerdictMessage`/`ackTemplate`).
 */

/** 🟡 Acuse inmediato al recibir el comprobante: "estamos verificando". */
export const ACK_TEMPLATE = "🟡 Estamos verificando tu comprobante…";

/** Texto final por veredicto resuelto (E07-T3). */
const VERDICT_TEMPLATES: Record<ResolvedVerdict, string> = {
  VERIFIED: "🟢 Pago verificado ✅ Ya puedes entregar el pedido",
  SUSPICIOUS: "🚨 ⚠️ No pudimos verificar este pago. NO entregues el pedido y confirma con el negocio",
};

/**
 * Selecciona el texto de respuesta según el veredicto resuelto (E07-T3). Solo `VERIFIED`
 * y `SUSPICIOUS` disparan respuesta final; `PENDING` no llega aquí (mientras espera se
 * mantiene el acuse 🟡 ya enviado al recibir el comprobante).
 */
export function renderVerdictMessage(verdict: ResolvedVerdict): string {
  return VERDICT_TEMPLATES[verdict];
}
