# Tests de `@check/api`

Dos categorías, separadas a propósito para que `pnpm test` sea determinista y sin red.

## Unitarios (`pnpm test`)

Enumerados explícitamente en el script `test` de `package.json`. Todos mockean sus
dependencias externas (Prisma, Supabase Storage, cola OCR/Redis) inyectando fakes; no tocan
red ni base de datos. El preload `--import ./test/setup-env.ts` fija variables de entorno
dummy con `??=` **antes** de que cualquier módulo importe `src/env.ts` (validado con zod al
cargar), así la corrida paralela de turbo no depende de un `.env` real.

Archivos `*.test.ts` (incluido `compliance-e2e.test.ts`, que pese al nombre es unitario:
usa solo primitivas puras de `@check/shared`).

## Integración (`pnpm test:integration`)

Archivos `*-e2e.ts` (sin sufijo `.test.ts`, por eso el runner unitario NO los recoge):
`auth-e2e.ts`, `tenant-e2e.ts`, `onboarding-e2e.ts`, `mailbox-e2e.ts`, `ingestion-e2e.ts`.

Instancian `PrismaClient` real y/o pegan contra una API/Supabase levantados, así que
**requieren** `.env` cargado, la BD y la API corriendo. No forman parte de `pnpm test` ni de
la corrida de CI por turbo, para no flakear los unitarios. Córrelos manualmente cuando
quieras validar el recorrido de punta a punta.
