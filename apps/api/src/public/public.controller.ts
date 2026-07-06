import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";

import { MAX_VOUCHER_FILE_BYTES, PUBLIC_RATE_LIMITS } from "./public.constants";
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
 * Rate limiting fino por negocio/IP (E09-T7): `ThrottlerGuard` a nivel de
 * controlador (los throttlers nombrados se registran en `PublicModule`). Cada ruta
 * declara con `@SkipThrottle` qué throttlers NO le aplican; sin decorador, TODOS
 * los registrados cubren la ruta. Exceder un límite → 429 con `Retry-After`.
 */
@Controller("public")
@UseGuards(ThrottlerGuard)
export class PublicController {
  // Token de inyección explícito: además de ser idiomático, permite resolver la
  // dependencia sin metadatos de tipo de constructor (los tests corren bajo tsx,
  // que no emite `design:paramtypes`).
  constructor(
    @Inject(PublicVouchersService) private readonly vouchers: PublicVouchersService,
  ) {}

  /**
   * E09-T2: identifica el negocio detrás de `/n/{opaqueId}`. 200 `{name}` | 404.
   * Lectura barata que la PWA hace una sola vez al abrir el enlace: sin rate limit.
   * Se listan TODOS los throttlers nombrados: `@SkipThrottle()` sin argumentos solo
   * saltea el throttler `default`, que aquí no existe (todos son nombrados).
   */
  @Get("n/:opaqueId")
  @SkipThrottle({
    [PUBLIC_RATE_LIMITS.ingestPerIp.name]: true,
    [PUBLIC_RATE_LIMITS.ingestPerBusiness.name]: true,
    [PUBLIC_RATE_LIMITS.pollPerIp.name]: true,
  })
  getBusiness(@Param("opaqueId") opaqueId: string) {
    return this.vouchers.getBusinessName(opaqueId);
  }

  /**
   * E09-T4: ingesta pública de comprobante (multipart, campo `file`).
   * 201 `{voucherId}` | 404 negocio | 415 tipo no soportado | 413 > 10 MB
   * (el límite de multer produce el 413 vía `PayloadTooLargeException`).
   */
  @Post("n/:opaqueId/vouchers")
  // Ingesta: rate limit por IP (10/min) y por negocio (30/min). No aplica el
  // throttler de polling (que es mucho más generoso).
  @SkipThrottle({ [PUBLIC_RATE_LIMITS.pollPerIp.name]: true })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_VOUCHER_FILE_BYTES } }))
  uploadVoucher(
    @Param("opaqueId") opaqueId: string,
    @UploadedFile() file?: UploadedVoucherFile,
  ) {
    if (!file) throw new BadRequestException("Falta el archivo (campo multipart `file`)");
    return this.vouchers.ingestVoucher(opaqueId, file);
  }

  /**
   * E09-T4/T5: polling del estado. 200 `{ocrStatus, verdict}` | 404.
   * Rate limit generoso por IP (60/min): el polling legítimo corre cada ~2.5 s
   * durante ≤2 min. No aplican los throttlers de ingesta.
   */
  @Get("vouchers/:voucherId")
  @SkipThrottle({
    [PUBLIC_RATE_LIMITS.ingestPerIp.name]: true,
    [PUBLIC_RATE_LIMITS.ingestPerBusiness.name]: true,
  })
  getVoucherStatus(@Param("voucherId") voucherId: string) {
    return this.vouchers.getVoucherStatus(voucherId);
  }
}
