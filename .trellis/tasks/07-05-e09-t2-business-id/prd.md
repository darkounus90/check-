# E09-T2 Identificacion de negocio por URL

## Goal

Dar a la PWA pública (`/n/{opaqueId}`, E09-T1) una forma de resolver el negocio
real detrás de la URL sin login, para poder mostrar su nombre y ligar el
comprobante subido (E09-T4) al negocio correcto. La resolución es SIEMPRE
server-side por `Business.opaqueId` (cuid único no adivinable, D3); el cliente
nunca envía ni recibe el `businessId` interno.

## Requirements

- Endpoint público `GET /public/n/:opaqueId` en `apps/api`, sin JWT (fuera del
  `SupabaseJwtGuard` de E03, que se aplica por controlador).
- Respuesta `200 { "name": string }` si el negocio existe; `404` si no.
- La respuesta NO debe incluir `businessId` interno, `inboundMailboxId` ni
  ningún otro campo del negocio (mínimo privilegio para una URL pública).
- Sin listado ni enumeración de negocios: no existe endpoint que liste
  opaqueIds, y el 404 no distingue "no existe" de otros casos.
- Código organizado en un módulo público separado
  (`apps/api/src/public/`) para que el rate limiting de E09-T7 se
  monte ahí sin tocar el resto de la API.
- La ingesta de E09-T4 reutiliza esta misma resolución server-side para ligar
  el `Voucher` al negocio correcto.

## Acceptance Criteria

- [x] `GET /public/n/:opaqueId` responde 200 `{name}` para un opaqueId
      existente sin ninguna sesión/token (verificado por tests unitarios del
      servicio; el controlador no declara `@UseGuards`).
- [x] Responde 404 para un opaqueId inexistente.
- [x] La respuesta contiene SOLO `name` (test asserta las keys exactas del
      objeto devuelto).
- [x] El comprobante subido por E09-T4 queda ligado al negocio resuelto por
      este mismo mecanismo (`Voucher.businessId` = negocio del opaqueId,
      cubierto por tests de `PublicVouchersService.ingestVoucher`).
- [x] `pnpm --filter @check/api build`, `typecheck`, `lint` y `test` pasan.

## Notes

- Implementado junto con E09-T4 en `apps/api/src/public/`
  (`PublicModule`, `PublicController`, `PublicVouchersService`); el contrato
  completo de la API pública está en
  `.trellis/tasks/07-05-e09-t4-public-ingest/research/public-api-contract.md`.
- No hizo falta tocar el schema Prisma: `Business.opaqueId` ya existía
  (`@unique @default(cuid())`, E02-T3/D3).
- El rate limiting fino por negocio/IP queda para E09-T7.
