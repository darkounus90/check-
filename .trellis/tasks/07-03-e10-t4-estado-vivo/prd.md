# E10-T4 — Estado en vivo del comprobante (🟡→🟢/🚨)

Épica 10, Grupo B (cajero).

## Goal

Que el semáforo del comprobante se actualice sin recargar cuando el veredicto cambia.

## Requirements

- [x] Lista de verificaciones del cajero con semáforo (🟡 pendiente animado / 🟢 / 🚨).
- [x] Actualización en vivo vía `useRealtimeTransactions` (SEÑAL de cambio) + refetch por
      Server Action (`refetchTransactionsAction` → `apiFetch`, fuente de verdad).
- [x] Respaldo: polling suave (5 s) mientras haya pendientes, por si Realtime está inerte
      sin el auth hook E03-T2. Se detiene cuando todo está resuelto.
- [x] Formato de montos en COP y fechas es-CO.

## Acceptance criteria

- [x] Al cambiar un veredicto, la fila se actualiza en su lugar sin recargar.
- [x] `pnpm --filter @check/web build|typecheck|lint` en verde.

## Files

- `apps/web/app/(dashboard)/dashboard/subir/cashier-uploader.tsx`
- `apps/web/components/ui/verdict-badge.tsx`
- `apps/web/lib/format.ts`
- `apps/web/app/(dashboard)/actions.ts` (`refetchTransactionsAction`)
