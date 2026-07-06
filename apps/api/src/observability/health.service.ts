import {
  type HealthCheck,
  type MetricsRegistry,
  type MetricsSnapshot,
  type ReadinessReport,
  runHealthChecks,
} from "@check/shared";
import { Inject, Injectable } from "@nestjs/common";
import IORedis from "ioredis";

import { PrismaService } from "../database/prisma.service";
import { env } from "../env";
import { METRICS_REGISTRY } from "./observability.tokens";

/**
 * Readiness + métricas de la API (Épica 11, E11-T7/T8).
 *
 * `readiness()` comprueba Postgres (Prisma `SELECT 1`) y Redis (`PING`) con timeout y las
 * agrega. Redis es NO crítico para la API (solo lo usa la ingesta pública de comprobantes vía
 * cola; el resto de la API funciona sin él): su caída degrada, no tumba. `metrics()` vuelca el
 * snapshot del registro. Consumibles por el `HealthController`.
 */
@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(METRICS_REGISTRY) private readonly metricsRegistry: MetricsRegistry,
  ) {}

  private checks(): HealthCheck[] {
    return [
      {
        name: "database",
        critical: true,
        probe: async () => {
          await this.prisma.$queryRawUnsafe("SELECT 1");
        },
      },
      {
        name: "redis",
        critical: false,
        probe: async () => {
          const client = new IORedis(env.REDIS_URL, {
            maxRetriesPerRequest: 1,
            lazyConnect: true,
            connectTimeout: 2000,
          });
          try {
            await client.connect();
            await client.ping();
          } finally {
            client.disconnect();
          }
        },
      },
    ];
  }

  async readiness(): Promise<ReadinessReport> {
    return runHealthChecks(this.checks());
  }

  metrics(): MetricsSnapshot {
    return this.metricsRegistry.snapshot();
  }
}
