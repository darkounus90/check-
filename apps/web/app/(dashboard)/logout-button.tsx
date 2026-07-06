"use client";

import { useFormStatus } from "react-dom";

import { logoutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

function LogoutSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Saliendo…" : "Cerrar sesión"}
    </Button>
  );
}

/** Botón de cierre de sesión del header (dispara la Server Action de logout). */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <LogoutSubmit />
    </form>
  );
}
