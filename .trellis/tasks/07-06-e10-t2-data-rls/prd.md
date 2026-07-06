# E10-T2 — Capa de datos (RLS) + Realtime base

Parte de la Épica 10 (dashboard web). Grupo A, segunda subtarea (tras E10-T1).

## Goal

Proveer en `apps/web/lib/` una capa de datos tipada por la que SIEMPRE pasan las
consultas del dashboard, respetando el aislamiento por negocio (RLS de la Épica 2), y
una suscripción base a Supabase Realtime (canal por negocio sobre la tabla
`transactions`) con reconexión, expuesta como hook `useRealtimeTransactions` lista para
E10-T4/T5.

## Hallazgo crítico sobre RLS (decisión de arquitectura)

Se verificaron las policies en `packages/database/prisma/migrations/1_rls_policies/migration.sql`.
El aislamiento se basa en:

```sql
current_setting('request.jwt.claims', true)::jsonb ->> 'business_id'
```

Es decir, la fila solo es visible si el JWT del usuario trae el claim `business_id`.
**Ese claim NO lo emite un login normal de Supabase**: el auth hook que lo inyectaría
(E03-T2) no está implementado. Lo confirma el propio código de la API:

- `apps/api/src/me/me.controller.ts`: "El businessId/role se resuelven desde la BD (no
  del JWT), evitando el auth hook."
- `apps/api/test/auth-e2e.ts` (línea 62): `businessId en claim = undefined`.
- `apps/api/src/tenant/tenant.service.ts`: la API fija el claim manualmente con
  `set_config('request.jwt.claims', ...)` dentro de una transacción antes de consultar.

**Consecuencia:** un `select` directo desde el cliente Supabase del navegador (o desde el
cliente server con el token del usuario) devolvería **0 filas**, porque
`auth_business_id()` es NULL. Rediseñar la RLS está fuera de alcance y prohibido.

**Decisión tomada (opción "vía API"):** la capa de datos web hace las QUERIES contra
`apps/api` con un fetch autenticado que envía el access token del usuario. La API verifica
el JWT (`SupabaseJwtGuard`) y resuelve/aísla por negocio server-side (`TenantService`),
que es el único camino que satisface la RLS existente. Supabase Realtime queda como señal
de "algo cambió" + refetch vía API, no como fuente de datos autoritativa.

> Nota sobre Realtime: Realtime también aplica RLS con el JWT del usuario, así que las
> filas de `postgres_changes` tampoco llegarían sin el claim. Por eso el hook trata cada
> evento como una señal (dispara un callback de "cambió algo") y NO confía en el payload
> de la fila para mostrar datos; la fuente de verdad es el refetch por API. El canal
> igual conecta y reconecta correctamente (criterio de aceptación de la épica: "el canal
> Realtime conecta").

## Requirements

### Cliente Supabase tipado (`lib/supabase/`)

- [x] Cliente de navegador y helper de servidor reutilizables (compartidos con E10-T1).
- [x] Enums/nombres REALES del schema: `VerdictStatus` (`VERIFIED`/`PENDING`/`SUSPICIOUS`),
      nombre de tabla `transactions` (vía `@@map`).

### Capa de datos vía API (`lib/data/`)

- [x] Helper `apiFetch` server-side que adjunta el access token del usuario (Supabase) y
      llama a `NEXT_PUBLIC_API_URL`.
- [x] Funciones de consulta tipadas que pasan SIEMPRE por la API (heredan el aislamiento
      RLS que la API aplica server-side). Se incluye `getReceivingAccounts()`
      (endpoint existente `GET /accounts`) como consulta real de ejemplo end-to-end.
- [x] Tipo `Transaction` del dashboard con `verdict: VerdictStatus` y un
      `listTransactions()` que documenta que su endpoint de API llega en E10-T6 (por ahora
      degrada de forma segura si el endpoint no existe: devuelve lista vacía, no rompe).

### Realtime base (`lib/realtime/` + hook)

- [x] Suscripción a `postgres_changes` sobre la tabla `transactions` filtrada por
      `businessId` del usuario (un canal por negocio).
- [x] Reconexión ante caída del canal (resuscribe con backoff simple).
- [x] Hook `useRealtimeTransactions({ businessId, onChange })` que expone estado de
      conexión y dispara `onChange` en cada evento (señal para refetch en E10-T4/T5).

## Acceptance criteria

- [x] Las consultas del dashboard sólo devuelven datos del negocio del usuario (lo
      garantiza el aislamiento server-side de la API; documentado por qué no vía cliente
      directo).
- [x] El canal Realtime conecta y reconecta; el hook expone su estado.
- [x] Enums y nombres de tabla coinciden con el schema real.
- [x] `pnpm --filter @check/web build|typecheck|lint` en verde. El build no requiere
      Supabase corriendo.

## Notes

- Brecha documentada para el futuro: si más adelante se implementa el auth hook E03-T2
  (claim `business_id` en el JWT), la capa podría leer directo del cliente Supabase sin
  pasar por la API. Hoy NO es el caso; no se rediseña la RLS.
- No se toca `apps/api`, `apps/workers` ni `packages/**`.
- El endpoint autenticado de listado de transacciones para el dueño (E10-T6) es trabajo
  de otra ola en `apps/api`; esta capa deja el contrato tipado listo para conectarlo.
