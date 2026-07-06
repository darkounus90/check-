import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";

import { OcrQueueService } from "./ocr-queue.service";
import {
  OCR_ENQUEUER,
  PUBLIC_RATE_LIMITS,
  PUBLIC_THROTTLE_TTL_MS,
  VOUCHER_STORAGE_UPLOADER,
} from "./public.constants";
import { PublicController } from "./public.controller";
import { PublicVouchersService } from "./public-vouchers.service";
import { VoucherStorageService } from "./voucher-storage.service";

/**
 * Módulo de endpoints públicos de la PWA de fallback (Épica 9). Aislado en su propio
 * módulo/controlador para que el anti-abuso de E09-T7 (rate limit por negocio/IP)
 * viva aquí sin tocar el resto de la API. `PrismaService` llega vía
 * `DatabaseModule` (@Global).
 *
 * Rate limiting (E09-T7): tres throttlers nombrados registrados con
 * `ThrottlerModule`. El `ThrottlerGuard` se aplica a nivel de controlador con
 * `@UseGuards` en `PublicController` (NO como `APP_GUARD`, que en Nest siempre es
 * global y throttlearía toda la API); así solo protege las rutas públicas. Cada
 * ruta elige qué throttlers la cubren con `@Throttle`/`@SkipThrottle`:
 * - Ingesta: `public-ingest-ip` (10/min por IP) + `public-ingest-business`
 *   (30/min por opaqueId, tracker por parámetro de ruta).
 * - Polling: `public-poll-ip` (60/min por IP).
 * Exceder cualquiera → 429 con cabecera `Retry-After` (la pone el guard).
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: PUBLIC_RATE_LIMITS.ingestPerIp.name,
        ttl: PUBLIC_THROTTLE_TTL_MS,
        limit: PUBLIC_RATE_LIMITS.ingestPerIp.limit,
      },
      {
        name: PUBLIC_RATE_LIMITS.ingestPerBusiness.name,
        ttl: PUBLIC_THROTTLE_TTL_MS,
        limit: PUBLIC_RATE_LIMITS.ingestPerBusiness.limit,
        // Tracker por negocio: cuenta por el `opaqueId` de la URL, no por IP, para
        // frenar un flood distribuido contra un mismo enlace. D3: el opaqueId solo
        // alimenta la clave interna de conteo; nunca se loguea.
        getTracker: (req: Record<string, unknown>) => {
          const params = req.params as { opaqueId?: string } | undefined;
          return params?.opaqueId ? `business:${params.opaqueId}` : (req.ip as string);
        },
      },
      {
        name: PUBLIC_RATE_LIMITS.pollPerIp.name,
        ttl: PUBLIC_THROTTLE_TTL_MS,
        limit: PUBLIC_RATE_LIMITS.pollPerIp.limit,
      },
    ]),
  ],
  controllers: [PublicController],
  providers: [
    PublicVouchersService,
    { provide: VOUCHER_STORAGE_UPLOADER, useClass: VoucherStorageService },
    { provide: OCR_ENQUEUER, useClass: OcrQueueService },
  ],
})
export class PublicModule {}
