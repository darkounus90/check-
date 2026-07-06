// Configuración de entorno del dashboard web (Épica 10).
//
// Las variables NEXT_PUBLIC_* se inlinan en build. Para que `next build` no exija
// Supabase corriendo (requisito de la tarea), NO validamos con throw en import:
// devolvemos placeholders inertes en build/SSG. La sesión real sólo se necesita en
// runtime, donde el operador provee las variables de verdad.

/** URL del proyecto Supabase (pública). Placeholder inerte si falta (build time). */
export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
}

/** Anon key de Supabase (pública por diseño). Placeholder inerte si falta. */
export function supabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key";
}

/** Base URL del API (apps/api). Default de desarrollo: puerto 3001. */
export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

/**
 * `true` sólo cuando Supabase está realmente configurado. El middleware y las
 * páginas usan esto para degradar de forma segura durante el build/preview sin
 * credenciales (no intentar refrescar sesión contra un host placeholder).
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
