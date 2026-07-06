# E11-T7 — Métricas básicas de salud

Registro en memoria consultable en JSON: contadores, histograma de duraciones
(count/p50/p95/max/avg) y tasas por etiqueta (éxito/fallo). Cubre las success-metrics:
tiempo a veredicto / duración del OCR, tasa de parseo por banco, uptime del proceso/canal.
Expuesto por endpoint (`/health/metrics` en api, `/metrics` en workers).

## Entregable
- `packages/shared/src/metrics.ts`: `MetricsRegistry`, `sharedMetrics`.
- workers: `OcrObserver` (duración OCR + tasa de extracción por banco).
- api: `IngestionService` (tasa de parseo de correos por banco).
- `HealthService.metrics()` en api y workers.

## Criterios de aceptación
- [x] Métricas observables en JSON: contadores, duraciones con percentiles, tasas por banco.
- [x] Uptime con reloj inyectable; histograma acotado (ventana móvil).
- [x] Endpoint de métricas expuesto por api y workers.
