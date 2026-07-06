"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Cliente Supabase para el NAVEGADOR (@supabase/ssr). Comparte las cookies de sesión
 * con los helpers de servidor. Se usa para Realtime (E10-T2) y cualquier acción de auth
 * del lado cliente.
 *
 * Nunca se loguean tokens ni claims desde este módulo.
 */
export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
