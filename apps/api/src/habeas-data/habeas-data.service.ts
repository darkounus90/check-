import { Injectable } from "@nestjs/common";

import { AuditService } from "../audit/audit.service";
import { CryptoService } from "../crypto/crypto.service";
import { PrismaService } from "../database/prisma.service";

/**
 * Habeas data (Épica 12, E12-T4): ejercicio de los derechos del titular bajo la Ley 1581/2012
 * (Colombia): acceso (export) y eliminación (delete) de la información personal de un titular.
 *
 * Identificación del titular: en CHECK el titular es el pagador que envió un comprobante. Su
 * huella en el sistema son los `WaVoucherContext.remoteJid` (JID de WhatsApp) — el mejor
 * identificador estable de un titular. El export/delete se acota SIEMPRE al negocio que atiende
 * la solicitud (RLS + filtro por `businessId`): un negocio solo ejerce derechos sobre datos que
 * le pertenecen.
 *
 * Alcance de datos personales de un titular en un negocio:
 * - Vouchers cuyo `WaVoucherContext.remoteJid` coincide (comprobante + ocrText + PII + artefacto).
 * - Sus Transactions y EvidenceSources (por cascada del voucher).
 * - Registros de consentimiento (`privacy_consents`) con ese `subjectRef`.
 *
 * El export DESCIFRA los campos sensibles para entregar la información legible al titular; esa
 * acción queda auditada (E12-T6).
 */
@Injectable()
export class HabeasDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Exporta toda la información personal de un titular (identificado por su JID de WhatsApp)
   * dentro de un negocio. Descifra los campos sensibles para entregarlos legibles.
   */
  async exportSubject(businessId: string, actorId: string, subjectRef: string) {
    const contexts = await this.prisma.waVoucherContext.findMany({
      where: { remoteJid: subjectRef, voucher: { businessId } },
      select: {
        voucher: {
          select: {
            id: true,
            issuerBank: true,
            amountCents: true,
            approvalNumber: true,
            paidAt: true,
            destinationAccount: true,
            beneficiary: true,
            storagePath: true,
            ocrText: true,
            ocrStatus: true,
            createdAt: true,
            transaction: {
              select: {
                id: true,
                verdict: true,
                amountCents: true,
                approvalNumber: true,
                createdAt: true,
                resolvedAt: true,
              },
            },
          },
        },
      },
    });

    const vouchers = contexts.map((c) => ({
      ...c.voucher,
      // Descifrado del campo sensible para el export legible (E12-T1/T4).
      ocrText: this.crypto.decryptString(c.voucher.ocrText),
    }));

    const consents = await this.prisma.privacyConsent.findMany({
      where: { businessId, subjectRef },
      select: {
        channel: true,
        noticeVersion: true,
        acceptedAt: true,
      },
    });

    await this.audit.record({
      businessId,
      actorId,
      resource: "data_subject_export",
      action: "export",
      resourceId: subjectRef,
      metadata: { voucherCount: vouchers.length, consentCount: consents.length },
    });

    return {
      subjectRef,
      businessId,
      exportedAt: new Date().toISOString(),
      vouchers,
      consents,
    };
  }

  /**
   * Elimina la información personal de un titular en un negocio. Borra los vouchers asociados
   * (cascada a transaction/evidence/waContext) y sus registros de consentimiento. Deja la
   * eliminación auditada (traza inmutable del ejercicio del derecho).
   *
   * NOTA: el log inmutable de operaciones con dinero (`money_op_logs`) NO se borra — es la
   * evidencia legal de decisiones antifraude y no contiene el comprobante ni la imagen. El
   * artefacto en Storage se elimina aparte (delegado a un worker/limpieza por `storagePath`).
   */
  async deleteSubject(businessId: string, actorId: string, subjectRef: string) {
    const contexts = await this.prisma.waVoucherContext.findMany({
      where: { remoteJid: subjectRef, voucher: { businessId } },
      select: { voucherId: true, voucher: { select: { storagePath: true } } },
    });
    const voucherIds = contexts.map((c) => c.voucherId);
    const storagePaths = contexts
      .map((c) => c.voucher.storagePath)
      .filter((p): p is string => p != null);

    const deleted =
      voucherIds.length === 0
        ? { count: 0 }
        : await this.prisma.voucher.deleteMany({
            where: { id: { in: voucherIds }, businessId },
          });

    const consentsDeleted = await this.prisma.privacyConsent.deleteMany({
      where: { businessId, subjectRef },
    });

    await this.audit.record({
      businessId,
      actorId,
      resource: "data_subject_delete",
      action: "delete",
      resourceId: subjectRef,
      metadata: {
        vouchersDeleted: deleted.count,
        consentsDeleted: consentsDeleted.count,
        // Los artefactos quedan pendientes de limpieza en Storage (por storagePath).
        storagePathsToPurge: storagePaths,
      },
    });

    return {
      subjectRef,
      businessId,
      deletedAt: new Date().toISOString(),
      vouchersDeleted: deleted.count,
      consentsDeleted: consentsDeleted.count,
      storagePathsToPurge: storagePaths,
    };
  }
}
