# E12-T3 — Politica de retencion y job de purga

**Objetivo:** política de retención por tipo/antigüedad + job de purga con traza.

**Entregado:**
- `packages/shared/src/retention.ts` (ventanas, cutoff, isBeyondRetention, buildPurgeTrace, reloj inyectable).
- `RetentionService` (apps/workers) con setInterval (`RETENTION_PURGE_INTERVAL_MS`) y `purgeOnce()`; traza por tipo. money_op_logs/data_access_audits no se purgan.

**Aceptación:** datos fuera de ventana se purgan y queda registro (`retention.service.test.ts`). ✅
