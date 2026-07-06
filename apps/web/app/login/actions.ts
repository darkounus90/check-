"use server";

import { redirect } from "next/navigation";

import { getDashboardSession } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Estado del formulario de login (para `useActionState`). */
export interface LoginState {
  error: string | null;
}

/**
 * Server Action de inicio de sesión (email + password). En éxito redirige a la vista por
 * defecto del rol. Los errores se muestran en español, sin filtrar detalles del backend.
 *
 * Nunca se loguean tokens ni claims.
 */
export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!isSupabaseConfigured()) {
    return { error: "El inicio de sesión no está configurado en este entorno." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Escribe tu correo y tu contraseña." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }

  const session = await getDashboardSession();
  if (!session) {
    // Autenticó en Supabase pero no tiene negocio/rol asociado en la BD.
    await supabase.auth.signOut();
    return { error: "Tu cuenta aún no tiene un negocio asignado. Contacta al dueño." };
  }

  redirect("/dashboard");
}

/** Server Action de cierre de sesión. Redirige a /login. */
export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
