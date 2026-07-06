import { Injectable, InternalServerErrorException } from "@nestjs/common";

import { env } from "../env";
import { VOUCHER_STORAGE_BUCKET } from "./public.constants";

/** Contrato mínimo de subida de comprobantes (para inyectar fakes en tests, E09-T4). */
export interface VoucherStorageUploader {
  uploadVoucher(storagePath: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

/**
 * Cliente mínimo de Supabase Storage (REST) para subir comprobantes, mismo estilo
 * minimalista que `SupabaseAdminService` (fetch directo, sin `@supabase/supabase-js`).
 * Contraparte del `StorageService` de `apps/workers`, que solo descarga.
 */
@Injectable()
export class VoucherStorageService implements VoucherStorageUploader {
  private readonly base = `${env.SUPABASE_URL}/storage/v1/object`;
  private readonly headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };

  /** Sube los bytes de un comprobante al bucket privado `vouchers`. */
  async uploadVoucher(storagePath: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const res = await fetch(`${this.base}/${VOUCHER_STORAGE_BUCKET}/${storagePath}`, {
      method: "POST",
      headers: { ...this.headers, "content-type": contentType },
      body: bytes,
    });
    if (!res.ok) {
      // No se incluye el cuerpo de la respuesta en el error para no filtrar detalles
      // de infraestructura al cliente público.
      throw new InternalServerErrorException(
        `No se pudo subir el comprobante a Storage (${res.status})`,
      );
    }
  }
}
