# E09-T1 Ruta publica PWA instalable

## Goal

Dar a `apps/web` una ruta pública sin login (`/n/{opaqueId}`) y las piezas
básicas de PWA (manifest + service worker de app-shell) para que sea
instalable. Es el punto de entrada de la Épica 9 (PWA de fallback); la
resolución real del negocio a partir del `opaqueId` contra la BD queda para
E09-T2, y el componente de captura/subida para E09-T3.

## Requirements

- Ruta dinámica `apps/web/app/n/[opaqueId]/page.tsx`: Server Component que
  muestra el `opaqueId` recibido (placeholder visual) y deja un lugar
  reservado para el componente de subida de E09-T3. Sin llamadas a BD/API.
- Manifest PWA nativo de Next 15 (`apps/web/app/manifest.ts`,
  `MetadataRoute.Manifest`), sin dependencias externas (`next-pwa` no es
  necesario). `display: "standalone"`, iconos 192x192/512x512.
- Service worker manual (`apps/web/public/sw.js`, sin librerías) que cachee
  solo el app-shell estático (`/`, manifest, iconos) para permitir arranque
  offline del shell; el contenido dinámico siempre va a red. Registro desde
  un client component montado en `app/layout.tsx`.
- El `opaqueId` (cuid no adivinable, D3) no debe quedar expuesto en logs
  públicos (consola/analytics) ni debe existir listado/enumeración de rutas.
- El build, lint y typecheck de `@check/web` y del monorepo deben pasar.

## Acceptance Criteria

- [x] La página `/n/{opaqueId}` carga sin sesión (no hay gate de auth en esa
      ruta) y muestra el `opaqueId` recibido como placeholder.
- [x] Existe un manifest PWA (`app/manifest.ts`, servido en
      `/manifest.webmanifest`) con nombre "CHECK", `display: "standalone"`
      e iconos 192/512 (placeholders documentados, a reemplazar con arte
      real).
- [x] Existe un service worker (`public/sw.js`) que cachea el app-shell
      estático y se registra desde el cliente (`app/register-sw.tsx` +
      `app/layout.tsx`), cumpliendo el criterio básico de "offline shell".
- [x] El `opaqueId` no se loguea en ningún punto del código (sin
      `console.log`/analytics del valor) y no hay endpoint/listado que
      enumere negocios por esta ruta.
- [x] `pnpm --filter @check/web build`, `lint` y `typecheck` pasan.
- [x] `pnpm build`, `pnpm typecheck` y `pnpm lint` (raíz del monorepo) pasan
      sin romper otros packages.

## Notes

- Deuda pre-existente (no de esta tarea): `@check/web` no tiene test runner
  configurado (`"test": "echo ..."`); no se agregó suite de tests porque no
  hay infraestructura de testing en el package todavía.
- Iconos del manifest (`apps/web/public/icon-192.png`,
  `apps/web/public/icon-512.png`) son placeholders generados
  programáticamente (cuadro sólido con marca central), no arte de diseño
  final — documentado también en
  `.trellis/spec/frontend/directory-structure.md`.
- El manifest no incluye Lighthouse/CI automatizado para verificar
  "installability"; se verificó manualmente vía build de Next
  (`/manifest.webmanifest` generado, ruta `/n/[opaqueId]` dinámica).
