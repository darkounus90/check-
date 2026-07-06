import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";

/** Prefijos que SIEMPRE requieren sesión (route group autenticado del dashboard). */
const PROTECTED_PREFIXES = ["/dashboard"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Refresca la sesión de Supabase en cada request y aplica las reglas de acceso
 * (patrón oficial @supabase/ssr para Next 15 App Router):
 *   - sin sesión + ruta protegida → /login
 *   - con sesión + /login → dashboard por defecto
 *
 * IMPORTANTE: siempre devolver el `response` con las cookies actualizadas por
 * @supabase/ssr, o la sesión no se refresca. Las redirecciones copian esas cookies.
 *
 * Nunca se loguean tokens ni claims.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  // Sin Supabase configurado (build/preview sin credenciales): no tocar la sesión.
  if (!isSupabaseConfigured()) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}
