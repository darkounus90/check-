import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Cliente Supabase para el SERVIDOR (Server Components, Server Actions, Route Handlers).
 * Usa el store de cookies de Next 15 (async) como transporte de la sesión, con cookies
 * httpOnly manejadas por @supabase/ssr.
 *
 * En Server Components la escritura de cookies puede fallar (el store es de solo lectura
 * fuera de acciones/route handlers); se ignora ese caso porque el middleware ya refresca
 * la sesión en cada request (patrón oficial de @supabase/ssr).
 *
 * Nunca se loguean tokens ni claims desde este módulo.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component sin permiso de escritura: el middleware refresca la sesión.
        }
      },
    },
  });
}
