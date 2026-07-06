# E10-T9 — Estados de carga/vacío/error + responsive móvil

Épica 10, Grupo D (cierre).

## Goal

Que todas las vistas del dashboard manejen carga/vacío/error y funcionen bien en móvil.

## Requirements

- [x] Primitivas compartidas de estado (`LoadingState`, `EmptyState`, `ErrorState`,
      `SkeletonRow`) reutilizadas por todas las vistas, con mensajes en español.
- [x] Cada vista degrada de forma segura: carga server-side envuelta en try/catch → estado
      de error; listas vacías → estado vacío informativo.
- [x] Mobile-first, consistente con el shell del Grupo A: tabla del histórico colapsa a
      tarjetas en móvil; formularios y botones se apilan; header responsive existente.
- [x] Sin filtrar detalles técnicos en los mensajes de error.

## Acceptance criteria

- [x] Todas las vistas (subir, histórico, alertas, cuentas) manejan carga/vacío/error y son
      responsive.
- [x] `pnpm --filter @check/web build|typecheck|lint` en verde.

## Files

- `apps/web/components/ui/state-views.tsx`
- Integrado en: `cashier-uploader.tsx`, `history-view.tsx`, `alerts-view.tsx`,
  `accounts-view.tsx`.
