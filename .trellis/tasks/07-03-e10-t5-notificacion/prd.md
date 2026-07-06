# E10-T5 — Notificación in-app al resolverse el veredicto

Épica 10, Grupo B (cajero).

## Goal

Avisar al cajero con una notificación in-app cuando un veredicto pasa de 🟡 a 🟢 o 🚨.

## Requirements

- [x] Provider de notificaciones (toasts) montado en el layout del dashboard, con región
      `aria-live` accesible y auto-cierre.
- [x] Al detectar una transición PENDING → VERIFIED se muestra "🟢 puedes entregar";
      PENDING → SUSPICIOUS muestra "🚨 no entregues".
- [x] Sólo se notifican transiciones observadas (una fila conocida como pendiente que se
      resuelve), no filas nuevas ya resueltas ni el estado inicial.
- [x] Nunca se loguean tokens ni claims.

## Acceptance criteria

- [x] El cajero recibe el aviso in-app al resolverse un veredicto, sin recargar.
- [x] `pnpm --filter @check/web build|typecheck|lint` en verde.

## Files

- `apps/web/app/(dashboard)/notifications.tsx`
- `apps/web/app/(dashboard)/layout.tsx` (NotificationProvider)
- `apps/web/app/(dashboard)/dashboard/subir/cashier-uploader.tsx` (detección de transición)
