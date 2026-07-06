# E11-T1 — Logger estructurado compartido

Logger JSON consultable en `packages/shared` con correlación por contexto
(`businessId`/`transactionId`/`voucherId`…). API mínima (`info/warn/error/debug`),
`child(context)` para acumular correlación, sink y reloj inyectables (testeable). Adopción
incremental: se expone y se usa en los puntos nuevos de la Épica 11 sin reescribir el
logging existente basado en `@nestjs/common` `Logger`.

## Entregable
- `packages/shared/src/logger.ts`: `StructuredLogger`, `consoleJsonSink`, `createMemorySink`,
  `serializeError`. Reexportado por `@check/shared`.
- api/workers proveen un `StructuredLogger` (`{ service }`) vía `APP_LOGGER`.

## Criterios de aceptación
- [x] Emite una línea JSON por evento (nivel, mensaje, timestamp ISO, contexto).
- [x] `child()` acumula contexto de correlación heredando sink/clock/nivel.
- [x] Respeta el nivel mínimo; `error` normaliza `Error` a `{ name, message, stack }`.
- [x] Sink y reloj inyectables ⇒ cubierto por tests sin tocar stdout real.
