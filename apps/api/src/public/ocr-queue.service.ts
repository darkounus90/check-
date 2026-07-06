import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

import { env } from "../env";
import { OCR_JOB_NAME, OCR_QUEUE_NAME } from "./public.constants";

/** Payload del job de OCR: solo el id del `Voucher` ya creado (contrato E05-T3). */
export interface OcrJobPayload {
  voucherId: string;
}

/** Contrato mínimo para encolar el OCR de un comprobante (fakes en tests, E09-T4). */
export interface OcrEnqueuer {
  enqueueVoucherOcr(voucherId: string): Promise<void>;
}

/**
 * Productor de jobs de OCR desde la API (E09-T4). Espejo del `OcrQueueService` de
 * `apps/workers` (E05-T3): misma cola, mismo nombre de job, mismo payload y mismas
 * opciones de reintento, para que el comprobante subido por la PWA entre EXACTAMENTE
 * al mismo pipeline OCR → verificación que el resto de canales.
 */
@Injectable()
export class OcrQueueService implements OcrEnqueuer, OnModuleInit, OnModuleDestroy {
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

  /** Encola el OCR de un `Voucher` ya persistido con su archivo en Storage. */
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
