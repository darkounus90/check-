import "server-only";

import { apiBaseUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Roles reales del schema (enum `Role` de Prisma). */
export type UserRole = "OWNER" | "CASHIER";

/**
 * Contexto del usuario autenticado del dashboard, resuelto SERVER-SIDE.
 * `businessId` y `role` NO vienen del JWT (el auth hook E03-T2 no está implementado):
 * se obtienen de `GET /me` de la API, que los resuelve desde la base de datos.
 */
export interface DashboardSession {
  userId: string;
  email: string | null;
  businessId: string;
  role: UserRole;
  /** Nombre legible del negocio para el header. Fallback neutro si la API no lo expone. */
  businessName: string;
  /** Access token de Supabase, para llamadas autenticadas a la API. */
  accessToken: string;
}

/** Respuesta de `GET /me` de la API (apps/api/src/me/me.controller.ts). */
interface MeResponse {
  userId?: string;
  email?: string;
  businessId?: string;
  role?: string;
  businessName?: string;
}

function isUserRole(value: string | undefined): value is UserRole {
  return value === "OWNER" || value === "CASHIER";
}

/** Etiqueta legible en español del rol. */
export function roleLabel(role: UserRole): string {
  return role === "OWNER" ? "Dueño" : "Cajero";
}

/** Ruta por defecto del dashboard según el rol. */
export function defaultRouteForRole(role: UserRole): string {
  return role === "OWNER" ? "/dashboard/historico" : "/dashboard/subir";
}

/**
 * Resuelve la sesión completa del dashboard, o `null` si no hay usuario autenticado,
 * no hay token, o el usuario no tiene un negocio/rol válido asociado.
 *
 * No lanza: las páginas y el layout deciden qué hacer (redirigir a /login) según null.
 * Nunca se loguean tokens ni claims.
 */
export async function getDashboardSession(): Promise<DashboardSession | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return null;

  let me: MeResponse;
  try {
    const res = await fetch(`${apiBaseUrl()}/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    me = (await res.json()) as MeResponse;
  } catch {
    return null;
  }

  if (!me.businessId || !isUserRole(me.role)) return null;

  return {
    userId: me.userId ?? user.id,
    email: me.email ?? user.email ?? null,
    businessId: me.businessId,
    role: me.role,
    businessName: me.businessName?.trim() || "Mi negocio",
    accessToken,
  };
}
