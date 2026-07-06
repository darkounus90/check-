# E07-T6 Motor de warmeo de números nuevos

## Goal

Escalar gradualmente el volumen de envíos de un número recién dado de alta (para no ser
baneado por WhatsApp) y mantenerlo FUERA del pool hasta completar una ventana de warmeo de
2 semanas. Aquí solo el motor + el predicado de elegibilidad; el pool real es E07-T7.

## Requirements

- Escalado del límite de envíos por hora según la antigüedad del número:
  - Día 1 (primeras 24h):        20/h
  - Semana 2 (día 7 en adelante): 60/h
  - Tras 14 días (warmeo done):   200/h
- Un número en warmeo NO supera su límite horario ni entra al pool antes de completar los
  14 días.
- Persistencia: fecha de alta del número (`warmupStartedAt`), contador de envíos por ventana
  horaria (`warmupHourWindowStart` + `warmupSentInWindow`), estado de warmeo.
- Funciones testeables (todas dependen de un `now` epoch INYECTADO, sin `Date.now()` interno):
  - `canSend(state, now)`: ¿puede enviar uno más sin pasar el tope horario? (predicado puro)
  - `registerSend(state, now)`: transición de estado tras un envío real (abre ventana nueva al
    cruzar la hora, o incrementa el conteo).
  - `isPoolEligible(state, now)`: ¿completó los 14 días de warmeo? (para E07-T7).
- Enganche en el `sendMessage` central: no envía si `!canSend`; registra tras enviar.

## Acceptance Criteria

- [x] `hourlyLimit` escala por escalón (día1=20, sem2=60, tras 14d=200).
- [x] Un número en warmeo no supera su límite horario (canSend bloquea el envío #N+1).
- [x] `registerSend` reinicia el conteo al cruzar la hora (ventana nueva).
- [x] `isPoolEligible` es false durante la ventana de 14 días y true al completarla.
- [x] `pnpm --filter @check/whatsapp build|typecheck|lint|test` y `@check/database
      build|typecheck` verdes (migración del schema incluida).

## Notes

- `packages/whatsapp/src/warmup.ts`: `canSend`, `registerSend`, `isPoolEligible`,
  `hourlyLimit`, `WARMUP_HOURLY_LIMITS`, `WARMUP_WINDOW_MS`.
- Schema: `WaNumber.warmupStartedAt` ya existía; se añaden `warmupHourWindowStart` +
  `warmupSentInWindow` (migración `20260706130000_add_wa_number_warmup_counters`).
- Puerto `WarmupStore` en `types.ts`; implementación Prisma en `apps/workers` (`WhatsAppStore`).
