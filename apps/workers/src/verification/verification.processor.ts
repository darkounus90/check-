import type { PendingVerificationState, Verdict } from "@check/verifier";
import { allDefenses, retryPendingVerification, runDefenses } from "@check/verifier";
import { Inject, Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import type { ApprovalNumberGateway } from "./verification.approval-gateway";
import { PrismaApprovalNumberGateway } from "./verification.approval-gateway";
import { VERIFICATION_CLOCK } from "./verification.constants";
import {
  DEFAULT_VERIFICATION_WINDOW_MINUTES,
  type GatheredVerification,
  gatherVerificationContext,
  type VerificationContextStore,
} from "./verification.context";
import type { VerificationRetryScheduler } from "./verification.queue";
import { VerificationQueueService } from "./verification.queue";
import { VerificationService } from "./verification.service";

/** Intervalo de sondeo entre reintentos mientras un veredicto sigue `PENDING` (E06-T12).
 * No necesita ser exacto: `retryPendingVerification` decide igual la transición a
 * `SUSPICIOUS` en cuanto la ventana configurada del negocio expire, sin importar cuántos
 * sondeos hayan pasado antes. */
export const RETRY_POLL_INTERVAL_MS = 60_000;

/**
 * Orquesta el flujo completo de verificación de un comprobante (E06-T12): arma el
 * contexto (`gatherVerificationContext`), corre las 7 defensas reales
 * (`runDefenses(allDefenses, ...)`), persiste el veredicto (`VerificationService.
 * persistVerdict`, E06-T11) y, si queda `PENDING`, programa un reintento dentro de la
 * ventana de espera del correo real del banco receptor.
 *
 * `process` es la evaluación inicial (llamada al encolar `enqueueVerification`, ej. al
 * terminar el OCR con éxito). `retry` es el reintento (llamado por el job programado por
 * `scheduleRetry`), que recalcula el contexto (el correo pudo haber llegado ya) y usa
 * `retryPendingVerification` (`packages/verifier/src/state-machine.ts`) para decidir el
 * estado final: sigue `PENDING` (se reprograma otro reintento), pasa a `VERIFIED`
 * (el agregador manda) o expira a `SUSPICIOUS` (ventana agotada sin correo real).
 */
@Injectable()
export class VerificationProcessorService {
  private readonly logger = new Logger("verification-processor");

  constructor(
    @Inject(PrismaService) private readonly store: VerificationContextStore,
    @Inject(PrismaApprovalNumberGateway) private readonly approvalNumbers: ApprovalNumberGateway,
    private readonly verificationService: VerificationService,
    @Inject(VerificationQueueService) private readonly scheduler: VerificationRetryScheduler,
    @Inject(VERIFICATION_CLOCK) private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  /** Primera evaluación de un `voucherId` (comprobante ya procesado por OCR). */
  async process(voucherId: string): Promise<Verdict> {
    const nowUtc = this.clock();
    const gathered = await this.gather(voucherId, nowUtc);
    const verdict = await runDefenses(allDefenses, gathered.input);

    await this.persistAndFollowUp(voucherId, gathered, verdict, nowUtc);
    return verdict;
  }

  /** Reintento de un veredicto `PENDING` vigente desde `pendingSinceUtc`. */
  async retry(voucherId: string, pendingSinceUtc: string): Promise<Verdict> {
    const nowUtc = this.clock();
    const gathered = await this.gather(voucherId, nowUtc);
    const windowMinutes =
      gathered.input.context.business.verificationWindowMinutes ??
      DEFAULT_VERIFICATION_WINDOW_MINUTES;

    // Wrapper mínimo para `retryPendingVerification`: solo necesita `status === "PENDING"`
    // para aceptar el estado (ver `packages/verifier/src/state-machine.ts`); el resto del
    // veredicto anterior no se usa (el reintento manda o, si expira, se descarta a favor
    // del mensaje de expiración que arma `resolvePendingVerdict`).
    const pendingState: PendingVerificationState = {
      verdict: {
        status: "PENDING",
        evidenceSources: [],
        reason: "reintento programado tras espera de correo real del banco receptor",
      },
      pendingSinceUtc,
    };

    const verdict = await retryPendingVerification(pendingState, windowMinutes, nowUtc, () =>
      runDefenses(allDefenses, gathered.input),
    );

    await this.persistAndFollowUp(voucherId, gathered, verdict, nowUtc, pendingSinceUtc);
    return verdict;
  }

  private async gather(voucherId: string, nowUtc: string): Promise<GatheredVerification> {
    return gatherVerificationContext(
      this.store,
      this.approvalNumbers,
      { voucherId, nowUtc },
      (error) => {
        this.logger.error(
          `No se pudo consultar la base global de aprobaciones para el voucher ${voucherId}: ${
            (error as Error).message
          }`,
        );
      },
    );
  }

  private async persistAndFollowUp(
    voucherId: string,
    gathered: GatheredVerification,
    verdict: Verdict,
    nowUtc: string,
    pendingSinceUtc?: string,
  ): Promise<void> {
    await this.verificationService.persistVerdict({
      businessId: gathered.businessId,
      voucherId,
      amountCents: gathered.amountCents,
      ...(gathered.approvalNumber !== undefined ? { approvalNumber: gathered.approvalNumber } : {}),
      verdict,
      nowUtc,
    });

    if (verdict.status === "VERIFIED" && gathered.issuerBankSlug && gathered.approvalNumber) {
      try {
        await this.approvalNumbers.register(
          gathered.issuerBankSlug,
          gathered.approvalNumber,
          gathered.businessId,
        );
      } catch (error) {
        this.logger.error(
          `No se pudo registrar el número de aprobación en la base global (voucher ${voucherId}): ${
            (error as Error).message
          }`,
        );
      }
    }

    if (verdict.status === "PENDING") {
      await this.scheduler.scheduleRetry(voucherId, pendingSinceUtc ?? nowUtc, RETRY_POLL_INTERVAL_MS);
    }
  }
}
