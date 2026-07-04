# E01-T12 · Esqueleto apps/web

## Goal
App Next.js 15 (App Router) + Tailwind + un componente shadcn/ui que renderiza.

## Acceptance Criteria
- [x] `@check/web` compila con `next build` (tipos válidos, ruta `/` generada).
- [x] Tailwind v4 activo (via `@tailwindcss/postcss`) y `globals.css` importado.
- [x] Componente estilo shadcn/ui (`Button` con `cva` + `cn`) renderiza en la home.

## Notes
- Implementado en `apps/web/`. Config Next propia (`jsx: preserve`, `moduleResolution: Bundler`, alias `@/*`) sobre la base.
- `components.json` de shadcn incluido; los tokens de tema completos se agregan al inicializar shadcn en la Épica 9/10.
- Será dashboard (Épica 10) + PWA de fallback (Épica 9).
