import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

import { env } from "../env";
import { VERIFICATION_JOB_NAME, VERIFICATION_QUEUE_NAME } from "./verification.constants";

/**
 * Payload del job de verificación (E06-T12). `pendingSinceUtc` está presente
 * únicamente en jobs de reintento (programados por `VerificationProcessorService`
 * cuando un veredicto queda `PENDING`): marca el momento en que ese veredicto pasó a
 * `PENDING` por primera vez, para que la máquina de estados (`retryPendingVerification`,
 * `packages/verifier`) pueda decidir si la ventana de espera ya expiró.
 */
export interface VerificationJobPayload {
  voucherId: string;
  pendingSinceUtc?: string;
}

/** Contrato mínimo para encolar la evaluación inicial de un comprobante (consumido por
 * `apps/workers/src/ocr/ocr.service.ts` al terminar el OCR con éxito). */
export interface VerificationEnqueuer {
  enqueueVerification(voucherId: string): Promise<void>;
}

/** Contrato mínimo para programar un reintento de un veredicto `PENDING` (consumido por
 * `VerificationProcessorService`). */
export interface VerificationRetryScheduler {
  scheduleRetry(voucherId: string, pendingSinceUtc: string, delayMs: number): Promise<void>;
}

/**
 * Encola jobs de verificación de comprobantes (E06-T12): evaluación inicial
 * (`enqueueVerification`, llamada tras un OCR exitoso) y reintentos de veredictos
 * `PENDING` (`scheduleRetry`, llamada por `VerificationProcessorService` mientras se
 * espera el correo real del banco receptor dentro de la ventana configurada).
 *
 * Mismo patrón que `OcrQueueService` (`apps/workers/src/ocr/ocr.queue.ts`, E05-T3).
 */
@Injectable()
export class VerificationQueueService
  implements VerificationEnqueuer, VerificationRetryScheduler, OnModuleInit, OnModuleDestroy
{
  private connection: IORedis | undefined;
  private queue: Queue<VerificationJobPayload> | undefined;

  onModuleInit(): void {
    this.connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue<VerificationJobPayload>(VERIFICATION_QUEUE_NAME, {
      connection: this.connection,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    await this.connection?.quit();
  }

  /** Encola la evaluación inicial de un `Voucher` con OCR ya procesado. */
  async enqueueVerification(voucherId: string): Promise<void> {
    if (!this.queue) throw new Error("VerificationQueueService no inicializado");
    await this.queue.add(
      VERIFICATION_JOB_NAME,
      { voucherId },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  /** Programa un reintento de un veredicto `PENDING` dentro de la ventana de espera. */
  async scheduleRetry(voucherId: string, pendingSinceUtc: string, delayMs: number): Promise<void> {
    if (!this.queue) throw new Error("VerificationQueueService no inicializado");
    await this.queue.add(
      VERIFICATION_JOB_NAME,
      { voucherId, pendingSinceUtc },
      {
        delay: delayMs,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
