import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { getDashboardSession } from "@/lib/auth/session";

/** Página de inicio de sesión. Si ya hay sesión válida, va directo al dashboard. */
export default async function LoginPage() {
  const session = await getDashboardSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">CHECK</h1>
        <p className="text-sm text-slate-600">Ingresa a tu panel de verificación.</p>
      </div>
      <LoginForm />
    </main>
  );
}
