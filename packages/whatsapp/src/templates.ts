import type { ResolvedVerdict } from "./types.js";

/**
 * Plantillas de respuesta del semáforo con ROTACIÓN anti-baneo (E07-T5). Cada tipo de
 * respuesta tiene 5–8 variantes en español colombiano; la instancia rota entre ellas para
 * que dos respuestas consecutivas del mismo tipo (al mismo número) NUNCA sean idénticas.
 *
 * La selección se hace con `pickTemplate(kind, lastIndex)`, determinista y testeable: dado
 * el índice usado la última vez, elige otro. El estado (último índice por tipo/por número)
 * lo lleva quien envía; este módulo es puro.
 *
 * Tipos de respuesta:
 * - `ack`        🟡 acuse inmediato al recibir el comprobante ("estamos verificando").
 * - `verified`   🟢 pago verificado (VERIFIED): se puede entregar.
 * - `suspicious` 🚨 no verificado (SUSPICIOUS): NO entregar.
 */

/** Tipo de respuesta que rota plantillas (E07-T5). */
export type TemplateKind = "ack" | "verified" | "suspicious";

/**
 * Variantes por tipo. 5–8 textos naturales en español colombiano, coherentes entre sí en
 * tono y en el emoji semáforo que abre cada mensaje.
 */
export const TEMPLATES: Readonly<Record<TemplateKind, readonly string[]>> = {
  ack: [
    "🟡 ¡Recibido! Estamos verificando tu comprobante, dame un momentico.",
    "🟡 Ya me llegó tu comprobante, lo estoy verificando. Un momento porfa.",
    "🟡 Gracias, estamos revisando tu pago. En un momentico te confirmo.",
    "🟡 ¡Listo, recibido! Verificando el comprobante, ya te aviso.",
    "🟡 Perfecto, estoy validando tu pago. Dame un segundito.",
    "🟡 Recibí tu comprobante 🙌 lo estoy verificando, ya te confirmo.",
    "🟡 ¡Súper! Estoy revisando el pago, en un momento te digo.",
  ],
  verified: [
    "🟢 ¡Pago verificado! ✅ Ya puedes entregar el pedido.",
    "🟢 Todo en orden ✅ el pago quedó confirmado, ya puedes despachar.",
    "🟢 ¡Listo! Pago verificado ✅ puedes entregar tranquilo.",
    "🟢 Confirmado ✅ el pago llegó bien, ya puedes entregar el pedido.",
    "🟢 ¡Perfecto! Pago validado ✅ dale, puedes entregar.",
    "🟢 Verificado ✅ el pago está correcto, ya puedes despachar el pedido.",
  ],
  suspicious: [
    "🚨 No pudimos verificar este pago todavía. Puede que la foto no esté clara — tómala de nuevo, bien nítida y completa (que se vea el monto, la fecha y el número). Si vuelve a fallar, no entregues.",
    "🚨 Aún no logramos confirmar este comprobante. Intenta enviar otra foto más nítida, con toda la pantalla visible. Si sigue sin cuadrar, no entregues el pedido.",
    "🚨 No nos cuadra este pago. Reenvía la foto del comprobante, asegurándote de que se vea claro el monto y la fecha. Si persiste, mejor no entregues.",
    "🚨 No pudimos validar el pago. ¿Podrías tomar la foto de nuevo, bien enfocada y completa? Si aun así no verifica, no entregues y avisa al negocio.",
    "🚨 Este comprobante no lo pudimos confirmar. Envía otra foto más clara (sin recortes ni reflejos). Si vuelve a salir así, no entregues el pedido.",
  ],
};

/** Formatea centavos como pesos colombianos para los mensajes (ej. 1000000 → "$ 10.000"). */
export function formatCentsCop(amountCents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amountCents / 100));
}

/** Mapea un veredicto resuelto (E07-T3) al tipo de plantilla que rota (E07-T5). */
export function templateKindForVerdict(verdict: ResolvedVerdict): TemplateKind {
  return verdict === "VERIFIED" ? "verified" : "suspicious";
}

/** Resultado de una selección de plantilla: el texto y el índice elegido (para persistir). */
export interface PickedTemplate {
  /** Texto de la plantilla seleccionada. */
  readonly text: string;
  /** Índice de la variante elegida; el llamador lo guarda como `lastIndex` para la próxima. */
  readonly index: number;
}

/**
 * Selecciona una variante de `kind` distinta de la última usada (`lastIndex`), garantizando
 * que dos respuestas consecutivas del mismo tipo NUNCA sean idénticas (E07-T5). Determinista
 * y testeable:
 * - `lastIndex` `null`/fuera de rango ⇒ empieza por la variante 0.
 * - si hay historia, avanza cíclicamente al siguiente índice (`(lastIndex + 1) % n`), que
 *   siempre difiere del anterior cuando hay ≥ 2 variantes.
 *
 * Se usa rotación cíclica (no aleatoria) para dar un reparto uniforme y un test trivial; el
 * anti-repetición-consecutiva es la propiedad crítica del criterio de aceptación.
 */
export function pickTemplate(kind: TemplateKind, lastIndex: number | null | undefined): PickedTemplate {
  const variants = TEMPLATES[kind];
  const n = variants.length;
  const valid = lastIndex != null && Number.isInteger(lastIndex) && lastIndex >= 0 && lastIndex < n;
  const index = valid ? (lastIndex + 1) % n : 0;
  return { text: variants[index]!, index };
}
