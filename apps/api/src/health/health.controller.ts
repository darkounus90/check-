import type { MetricsSnapshot, ReadinessReport } from "@check/shared";
import { Controller, Get, HttpCode, Inject } from "@nestjs/common";

import { HealthService } from "../observability/health.service";

interface HealthResponse {
  status: "ok";
  service: "api";
  timestamp: string;
}

/**
 * Endpoints de salud de la API (Épica 11, E11-T7/T8), consumibles por el hosting:
 * - `GET /health`        liveness: el proceso responde (sin tocar dependencias).
 * - `GET /health/ready`  readiness real: DB (crítica) + Redis (no crítica) alcanzables.
 * - `GET /health/metrics` snapshot de métricas de salud (E11-T7).
 */
@Controller("health")
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get()
  check(): HealthResponse {
    return {
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async ready(): Promise<ReadinessReport> {
    // Devuelve siempre 200 con el detalle: el hosting decide por el campo `status`. (Un 503
    // vía excepción rompería el body estructurado; ver `/health/ready` de workers para 503).
    return this.health.readiness();
  }

  @Get("metrics")
  @HttpCode(200)
  metrics(): MetricsSnapshot {
    return this.health.metrics();
  }
}
