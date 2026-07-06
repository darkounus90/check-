# E11-T8 — Endpoints health/readiness por app

Cada app expone health consumible por el hosting. Liveness (proceso responde) + readiness
real (DB alcanzable vía Prisma `SELECT 1`, Redis vía `PING`) con timeout y agregación
(`ok`/`degraded`/`down`). Comprobaciones inyectables (testeable).

## Entregable
- `packages/shared/src/health.ts`: `runHealthChecks`, `HealthCheck`, `ReadinessReport`.
- api: `HealthController` (`GET /health`, `/health/ready`, `/health/metrics`) + `HealthService`.
- workers: servidor HTTP ligero en `main.ts` (`/health`, `/health/ready` → 503 si down,
  `/metrics`) + `HealthService`. Puerto `HEALTH_PORT`.

## Criterios de aceptación
- [x] `api` expone `/health` (liveness) y `/health/ready` (DB crítica + Redis no crítica).
- [x] `workers` expone `/health`, `/health/ready` (DB+Redis críticas, 503 si down) y `/metrics`.
- [x] Una dependencia crítica caída → `down`; una no-crítica → `degraded`; timeout → `down`.
