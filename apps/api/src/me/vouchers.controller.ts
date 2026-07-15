import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { CurrentTenant } from "../auth/current-tenant.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import { MAX_VOUCHER_FILE_BYTES } from "../public/public.constants";
import {
  PublicVouchersService,
  type UploadedVoucherFile,
} from "../public/public-vouchers.service";
import type { TenantContext } from "../tenant/tenant.service";
import { type DashboardVoucherDto, VoucherListService } from "./voucher-list.service";

/** Inicio del día de HOY en zona Bogotá (UTC-5 fijo, sin DST), como instante UTC. */
function startOfTodayBogota(now: Date = new Date()): Date {
  const bogota = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(bogota.getUTCFullYear(), bogota.getUTCMonth(), bogota.getUTCDate(), 5, 0, 0),
  );
}

/**
 * Gap #9: subida AUTENTICADA de comprobante desde el dashboard (cajero o dueño). A
 * diferencia de la ruta pública `/public/n/:opaqueId/vouchers` (que resuelve el negocio por
 * un `opaqueId` de la URL), aquí el negocio se resuelve server-side desde el JWT vía
 * `RolesGuard` (`req.tenant`), así el cajero nunca envía ni conoce el `businessId`.
 *
 * Reutiliza `PublicVouchersService.ingestForBusiness` para entrar al MISMO pipeline
 * (Storage + cola OCR → verificación) que el resto de canales; no se duplica nada.
 * Mismas validaciones que el público: jpeg/png/webp/pdf, 10 MB (límite en multer → 413).
 * El polling del semáforo en vivo reutiliza el `GET /public/vouchers/:voucherId` existente
 * (el `voucherId` es un handle no adivinable que no filtra el negocio).
 */
@Controller("vouchers")
@UseGuards(SupabaseJwtGuard, RolesGuard)
export class VouchersController {
  constructor(
    private readonly vouchers: PublicVouchersService,
    private readonly voucherList: VoucherListService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_VOUCHER_FILE_BYTES } }))
  upload(@CurrentTenant() tenant: TenantContext, @UploadedFile() file?: UploadedVoucherFile) {
    if (!file) throw new BadRequestException("Falta el archivo (campo multipart `file`)");
    return this.vouchers.ingestForBusiness(tenant.businessId, file);
  }

  /**
   * Lista los comprobantes de HOY del negocio del usuario (incluye los que aún están en
   * OCR o que fallaron, que no tienen `Transaction`). Alimenta el resumen "Comprobantes de
   * hoy" del histórico. El negocio se resuelve del JWT (nunca de un parámetro del cliente).
   */
  @Get()
  listToday(@CurrentTenant() tenant: TenantContext): Promise<DashboardVoucherDto[]> {
    return this.voucherList.listSince(tenant.businessId, startOfTodayBogota());
  }
}
