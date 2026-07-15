import { Injectable } from "@nestjs/common";
import type { IssuerBank, OcrStatus, VerdictStatus } from "@prisma/client";

import { TenantService } from "../tenant/tenant.service";

/**
 * Comprobante (voucher) tal como lo consume el resumen "Comprobantes de hoy" del dashboard.
 *
 * A diferencia de `DashboardTransactionDto` (que solo existe cuando la verificación ya
 * terminó y creó una `Transaction`), este DTO expone el voucher DESDE que se sube, con su
 * estado de OCR — así el dueño ve los comprobantes que aún están en cola o que fallaron el
 * OCR, que de otro modo no aparecerían en ningún lado del dashboard.
 */
export interface DashboardVoucherDto {
  id: string;
  ocrStatus: OcrStatus;
  issuerBank: IssuerBank | null;
  amountCents: number | null;
  approvalNumber: string | null;
  createdAt: string;
  /** Veredicto de la verificación si ya existe transacción; `null` si el OCR aún no terminó. */
  verdict: VerdictStatus | null;
}

@Injectable()
export class VoucherListService {
  constructor(private readonly tenant: TenantService) {}

  /**
   * Lista los comprobantes del negocio creados desde `since` (más recientes primero).
   * Corre bajo `runAsTenant` para heredar la RLS de la Épica 2 (aislamiento por negocio).
   */
  async listSince(businessId: string, since: Date): Promise<DashboardVoucherDto[]> {
    return this.tenant.runAsTenant(businessId, async (tx) => {
      const rows = await tx.voucher.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true,
          ocrStatus: true,
          issuerBank: true,
          amountCents: true,
          approvalNumber: true,
          createdAt: true,
          transaction: { select: { verdict: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return rows.map((row) => ({
        id: row.id,
        ocrStatus: row.ocrStatus,
        issuerBank: row.issuerBank,
        amountCents: row.amountCents,
        approvalNumber: row.approvalNumber,
        createdAt: row.createdAt.toISOString(),
        verdict: row.transaction?.verdict ?? null,
      }));
    });
  }
}
