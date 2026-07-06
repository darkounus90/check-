import "server-only";

import { getDashboardSession } from "@/lib/auth/session";
import { apiBaseUrl } from "@/lib/env";

/**
 * Error tipado de la capa de datos del dashboard. `status` es el HTTP de la API, o
 * `null` si fue un fallo de red / sin sesión.
 */
export class DashboardApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "DashboardApiError";
    this.status = status;
  }
}

/**
 * Fetch autenticado SERVER-SIDE contra `apps/api`. Adjunta el access token del usuario
 * (Supabase) para que la API verifique el JWT y aísle por negocio server-side.
 *
 * Por qué vía API y no directo desde el cliente Supabase (decisión E10-T2): la RLS de la
 * Épica 2 exige el claim `business_id` en el JWT, que un login normal NO emite (el auth
 * hook E03-T2 no está implementado). Un select directo devolvería 0 filas. La API es el
 * único camino que satisface la RLS existente (`TenantService` fija el claim server-side).
 *
 * Nunca se loguean tokens ni claims.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = await getDashboardSession();
  if (!session) {
    throw new DashboardApiError("Sesión no válida.", 401);
  }

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${session.accessToken}`,
      },
      cache: "no-store",
    });
  } catch {
    throw new DashboardApiError("Sin conexión con el servidor.", null);
  }

  if (!res.ok) {
    throw new DashboardApiError("La API respondió con un error.", res.status);
  }

  return (await res.json()) as T;
}
