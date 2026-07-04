# E01-T10 · Esqueleto apps/api

## Goal
App NestJS con `GET /health` respondiendo 200. Esqueleto sin lógica de negocio.

## Acceptance Criteria
- [x] `@check/api` compila (`tsc`).
- [x] Arranca (`node dist/main.js`) y `GET /health` responde **200** con `{ status: "ok", service: "api", timestamp }` (verificado con curl).
- [x] NestFactory bootstrappea y mapea la ruta `/health`.

## Notes
- Implementado en `apps/api/`. NestJS corre **CommonJS + decoradores** (`experimentalDecorators`, `emitDecoratorMetadata`), sobreescribiendo el ESM estricto de la base (refinamiento de D8, documentado en decisions.md).
- Webhooks (Postmark, WhatsApp router) y auth se agregan en Épicas 3/4/8.
