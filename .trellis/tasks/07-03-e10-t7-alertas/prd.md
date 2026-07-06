# E10-T7 — Panel de intentos sospechosos / alertas de fraude

Épica 10, Grupo C (dueño). Nueva ruta `dashboard/alertas` + ítem de nav (solo dueño).

## Goal

Destacar los 🚨 del negocio y patrones sospechosos.

## Requirements

- [x] Solo dueño: redirige a un cajero por URL directa.
- [x] Resumen: número de intentos sospechosos + monto en riesgo.
- [x] Detección de patrón simple: mismo Nº de aprobación en varios sospechosos (posible
      reuso de comprobante), resaltado.
- [x] Lista de sospechosos destacada en rojo, más recientes arriba.

## GAP documentado

Mismo listado que E10-T6 (endpoint autenticado pendiente en apps/api). Se reutiliza
`listTransactions()` y se filtra `SUSPICIOUS` en cliente.

## Acceptance criteria

- [x] Los 🚨 y patrones aparecen destacados; un cajero no accede.
- [x] `pnpm --filter @check/web build|typecheck|lint` en verde.

## Files

- `apps/web/app/(dashboard)/dashboard/alertas/page.tsx`
- `apps/web/app/(dashboard)/dashboard/alertas/alerts-view.tsx`
- `apps/web/app/(dashboard)/nav-config.ts` (ítem "Alertas")
