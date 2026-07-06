# E11-T5 — Alerta de colas atascadas (BullMQ)

Monitor periódico de la cola OCR (`ocr-processing`): backlog (waiting), jobs fallidos y edad
del job en espera más antiguo. Si cualquier umbral se supera, alerta con el motivo. Umbrales
configurables por env.

## Entregable
- `packages/shared/src/alert-triggers.ts`: `evaluateQueueDepth` (puro).
- `apps/workers/src/ocr/ocr.queue.ts`: `OcrQueueService.getDepth`.
- `apps/workers/src/observability/queue-monitor.service.ts`: `QueueMonitorService`
  (`setInterval` desactivado en `NODE_ENV=test`; `checkOnce()` para ejercerlo).

## Criterios de aceptación
- [x] Un backlog simulado sobre umbral dispara alerta `queue_stuck` con el motivo.
- [x] Edad del job muy alta escala a `critical`.
- [x] Un fallo leyendo la cola (¿Redis caído?) se loguea y NO rompe el intervalo ni alerta.
- [x] Umbrales por env (`QUEUE_MONITOR_MAX_WAITING/FAILED/OLDEST_MS`).
