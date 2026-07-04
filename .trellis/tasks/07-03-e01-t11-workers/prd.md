# E01-T11 · Esqueleto apps/workers

## Goal
App NestJS standalone (sin HTTP) que arranca y loguea "workers up" sin crashear.

## Acceptance Criteria
- [x] `@check/workers` compila.
- [x] `node dist/main.js` arranca vía `NestFactory.createApplicationContext`, loguea **"workers up"** y termina con exit 0 (verificado).

## Notes
- Implementado en `apps/workers/`. Mismo setup CommonJS + decoradores que la API.
- Los workers reales (OCR, verificación, warmeo WhatsApp) sobre BullMQ llegan en Épicas 5/6/7.
