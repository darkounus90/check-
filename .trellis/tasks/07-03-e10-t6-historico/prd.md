# E10-T6 — Histórico con filtros por estado/fecha/cuenta

Épica 10, Grupo C (dueño). Reemplaza el placeholder de `dashboard/historico`.

## Goal

Que el dueño liste y filtre las verificaciones de su negocio.

## Requirements

- [x] Solo dueño: la página redirige a un cajero que llegue por URL directa (defensa
      además de la nav filtrada por rol).
- [x] Listado vía `apiFetch` (aislado por negocio). Tabla en desktop, tarjetas en móvil.
- [x] Filtros por estado (multi-selección 🟢/🟡/🚨), rango de fechas y cuenta receptora.
- [x] Contador de resultados; botón "limpiar filtros".

## GAP documentado (apps/api, fuera de alcance)

No existe endpoint autenticado de listado de transacciones ni con parámetros de filtro.
`listTransactions()` degrada a `[]` en 404; los filtros se aplican EN CLIENTE sobre el
listado disponible (`applyTransactionFilters`). Cuando el backend exponga el listado y sus
filtros, sólo cambia la carga de datos; la UI se mantiene.

## Acceptance criteria

- [x] El dueño lista y filtra; un cajero no accede a la vista.
- [x] `pnpm --filter @check/web build|typecheck|lint` en verde.

## Files

- `apps/web/app/(dashboard)/dashboard/historico/page.tsx`
- `apps/web/app/(dashboard)/dashboard/historico/history-view.tsx`
- `apps/web/lib/data/transaction-types.ts` (filtros puros, importables en cliente)
