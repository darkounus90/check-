import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Middleware de sesión del dashboard (E10-T1). Refresca la sesión de Supabase y protege
 * el route group autenticado.
 *
 * El `matcher` EXCLUYE explícitamente lo que NO debe pasar por el gate de auth:
 *   - `/n/*`               → zona pública (PWA de fallback, Épica 9)
 *   - `/manifest.webmanifest`, `/sw.js` → PWA (manifest + service worker)
 *   - `/_next/*`           → assets internos de Next
 *   - iconos / favicon / imágenes estáticas
 * Todo lo demás pasa por el middleware; las reglas de acceso viven en `updateSession`.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!n/|manifest\\.webmanifest|sw\\.js|_next/static|_next/image|favicon\\.ico|icons/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
