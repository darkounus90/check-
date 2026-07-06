/**
 * Asignación multi-tenant número↔negocios (E07-T8). Un número CHECK sirve a un grupo de
 * negocios (20–50 pequeños o 5–10 medianos) para ACOTAR EL RADIO DE DAÑO: si un número se
 * degrada/banea, solo afecta a su grupo, no a toda la red. La asignación vive en
 * `NumberPoolAssignment` (N↔M entre `WaNumber` y `Business`).
 *
 * ── Mecanismo de desambiguación (decisión de diseño) ─────────────────────────────────────
 * Resolver "¿qué negocio es el destinatario?" a partir de un mensaje entrante es difícil sin
 * una señal del cliente: WhatsApp solo nos da el JID del remitente y el número receptor, no
 * el negocio. Elegimos el siguiente mecanismo, coherente con la Épica 8 (QR router):
 *
 *   1) DIRECCIÓN NEGOCIO→NÚMERO (la que importa para enrutar salidas y para el QR): cada
 *      negocio resuelve a SU GRUPO de números sanos (`numbersForBusiness`). El QR de un
 *      negocio (Épica 8) dirige al cliente a un número concreto de ese grupo, fijando el
 *      mapeo en el momento del escaneo.
 *   2) DIRECCIÓN ENTRANTE NÚMERO→NEGOCIO (desambiguación de un comprobante recibido): sin
 *      señal por-mensaje, un número compartido por varios negocios es ambiguo. La resolución
 *      determinística toma la asignación de MAYOR prioridad (empate → la más antigua), que es
 *      exactamente lo que hace `resolveBusinessId` en apps/workers. El caso limpio es
 *      1-número-por-negocio (o el QR de Épica 8 que fija el negocio antes de recibir).
 *
 * INVARIANTE de aislamiento (aceptación E07-T8): ningún número sirve fuera de su asignación.
 * `assertNumberServesBusiness` lo verifica; `numbersForBusiness` nunca devuelve números no
 * asignados a ese negocio.
 *
 * Diseño testeable: puras funciones sobre filas de asignación en memoria; sin Prisma aquí.
 */

/** Una fila de `NumberPoolAssignment` (subconjunto que la resolución necesita). */
export interface PoolAssignment {
  readonly waNumberId: string;
  readonly businessId: string;
  /** Mayor = preferido al elegir número para un negocio o al desambiguar un entrante. */
  readonly priority: number;
  /** Alta de la asignación (epoch ms). Desempata prioridades iguales (más antigua gana). */
  readonly createdAtMs: number;
}

/** Salud mínima de un número para poder filtrar por "sano" al elegir (espejo de `NumberHealth`). */
export type AssignableHealth = "connected" | "degraded" | "banned" | "warming";

/**
 * Números asignados a un negocio, de MAYOR a menor preferencia (E07-T8). Orden: prioridad
 * desc, y a igual prioridad la asignación más antigua primero (determinístico). Es la
 * dirección negocio→números que la Épica 8 usará para elegir a qué número enviar/QR.
 */
export function numbersForBusiness(
  assignments: readonly PoolAssignment[],
  businessId: string,
): string[] {
  return assignments
    .filter((a) => a.businessId === businessId)
    .sort((a, b) => b.priority - a.priority || a.createdAtMs - b.createdAtMs)
    .map((a) => a.waNumberId);
}

/**
 * Negocios servidos por un número (E07-T8): la contraparte para acotar el radio de daño.
 * Si un número cae, estos son EXACTAMENTE los negocios afectados.
 */
export function businessesForNumber(
  assignments: readonly PoolAssignment[],
  waNumberId: string,
): string[] {
  return assignments.filter((a) => a.waNumberId === waNumberId).map((a) => a.businessId);
}

/**
 * ¿El número está asignado a servir a ese negocio? (invariante de aislamiento E07-T8).
 * Devuelve `false` si no existe la asignación: ese número NO debe atender a ese negocio.
 */
export function numberServesBusiness(
  assignments: readonly PoolAssignment[],
  waNumberId: string,
  businessId: string,
): boolean {
  return assignments.some((a) => a.waNumberId === waNumberId && a.businessId === businessId);
}

/**
 * Selecciona el mejor número SANO para un negocio (E07-T8, insumo de la Épica 8): el de mayor
 * preferencia entre los asignados cuyo estado de salud sea aceptable. Por defecto excluye
 * `banned` (número inutilizable) y `warming` (aún no elegible para pool); `connected` y, en su
 * defecto, `degraded` (reconectando) sí sirven. Devuelve `null` si no hay ninguno sano.
 *
 * NO hace I/O: recibe el mapa de salud ya resuelto (viene de `getPoolHealth()`). Mantiene el
 * invariante: solo considera números asignados a ese negocio.
 */
export function pickHealthyNumberForBusiness(
  assignments: readonly PoolAssignment[],
  businessId: string,
  healthOf: (waNumberId: string) => AssignableHealth | undefined,
): string | null {
  const candidates = numbersForBusiness(assignments, businessId);
  // Preferimos `connected`; si ninguno, aceptamos `degraded` (aún reconectando). Nunca
  // `banned`/`warming`.
  const connected = candidates.find((id) => healthOf(id) === "connected");
  if (connected) return connected;
  const degraded = candidates.find((id) => healthOf(id) === "degraded");
  return degraded ?? null;
}
