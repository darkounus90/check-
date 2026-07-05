import { Injectable, InternalServerErrorException } from "@nestjs/common";

import { env } from "../env";

/**
 * Bucket de Supabase Storage donde se suben los comprobantes (Épicas 7/9, aún no
 * implementadas — este worker solo descarga, no sube). Convención asumida: un único
 * bucket privado `vouchers`, con `storagePath` (columna `Voucher.storagePath`) como la
 * ruta del objeto dentro de ese bucket (sin prefijo de bucket).
 */
export const VOUCHER_STORAGE_BUCKET = "vouchers";

/** Contrato mínimo de descarga de comprobantes (para inyectar fakes en tests, E05-T3). */
export interface VoucherImageDownloader {
  downloadVoucherImage(storagePath: string): Promise<Uint8Array>;
}

/**
 * Cliente mínimo de Supabase Storage (REST), mismo estilo minimalista que
 * `SupabaseAdminService` de `apps/api` (fetch directo, sin el SDK `@supabase/supabase-js`).
 */
@Injectable()
export class StorageService implements VoucherImageDownloader {
  private readonly base = `${env.SUPABASE_URL}/storage/v1/object`;
  private readonly headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };

  /** Descarga los bytes de un comprobante desde Storage a partir de su `storagePath`. */
  async downloadVoucherImage(storagePath: string): Promise<Uint8Array> {
    const res = await fetch(`${this.base}/${VOUCHER_STORAGE_BUCKET}/${storagePath}`, {
      headers: this.headers,
    });
    if (!res.ok) {
      throw new InternalServerErrorException(
        `No se pudo descargar el comprobante de Storage (${res.status}): ${storagePath}`,
      );
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}
