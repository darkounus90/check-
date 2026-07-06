import type { UserRole } from "@/lib/auth/session";

/** Un ítem de navegación del dashboard, visible para uno o más roles. */
export interface NavItem {
  href: string;
  label: string;
  roles: readonly UserRole[];
}

/**
 * Navegación del dashboard por rol. La resolución de qué ítems mostrar ocurre
 * server-side (ver layout): la navegación de dueño NO se renderiza para un cajero.
 *
 * Puntos de extensión de las olas B/C/D de la Épica 10:
 *   - Cajero: "Subir comprobante" (real en E10-T3), estado en vivo (E10-T4/T5).
 *   - Dueño: "Histórico" (E10-T6), alertas (E10-T7), cuentas (E10-T8).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard/subir", label: "Subir comprobante", roles: ["CASHIER", "OWNER"] },
  { href: "/dashboard/historico", label: "Histórico", roles: ["OWNER"] },
  { href: "/dashboard/alertas", label: "Alertas", roles: ["OWNER"] },
  { href: "/dashboard/cuentas", label: "Cuentas", roles: ["OWNER"] },
];

/** Ítems visibles para el rol dado. */
export function navItemsForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
