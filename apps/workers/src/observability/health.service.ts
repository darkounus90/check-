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
 * Readiness + métricas de los workers (Épica 11, E11-T7/T8).
 *
 * `readiness()` comprueba las dependencias reales del proceso (Postgres vía Prisma
 * `SELECT 1`, Redis vía `PING`) con timeout y las agrega. `metrics()` vuelca el snapshot
 * del registro de métricas. Ambos consumibles por el hosting a través del endpoint HTTP
 * ligero de `main.ts`.
 */
@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(METRICS_REGISTRY) private readonly metricsRegistry: MetricsRegistry,
  ) {}

  /** Comprobaciones de dependencia. Redis solo es crítico si el pipeline lo necesita. */
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
        critical: true,
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
