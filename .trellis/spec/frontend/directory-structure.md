# Directory Structure

> How frontend code is organized in this project.

---

## Overview

<!--
Document your project's frontend directory structure here.

Questions to answer:
- Where do components live?
- How are features/modules organized?
- Where are shared utilities?
- How are assets organized?
-->

(To be filled by the team)

### Nota (E09-T1, 2026-07-05) — rutas públicas de `apps/web`

- Las rutas públicas sin login (para clientes finales, sin sesión) viven bajo
  `apps/web/app/n/[opaqueId]/`. El segmento `[opaqueId]` es el ID opaco no
  enumerable del negocio (ver decisión D3 en `.trellis/spec/decisions.md`).
  No loguear el `opaqueId` en consola/analytics de forma expuesta.
- El manifest PWA se define de forma nativa en `apps/web/app/manifest.ts`
  (tipo `MetadataRoute.Manifest` de Next 15, sin librerías externas); Next lo
  sirve en `/manifest.webmanifest`.
- Los iconos del manifest son placeholders generados programáticamente en
  `apps/web/public/icon-192.png` y `apps/web/public/icon-512.png` —
  reemplazar por arte real antes de producción.
- El service worker del app-shell es manual (`apps/web/public/sw.js`, sin
  `next-pwa`) y se registra desde un client component
  (`apps/web/app/register-sw.tsx`) montado en `app/layout.tsx`. Solo cachea
  el shell estático (`/`, manifest, iconos); el contenido dinámico (rutas
  `/n/{opaqueId}`, API) siempre va a red.

---

## Directory Layout

```
<!-- Replace with your actual structure -->
src/
├── ...
└── ...
```

---

## Module Organization

<!-- How should new features be organized? -->

(To be filled by the team)

---

## Naming Conventions

<!-- File and folder naming rules -->

(To be filled by the team)

---

## Examples

<!-- Link to well-organized modules as examples -->

(To be filled by the team)
