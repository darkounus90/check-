import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { MAX_VOUCHER_FILE_BYTES } from "./public.constants";
import {
  PublicVouchersService,
  type UploadedVoucherFile,
} from "./public-vouchers.service";

/**
 * Endpoints públicos de la PWA de fallback (Épica 9, E09-T2/T4). SIN JWT a propósito:
 * los guards de auth (E03) se aplican por controlador (`@UseGuards`), así que este
 * controlador queda fuera del gate al no declararlos. La seguridad de datos se
 * mantiene server-side: el negocio se resuelve por `opaqueId` (cuid no adivinable) y
 * las respuestas nunca incluyen el `businessId` interno ni el buzón.
 *
 * Rate limiting fino por negocio/IP: E09-T7 (pendiente) — se añadiría como guard o
 * middleware sobre este controlador sin tocar la lógica.
 */
@Controller("public")
export class PublicController {
  constructor(private readonly vouchers: PublicVouchersService) {}

  /** E09-T2: identifica el negocio detrás de `/n/{opaqueId}`. 200 `{name}` | 404. */
  @Get("n/:opaqueId")
  getBusiness(@Param("opaqueId") opaqueId: string) {
    return this.vouchers.getBusinessName(opaqueId);
  }

  /**
   * E09-T4: ingesta pública de comprobante (multipart, campo `file`).
   * 201 `{voucherId}` | 404 negocio | 415 tipo no soportado | 413 > 10 MB
   * (el límite de multer produce el 413 vía `PayloadTooLargeException`).
   */
  @Post("n/:opaqueId/vouchers")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_VOUCHER_FILE_BYTES } }))
  uploadVoucher(
    @Param("opaqueId") opaqueId: string,
    @UploadedFile() file?: UploadedVoucherFile,
  ) {
    if (!file) throw new BadRequestException("Falta el archivo (campo multipart `file`)");
    return this.vouchers.ingestVoucher(opaqueId, file);
  }

  /** E09-T4/T5: polling del estado. 200 `{ocrStatus, verdict}` | 404. */
  @Get("vouchers/:voucherId")
  getVoucherStatus(@Param("voucherId") voucherId: string) {
    return this.vouchers.getVoucherStatus(voucherId);
  }
}
