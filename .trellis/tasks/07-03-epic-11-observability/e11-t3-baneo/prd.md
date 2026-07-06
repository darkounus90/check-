# E11-T3 — Alerta de baneo de número WhatsApp

Se dispara cuando la salud de un número pasa a `banned`. Contexto accionable: qué número
(id + teléfono), cuántos negocios afectaba, si hay número sano de reemplazo para esos
negocios y, si no lo hay, que hace falta warmear uno nuevo.

## Entregable
- `packages/shared/src/alert-triggers.ts`: `buildNumberBannedAlert` (puro).
- `apps/workers/src/whatsapp/ban-alert.service.ts`: `BanAlertHealthStore`, decorador de
  `HealthStore` que detecta la TRANSICIÓN a `banned` y despacha (no re-alerta cada tick).
- `WhatsAppStore.getBanContext`: negocios afectados + reemplazos sanos.
- `WhatsAppManager` interpone el decorador entre el `HealthMonitor` (E07-T9) y el store.

## Criterios de aceptación
- [x] Un baneo simulado dispara la alerta con número, negocios afectados y reemplazo/warmeo.
- [x] Solo alerta en la transición a `banned`, no en cada tick estando ya baneado.
- [x] Sin reemplazo → `critical` + `needsWarmup`; con reemplazo → `warning`.
- [x] Persiste la salud igual que antes (delegación al store real).
