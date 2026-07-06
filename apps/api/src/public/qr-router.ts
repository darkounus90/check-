/**
 * Lógica PURA del enrutador de QR (Épica 8). Sin I/O ni Nest: recibe las asignaciones y la
 * salud ya resueltas y decide a qué número WhatsApp resolver un escaneo de `/n/{opaqueId}`,
 * o si caer a la PWA. Testeable en memoria (E08-T2/T3/T4/T7).
 *
 * Fuente de verdad de la SELECCIÓN: `pickHealthyNumberForBusiness` de `packages/whatsapp/src/
 * assignment.ts` (E07-T8). No dependemos de ese paquete (es ESM y la api es CommonJS; además
 * el enunciado de la épica pide no tocarlo), así que reproducimos EXACTAMENTE su contrato aquí
 * y lo verificamos con tests. Regla: preferir `connected`; si ninguno, aceptar `degraded`;
 * nunca `banned`/`warming`. Orden de candidatos: prioridad desc, empate → asignación más
 * antigua (createdAtMs asc), idéntico a `numbersForBusiness`.
 */

/** Salud mínima de un número (espejo de `NumberHealth` de Prisma, en minúsculas). */
export type AssignableHealth = "connected" | "degraded" | "banned" | "warming";

/** Fila de `NumberPoolAssignment` (subconjunto que la resolución necesita). */
export interface PoolAssignmentRow {
  readonly waNumberId: string;
  readonly priority: number;
  /** Alta de la asignación (epoch ms). Desempata prioridades iguales (más antigua gana). */
  readonly createdAtMs: number;
}

/** Motivo de la resolución (espejo del enum Prisma `QrResolutionReason`). */
export type QrResolutionReason = "PRIMARY" | "FAILOVER" | "FALLBACK_PWA";

/** Resultado puro de resolver un escaneo. */
export type QrResolution =
  | { readonly action: "whatsapp"; readonly waNumberId: string; readonly reason: "PRIMARY" | "FAILOVER" }
  | { readonly action: "pwa"; readonly reason: "FALLBACK_PWA" };

/**
 * Candidatos ordenados de MAYOR a menor preferencia (prioridad desc, empate → más antigua).
 * Espejo de `numbersForBusiness` sin el filtro de negocio (las filas ya vienen del negocio).
 */
function orderedCandidates(assignments: readonly PoolAssignmentRow[]): string[] {
  return [...assignments]
    .sort((a, b) => b.priority - a.priority || a.createdAtMs - b.createdAtMs)
    .map((a) => a.waNumberId);
}

/**
 * Resuelve el escaneo de un negocio a partir de sus asignaciones y la salud persistida.
 *
 * - Si el candidato de MAYOR preferencia está `connected`, es la resolución primaria.
 * - Si el primario no está sano pero un candidato posterior sí (connected, o degraded como
 *   último recurso), es un FAILOVER transparente al secundario.
 * - Si ningún candidato está sano (todo el pool del negocio caído), cae a la PWA.
 *
 * @param assignments filas de asignación del negocio (ya filtradas por businessId).
 * @param healthOf salud de un número por id; `undefined` si el número no existe / sin dato.
 */
export function resolveQr(
  assignments: readonly PoolAssignmentRow[],
  healthOf: (waNumberId: string) => AssignableHealth | undefined,
): QrResolution {
  const candidates = orderedCandidates(assignments);
  if (candidates.length === 0) {
    return { action: "pwa", reason: "FALLBACK_PWA" };
  }

  // Preferimos `connected`; si ninguno, aceptamos `degraded` (reconectando). Nunca
  // `banned`/`warming`. Idéntico a `pickHealthyNumberForBusiness`.
  const chosen =
    candidates.find((id) => healthOf(id) === "connected") ??
    candidates.find((id) => healthOf(id) === "degraded") ??
    null;

  if (chosen === null) {
    return { action: "pwa", reason: "FALLBACK_PWA" };
  }

  // PRIMARY sólo si el elegido es el candidato de mayor preferencia; si tuvimos que saltar a
  // uno posterior (el primario estaba caído), es un failover transparente al secundario.
  const reason = chosen === candidates[0] ? "PRIMARY" : "FAILOVER";
  return { action: "whatsapp", waNumberId: chosen, reason };
}

/**
 * Normaliza un teléfono E164 a la forma que espera `wa.me` (solo dígitos, sin `+`).
 * `+573001112233` → `573001112233`. Robusto ante espacios/guiones de captura manual.
 */
export function toWaMeNumber(phoneNumber: string): string {
  return phoneNumber.replace(/[^0-9]/g, "");
}

/** Construye la URL `wa.me` de destino a partir de un teléfono E164. */
export function waMeUrl(phoneNumber: string): string {
  return `https://wa.me/${toWaMeNumber(phoneNumber)}`;
}
