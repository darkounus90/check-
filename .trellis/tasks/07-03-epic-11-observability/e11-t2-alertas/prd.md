# E11-T2 — Cola de alertas + despachador a canal

Abstracción de "canal de alerta" con transporte inyectable y un transporte real por webhook
(Slack `text` / Discord `content`, por URL de env). Cola en memoria que despacha con
reintento exponencial; ningún error se silencia (agotados los reintentos, el evento queda
en el log estructurado como `error`). Reloj/`sleep` inyectables.

## Entregable
- `packages/shared/src/alerts.ts`: `AlertDispatcher`, `AlertTransport`, `WebhookAlertTransport`,
  `LoggerAlertTransport`, `buildAlertTransportFromEnv`, `formatAlertText`.
- api/workers proveen un `AlertDispatcher` vía `ALERT_DISPATCHER` según `ALERT_WEBHOOK_URL`.

## Criterios de aceptación
- [x] Un evento llega al canal configurado (mock transport en test lo recibe).
- [x] El envío se reintenta ante fallo (backoff) y termina entregando si el canal se recupera.
- [x] Agotados los reintentos, NO se silencia: se loguea `error` con el evento completo.
- [x] `dispatch` nunca lanza aunque el transporte falle siempre (no rompe al productor).
- [x] Webhook real testeable con `fetch` inyectable (slack `text` / discord `content`).
