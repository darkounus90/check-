import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import * as QRCode from "qrcode";

import { PrismaService } from "../database/prisma.service";
import { env } from "../env";

/** URL estable del negocio y su render QR (E08-T6). */
export interface BusinessQr {
  /** URL que codifica el QR: `${PUBLIC_APP_URL}/n/{opaqueId}`. Estable por negocio. */
  url: string;
  /** PNG del QR en data URI (base64), listo para <img src> o descarga. */
  pngDataUrl: string;
  /** SVG del QR como string, para impresión sin pérdida a cualquier tamaño. */
  svg: string;
}

/** Subconjunto de Prisma que este servicio necesita (fake en tests). */
export interface QrBusinessStore {
  business: {
    findUnique(args: {
      where: { id: string };
      select: { opaqueId: true };
    }): Promise<{ opaqueId: string } | null>;
  };
}

/**
 * Genera el QR imprimible y estable de un negocio (E08-T6). El QR apunta SIEMPRE a la misma
 * URL (`${PUBLIC_APP_URL}/n/{opaqueId}`), que el enrutador (E08-T1) resuelve en el momento del
 * escaneo; así el QR físico no caduca aunque cambien los números del pool.
 *
 * El dominio es configurable por env (`PUBLIC_APP_URL`) para no hardcodear el host de producción.
 * El `opaqueId` es un cuid no adivinable (D3): quien tiene el QR ya conoce la URL, pero no se
 * puede enumerar negocios a partir de él.
 */
@Injectable()
export class QrService {
  constructor(@Inject(PrismaService) private readonly prisma: QrBusinessStore) {}

  /** URL pública estable de un negocio a partir de su opaqueId. */
  static buildUrl(opaqueId: string): string {
    return `${env.PUBLIC_APP_URL.replace(/\/+$/, "")}/n/${opaqueId}`;
  }

  async getBusinessQr(businessId: string): Promise<BusinessQr> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { opaqueId: true },
    });
    if (!business) throw new NotFoundException("Negocio no encontrado");

    const url = QrService.buildUrl(business.opaqueId);
    const [pngDataUrl, svg] = await Promise.all([
      QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 512 }),
      QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 2 }),
    ]);

    return { url, pngDataUrl, svg };
  }
}
