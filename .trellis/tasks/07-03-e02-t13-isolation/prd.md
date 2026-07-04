# E02-T13 · Test de aislamiento multi-tenant

## Goal
Probar fuga cero entre dos tenants contra la BD real, simulando el contexto Supabase Auth (SET ROLE authenticated + claim `business_id`).

## Acceptance Criteria
- [x] Verificado contra Supabase real (proyecto ddblqtuqpbeavavpppjm) con seed de 2 negocios.
- [x] Con claim de A: solo ve su negocio (1), sus cuentas (1), sus miembros (2).
- [x] Con claim de B: aislamiento simétrico; no ve datos de A.
- [x] `approval_numbers` no es legible directamente por un tenant (D6).
- [x] `approval_number_exists()` responde true/false sin exponer el negocio dueño (D6).
- [x] Insert de A con `businessId` de B es **rechazado** por RLS (with check).
- [x] Rol `postgres` (bypass) ve los 2 negocios (contraste).

## Resultado
`pnpm --filter @check/database exec tsx test/isolation.test.ts` → **11 PASS, 0 FAIL**.

## Notes
- Prisma Client conecta por el transaction pooler (6543); `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …, true)` viven dentro de cada transacción interactiva.
- La ruta directa `db.<ref>.supabase.co:5432` es IPv6-only y no responde; se usa el Session pooler (5432) como `DIRECT_URL` y el Transaction pooler (6543) como `DATABASE_URL`.
- Grants a `authenticated` incorporados a `prisma/policies.sql` para reproducibilidad.
