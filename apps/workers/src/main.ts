import "reflect-metadata";

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { StructuredLogger } from "@check/shared";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { env } from "./env";
import { HealthService } from "./observability/health.service";
import { APP_LOGGER } from "./observability/observability.tokens";

/**
 * Arranque de los workers. Además del `ApplicationContext` (colas OCR/verificación, pool
 * WhatsApp), levanta un servidor HTTP ligero de salud (Épica 11, E11-T8): `/health` (liveness),
 * `/health/ready` (readiness real: DB/Redis) y `/metrics` (E11-T7), consumibles por el hosting.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });
  await app.init();

  const logger = app.get<StructuredLogger>(APP_LOGGER);
  const health = app.get(HealthService);
  const server = startHealthServer(health, logger);

  const shutdown = async (): Promise<void> => {
    server.close();
    await app.close();
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());

  logger.info("workers arriba", { env: env.NODE_ENV, healthPort: env.HEALTH_PORT });
}

function startHealthServer(health: HealthService, logger: StructuredLogger): ReturnType<typeof createServer> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handle(req, res, health).catch((error: unknown) => {
      logger.error("health endpoint falló", { error: error instanceof Error ? error.message : String(error) });
      if (!res.headersSent) json(res, 500, { status: "error" });
    });
  });
  server.listen(env.HEALTH_PORT, () => {
    logger.info("health server escuchando", { healthPort: env.HEALTH_PORT });
  });
  return server;
}

async function handle(req: IncomingMessage, res: ServerResponse, health: HealthService): Promise<void> {
  const url = req.url ?? "/";
  if (url === "/health") {
    // Liveness: el proceso responde. No toca dependencias externas.
    json(res, 200, { status: "ok", service: "workers", timestamp: new Date().toISOString() });
    return;
  }
  if (url === "/health/ready") {
    const report = await health.readiness();
    json(res, report.status === "down" ? 503 : 200, report);
    return;
  }
  if (url === "/metrics") {
    json(res, 200, health.metrics());
    return;
  }
  json(res, 404, { status: "not_found" });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

void bootstrap();
