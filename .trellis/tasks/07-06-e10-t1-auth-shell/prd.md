# E10-T1 — Shell autenticado + navegación por rol

Parte de la Épica 10 (dashboard web). Grupo A, primera subtarea (secuencial antes de T2).

## Goal

Montar en `apps/web` (Next.js 15, App Router) la sesión de usuario con Supabase, un
route group autenticado protegido por middleware, y una navegación que cambia según el
rol real del usuario (OWNER / CASHIER vía `Membership`). Tras iniciar sesión el usuario
ve el dashboard de su rol; sin sesión se le redirige a `/login`.

## Contexto técnico relevante

- Auth de la Épica 3: la API (`apps/api`) verifica el JWT de Supabase vía JWKS
  (`SupabaseJwtGuard`) y resuelve `businessId`/`role` **desde la base de datos** con
  `TenantService.resolve()` (endpoint `GET /me`). El auth hook que inyectaría
  `business_id`/`user_role` en el JWT (E03-T2) **no está implementado**: el JWT de un
  login normal NO trae esos claims (ver comentario en `apps/api/src/me/me.controller.ts`
  y `apps/api/test/auth-e2e.ts` línea 62).
- Roles reales del schema (`packages/database/prisma/schema.prisma`, enum `Role`):
  `OWNER` (dueño) y `CASHIER` (cajero), vinculados por `Membership(userId, businessId, role)`.
- El negocio y el rol se obtienen server-side llamando a `GET /me` de la API con el
  access token del usuario (Supabase).

## Requirements

### Sesión Supabase (`@supabase/ssr`)

- [x] Cliente de navegador (`createBrowserClient`) y helpers de servidor
      (`createServerClient` con adaptador de cookies de Next 15) con cookies httpOnly.
- [x] Variables de entorno públicas: `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` (añadidas a `.env.example`).
- [x] Nunca se loguean tokens ni claims.

### Página `/login`

- [x] Formulario email + password (español). Server Action que hace
      `signInWithPassword` y redirige al dashboard.
- [x] Acción de logout (`signOut`) accesible desde el header del dashboard.
- [x] Errores de credenciales se muestran en español, sin filtrar detalles del backend.

### Route group autenticado `app/(dashboard)/`

- [x] Layout con header: nombre del negocio, rol legible (Dueño/Cajero) y botón de
      cerrar sesión.
- [x] Navegación por rol resuelta server-side: la navegación de dueño (Histórico) NO
      aparece para un cajero.
- [x] Páginas placeholder con contenido mínimo "próximamente":
      - Cajero → "Subir comprobante" (contenido real en E10-T3).
      - Dueño → "Histórico" (contenido real en E10-T6).
- [x] La raíz del dashboard redirige a la vista por defecto del rol.

### Middleware (`apps/web/middleware.ts`)

- [x] Refresca la sesión de Supabase en cada request (patrón oficial `@supabase/ssr`).
- [x] Sin sesión + ruta protegida → redirige a `/login`.
- [x] Con sesión + `/login` → redirige al dashboard.
- [x] `matcher` EXCLUYE explícitamente: `/n/*` (zona pública), `/manifest.webmanifest`,
      `/sw.js`, `/_next/*`, favicon e iconos, y archivos estáticos.

## Acceptance criteria

- [x] Con sesión válida, `/dashboard` (o su redirección por rol) muestra el shell con
      header y navegación correctos.
- [x] Sin sesión, cualquier ruta del group redirige a `/login`.
- [x] Con sesión, visitar `/login` redirige al dashboard.
- [x] La navegación de dueño no se renderiza para un cajero.
- [x] La zona pública `/n/*`, el manifest y el service worker NO pasan por el middleware
      de auth.
- [x] `pnpm --filter @check/web build|typecheck|lint` en verde. El build no requiere
      Supabase corriendo (usa placeholders de env en build time).

## Notes

- No se toca la zona pública ya entregada (`app/n/**`, `lib/public-api.ts`,
  `app/manifest.ts`, `register-sw.tsx`, `public/`).
- El diseño deja lugar para las olas B/C/D: las páginas placeholder son puntos de
  extensión (E10-T3 subir, E10-T4/T5 estado en vivo, E10-T6/T7/T8 vistas de dueño).
- La resolución de rol/negocio vive en un helper server-side reutilizable
  (`lib/auth/session.ts`) para que T2 y las vistas posteriores lo consuman.
