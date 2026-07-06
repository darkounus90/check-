import {
  buildPurgeTrace,
  type PurgeTraceEntry,
  resolveRetentionPolicy,
  type RetainedDataType,
  retentionCutoff,
  type RetentionPolicy,
} from "@check/shared";
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { env } from "../env";

/** Reloj inyectable para purga determinista en test. */
export type RetentionClock = () => Date;

/**
 * Job de purga por política de retención (Épica 12, E12-T3).
 *
 * Cada `RETENTION_PURGE_INTERVAL_MS` recorre los tipos de dato con ventana de retención y borra
 * las filas fuera de ventana (cutoff calculado con la función pura `retentionCutoff` de
 * `@check/shared`, reloj inyectable). Cada ciclo deja una traza estructurada en el log (qué tipo,
 * corte, cuántas filas). El log inmutable de dinero y la auditoría NO se purgan (evidencia legal).
 *
 * El `setInterval` no arranca en `NODE_ENV=test`; la lógica se ejerce llamando `purgeOnce()`.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("retention");
  private timer: NodeJS.Timeout | undefined;
  private readonly policy: RetentionPolicy;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly clock: RetentionClock = () => new Date(),
  ) {
    this.policy = resolveRetentionPolicy({
      voucher: env.RETENTION_VOUCHER_DAYS,
      bankEmail: env.RETENTION_BANK_EMAIL_DAYS,
      qrResolutionLog: env.RETENTION_QR_LOG_DAYS,
      waSession: env.RETENTION_WA_SESSION_DAYS,
    });
  }

  onModuleInit(): void {
    if (env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      void this.purgeOnce();
    }, env.RETENTION_PURGE_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Un ciclo de purga: borra por tipo lo que esté fuera de ventana y devuelve las trazas.
   * Público para ejercerlo en test. Un fallo en un tipo se loguea y no aborta el resto.
   */
  async purgeOnce(): Promise<PurgeTraceEntry[]> {
    const now = this.clock();
    const traces: PurgeTraceEntry[] = [];

    for (const type of [
      "voucher",
      "bankEmail",
      "qrResolutionLog",
      "waSession",
    ] as RetainedDataType[]) {
      try {
        const cutoff = retentionCutoff(type, now, this.policy);
        const count = await this.purgeType(type, cutoff);
        const trace = buildPurgeTrace(type, cutoff, count, now);
        traces.push(trace);
        if (count > 0) {
          this.logger.log(
            `purga ${type}: ${count} filas antes de ${trace.cutoff} (política ${this.policy[type]}d)`,
          );
        }
      } catch (error) {
        this.logger.error(`purga de ${type} falló: ${(error as Error).message}`);
      }
    }

    return traces;
  }

  /** Borra las filas de un tipo cuya fecha de referencia sea anterior al corte. */
  private async purgeType(type: RetainedDataType, cutoff: Date): Promise<number> {
    switch (type) {
      case "voucher": {
        // Cascada borra transaction/evidence/waContext del voucher.
        const res = await this.prisma.voucher.deleteMany({ where: { createdAt: { lt: cutoff } } });
        return res.count;
      }
      case "bankEmail": {
        const res = await this.prisma.bankEmail.deleteMany({
          where: { receivedAt: { lt: cutoff } },
        });
        return res.count;
      }
      case "qrResolutionLog": {
        const res = await this.prisma.qrResolutionLog.deleteMany({
          where: { createdAt: { lt: cutoff } },
        });
        return res.count;
      }
      case "waSession": {
        // Solo sesiones inactivas (updatedAt viejo): un número activo refresca su auth-state.
        const res = await this.prisma.waSession.deleteMany({
          where: { updatedAt: { lt: cutoff } },
        });
        return res.count;
      }
    }
  }
}
