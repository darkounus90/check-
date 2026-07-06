# E11-T6 — Captura global de errores no manejados

Cualquier error no manejado termina en la cola de alertas (nunca en silencio). En workers:
`uncaughtException`/`unhandledRejection` del proceso. En api: filtro global de excepciones
NestJS (`APP_FILTER`).

## Entregable
- `packages/shared/src/alert-triggers.ts`: `buildUnhandledErrorAlert` (puro).
- `apps/workers/src/observability/global-error-capture.ts`: `GlobalErrorCapture`.
- `apps/api/src/observability/all-exceptions.filter.ts`: `AllExceptionsFilter`.

## Criterios de aceptación
- [x] Un throw no manejado en un worker termina como alerta crítica + log, no como silencio.
- [x] En api, una 5xx no controlada → log de error + alerta; una 4xx (cliente) → warn, sin alerta.
- [x] La respuesta al cliente mantiene el shape de Nest (`HttpException` respeta status/body).
