# API completion: dashboard endpoints + de-flake

Cierra 3 gaps documentados que quedaron fuera del alcance de las 12 épicas ya
implementadas. Reutiliza patrones existentes (guards E03, TenantService/RLS, pipeline
público OCR de la Épica 9). Dinero en centavos, TZ Bogotá, RLS server-side.

## Goal

1. Exponer un endpoint autenticado `GET /transactions` que liste las transacciones del
   negocio del usuario (aislado por RLS), con filtros server-side opcionales.
2. Exponer una subida autenticada de comprobante para el cajero que entre al MISMO
   pipeline (Storage + cola OCR) resolviendo el negocio por el JWT (no por opaqueId).
3. De-flakear los tests de `apps/api` para que `pnpm test` sea verde de forma consistente
   sin depender de Supabase/BD/Redis reales para los unitarios.

## Requirements

### Gap #8 — GET /transactions (apps/api + wire apps/web)

- Endpoint autenticado (`SupabaseJwtGuard` + `RolesGuard`) que devuelve las transacciones
  del negocio del usuario vía `TenantService.runAsTenant` (RLS server-side).
- Filtros server-side opcionales por query: estado (`VerdictStatus`), rango de fecha
  (`from`/`to` sobre `createdAt`), y cuenta receptora (`accountId`).
- Devuelve los datos que histórico y alertas necesitan: `verdict`, `amountCents`,
  `approvalNumber`, `createdAt`, `resolvedAt`, `accountId` (resuelto desde el
  `destinationAccount` del voucher).
- Cablea `apps/web/lib/data/transactions.ts` para consumirlo: quita el degradado a `[]` por
  404 y mueve el filtrado a server-side conservando el filtrado de cliente como respaldo.

### Gap #9 — subida autenticada de voucher (apps/api + wire apps/web)

- Endpoint autenticado (`POST /vouchers`, cualquier miembro) multipart (campo `file`) con
  las MISMAS validaciones que el público (jpeg/png/webp/pdf, 10 MB) que mete el comprobante
  al MISMO pipeline (Storage + cola OCR) ligándolo al negocio del cajero resuelto por el JWT.
- Reutiliza la lógica del módulo público sin duplicar el pipeline.
- Reutiliza `GET /public/vouchers/:voucherId` (handle público no adivinable) para el
  polling del semáforo en vivo.
- Cablea `apps/web` (voucher-link / cashier-uploader) para usar el endpoint autenticado en
  vez del fallback público con `NEXT_PUBLIC_BUSINESS_OPAQUE_ID`.

### Gap #10 — de-flake tests de apps/api

- Asegurar que `pnpm test` de `apps/api` sea determinista y sin red para los unitarios
  (Prisma/Storage/cola mockeados; preload `setup-env.ts` para env dummy).
- Los tests genuinamente de integración (`*-e2e.ts` que instancian `PrismaClient` real)
  quedan separados del runner y documentados.

## Acceptance Criteria

- [x] `GET /transactions` autenticado, aislado por RLS, con filtros server-side por estado,
      fecha y cuenta; test unitario con Prisma mockeado.
- [x] `POST /vouchers` autenticado reutiliza el pipeline público (Storage + OCR) ligando al
      negocio por el JWT; test unitario con dependencias fake.
- [x] `apps/web` consume ambos endpoints; se elimina el fallback por `opaqueId`/404.
- [x] Semáforo en vivo sigue funcionando (polling autenticado del estado del voucher).
- [x] `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` verdes; `@check/api test`
      verde de forma consistente (2 corridas).

## Notes

- No romper la ruta pública `/n/:opaqueId` ni el router de la Épica 8.
- No `git commit` / `push`. Evitar cambios de schema.
