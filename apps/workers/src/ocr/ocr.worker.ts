import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { type Job, Worker } from "bullmq";
import IORedis from "ioredis";

import { env } from "../env";
import { OCR_QUEUE_NAME } from "./ocr.constants";
import type { OcrJobPayload } from "./ocr.queue";
import { OcrService } from "./ocr.service";

/**
 * Consumer BullMQ de la cola `ocr-processing` (E05-T3). Ejecuta `OcrService.process`
 * por cada job; los reintentos (backoff exponencial, máx. 3 intentos) los define
 * `OcrQueueService.enqueueVoucherOcr` al encolar.
 */
@Injectable()
export class OcrWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ocr-worker");
  private connection: IORedis | undefined;
  private worker: Worker<OcrJobPayload> | undefined;

  constructor(private readonly ocrService: OcrService) {}

  onModuleInit(): void {
    this.connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.worker = new Worker<OcrJobPayload>(
      OCR_QUEUE_NAME,
      async (job: Job<OcrJobPayload>) => {
        await this.ocrService.process(job.data.voucherId);
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
