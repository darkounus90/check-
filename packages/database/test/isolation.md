# E02-T13 · Test de aislamiento multi-tenant (guía de ejecución en fase guiada)

> Requiere una BD Supabase/Postgres real con RLS aplicado. Se corre en la fase de pruebas guiadas, no en CI.

## Prerrequisitos
1. Proyecto Supabase creado; `DATABASE_URL` y `DIRECT_URL` en `.env`.
2. `pnpm --filter @check/database db:deploy` (o `db:migrate`) — crea las tablas.
3. Aplicar RLS: `psql "$DATABASE_URL" -f prisma/policies.sql`.
4. `pnpm --filter @check/database db:seed` — 2 negocios (Esquina, Tornillo).

## Casos a verificar (fuga cero)
Conectando con un rol no privilegiado y el claim JWT `business_id` del Negocio A:

| # | Acción | Esperado |
|---|--------|----------|
| 1 | `select * from vouchers` con claim de A | solo filas de A |
| 2 | `select * from transactions` con claim de A | 0 filas de B |
| 3 | `insert` en `receiving_accounts` con `businessId` de B (claim A) | rechazado por `with check` |
| 4 | `update`/`delete` en `money_op_logs` | rechazado (append-only) |
| 5 | `select * from approval_numbers` (claim de A) | 0 filas (sin política select) |
| 6 | `select approval_number_exists('nequi','M12345')` | true/false sin exponer el negocio dueño (D6) |

## Nota sobre RLS y Prisma
Prisma se conecta por defecto como owner y **omite** RLS. Para probar el aislamiento hay que:
- usar un rol Postgres no-owner (p. ej. `authenticated` de Supabase), y
- fijar el claim por sesión: `select set_config('request.jwt.claims', '{"business_id":"<id>"}', true);`

El test automatizado (`test/isolation.test.ts`) se implementa en la fase guiada usando `node:test` contra ese rol restringido.
