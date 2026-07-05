import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { type Job, Worker } from "bullmq";
import IORedis from "ioredis";

import { env } from "../env";
import { VERIFICATION_QUEUE_NAME } from "./verification.constants";
import { VerificationProcessorService } from "./verification.processor";
import type { VerificationJobPayload } from "./verification.queue";

/**
 * Consumer BullMQ de la cola `verification-processing` (E06-T12). Un job sin
 * `pendingSinceUtc` es la evaluación inicial de un comprobante; un job con
 * `pendingSinceUtc` es un reintento de un veredicto `PENDING` (ver
 * `verification.queue.ts`/`verification.processor.ts`).
 */
@Injectable()
export class VerificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("verification-worker");
  private connection: IORedis | undefined;
  private worker: Worker<VerificationJobPayload> | undefined;

  constructor(private readonly processor: VerificationProcessorService) {}

  onModuleInit(): void {
    this.connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.worker = new Worker<VerificationJobPayload>(
      VERIFICATION_QUEUE_NAME,
      async (job: Job<VerificationJobPayload>) => {
        const { voucherId, pendingSinceUtc } = job.data;
        if (pendingSinceUtc) {
          await this.processor.retry(voucherId, pendingSinceUtc);
        } else {
          await this.processor.process(voucherId);
        }
      },
      { connection: this.connection },
    );
    this.worker.on("failed", (job, error) => {
      this.logger.error(
        `Job ${job?.id} (voucher ${job?.data.voucherId}) falló tras sus reintentos: ${error.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
