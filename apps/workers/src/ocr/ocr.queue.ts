import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

import { env } from "../env";
import { OCR_JOB_NAME, OCR_QUEUE_NAME } from "./ocr.constants";

/** Payload del job de OCR: solo el id del `Voucher` ya creado. */
export interface OcrJobPayload {
  voucherId: string;
}

/**
 * Encola jobs de OCR de comprobantes (E05-T3). Las épicas de canal (7/9, buzón
 * WhatsApp/PWA) que aún no existen invocarán `enqueueVoucherOcr` una vez creen el
 * `Voucher` y suban su imagen a Storage.
 */
@Injectable()
export class OcrQueueService implements OnModuleInit, OnModuleDestroy {
  private connection: IORedis | undefined;
  private queue: Queue<OcrJobPayload> | undefined;

  onModuleInit(): void {
    this.connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue<OcrJobPayload>(OCR_QUEUE_NAME, { connection: this.connection });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    await this.connection?.quit();
  }

  /** Encola el OCR de un `Voucher` ya persistido con su imagen en Storage. */
  async enqueueVoucherOcr(voucherId: string): Promise<void> {
    if (!this.queue) throw new Error("OcrQueueService no inicializado");
    await this.queue.add(
      OCR_JOB_NAME,
      { voucherId },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
