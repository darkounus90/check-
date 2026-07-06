import { type AuditInput, Auditor } from "@check/shared";
import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";

/**
 * Servicio de auditoría de accesos a datos sensibles (Épica 12, E12-T6). Persiste cada acceso
 * en la tabla append-only `data_access_audits` (inmutable a nivel de BD por trigger + RLS).
 *
 * Regla de oro: auditar NUNCA debe hacer fallar la operación de negocio auditada. Un error al
 * persistir el evento se loguea pero no se propaga (se prefiere completar la operación a
 * bloquearla por un fallo de auditoría). El registro se hace best-effort con log de respaldo.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger("audit");
  private readonly auditor: Auditor;

  constructor(private readonly prisma: PrismaService) {
    this.auditor = new Auditor(async (event) => {
      await this.prisma.dataAccessAudit.create({
        data: {
          businessId: event.businessId,
          actorId: event.actorId,
          actorType: event.actorType,
          resource: event.resource,
          action: event.action,
          resourceId: event.resourceId,
          metadata: event.metadata as object,
          occurredAt: new Date(event.occurredAt),
        },
      });
    });
  }

  /** Registra un acceso a dato sensible. Best-effort: no propaga fallos de auditoría. */
  async record(input: AuditInput): Promise<void> {
    try {
      await this.auditor.record(input);
    } catch (error) {
      // Respaldo en el log estructurado para no perder la traza aunque la BD falle.
      this.logger.error(
        `No se pudo persistir el evento de auditoría (${input.resource}/${input.action}): ${
          (error as Error).message
        }`,
      );
    }
  }
}
