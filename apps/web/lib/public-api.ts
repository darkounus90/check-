// Cliente tipado del API público de CHECK (rutas /public de apps/api).
//
// Todas las llamadas del flujo público sin login (E09-T3/E09-T5) pasan por
// este módulo para que un ajuste posterior del contrato sea un cambio de un
// solo archivo.
//
// Importante (decisión D3): el opaqueId y el voucherId son identificadores
// no enumerables; NUNCA se loguean en consola ni analytics desde este módulo
// ni desde sus consumidores.

/** Tamaño máximo aceptado para un comprobante (10 MB). */
export const MAX_VOUCHER_SIZE_BYTES = 10 * 1024 * 1024;

/** Tipos MIME aceptados para el comprobante (imagen o PDF). */
export const ACCEPTED_VOUCHER_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type AcceptedVoucherMimeType = (typeof ACCEPTED_VOUCHER_MIME_TYPES)[number];

/** Respuesta de `GET /public/n/:opaqueId`. */
export type PublicBusiness = {
  name: string;
};

/** Veredicto del semáforo de verificación. */
export type VoucherVerdict = "PENDING" | "VERIFIED" | "SUSPICIOUS";

/**
 * Estado del OCR del comprobante (enum `OcrStatus` de Prisma). La PWA lo usa
 * para distinguir un comprobante ilegible/no reconocido (pedir mejor foto,
 * E09-T6) de uno que sigue en proceso.
 */
export type VoucherOcrStatus = "PENDING" | "PROCESSED" | "LOW_QUALITY" | "FAILED";

/**
 * Estados de OCR que son fallas de imagen: no vale la pena seguir polleando, el
 * cliente debe subir una foto mejor (E09-T6). `LOW_QUALITY` = foto ilegible;
 * `FAILED` = comprobante no reconocido (incluye el PDF, que el pipeline aún no
 * soporta y el worker marca `LOW_QUALITY`).
 */
export const RETRYABLE_OCR_STATUSES = ["LOW_QUALITY", "FAILED"] as const;

export function isImageProblemStatus(ocrStatus: string): boolean {
  return (RETRYABLE_OCR_STATUSES as readonly string[]).includes(ocrStatus);
}

/** Respuesta de `GET /public/vouchers/:voucherId`. */
export type VoucherStatus = {
  ocrStatus: VoucherOcrStatus;
  verdict: VoucherVerdict | null;
};

/** Respuesta de `POST /public/n/:opaqueId/vouchers`. */
export type VoucherUploadResult = {
  voucherId: string;
};

/**
 * Error tipado del API público. `status` es el código HTTP de la respuesta,
 * o `null` si fue un fallo de red (sin respuesta del servidor).
 */
export class PublicApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "PublicApiError";
    this.status = status;
  }
}

// NEXT_PUBLIC_API_URL se inyecta en build (cliente) y en runtime (servidor).
// Default de desarrollo: puerto 3001 (ver apps/api/src/env.ts).
function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

/**
 * Valida tipo y tamaño de un archivo EN CLIENTE antes de subirlo.
 * Devuelve un mensaje de error listo para mostrar, o `null` si es válido.
 */
export function validateVoucherFile(file: File): string | null {
  const isAcceptedType = (ACCEPTED_VOUCHER_MIME_TYPES as readonly string[]).includes(file.type);

  if (!isAcceptedType) {
    return "Ese tipo de archivo no está permitido. Sube una foto (JPG, PNG o WebP) o un PDF.";
  }

  if (file.size > MAX_VOUCHER_SIZE_BYTES) {
    return "El archivo es muy pesado. El tamaño máximo es 10 MB.";
  }

  return null;
}

/**
 * `GET /public/n/:opaqueId` — datos públicos del negocio dueño del enlace.
 * Devuelve `null` si el enlace no existe (404), sin filtrar más detalles.
 * Pensado para usarse server-side desde la página pública.
 */
export async function getPublicBusiness(opaqueId: string): Promise<PublicBusiness | null> {
  const response = await fetch(`${apiBaseUrl()}/public/n/${encodeURIComponent(opaqueId)}`, {
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new PublicApiError("No se pudo cargar la información del negocio.", response.status);
  }

  return (await response.json()) as PublicBusiness;
}

export type UploadVoucherOptions = {
  /** Progreso de subida, entre 0 y 1. */
  onProgress?: (fraction: number) => void;
};

function uploadErrorMessage(status: number): string {
  switch (status) {
    case 404:
      return "Este enlace no es válido.";
    case 413:
      return "El archivo es muy pesado. El tamaño máximo es 10 MB.";
    case 415:
      return "Ese tipo de archivo no está permitido. Sube una foto (JPG, PNG o WebP) o un PDF.";
    default:
      return "No pudimos recibir tu comprobante. Intenta de nuevo.";
  }
}

/**
 * `POST /public/n/:opaqueId/vouchers` — sube el comprobante como
 * multipart/form-data (campo `file`). Usa XMLHttpRequest para poder reportar
 * el progreso de subida (fetch aún no lo expone de forma amplia).
 */
export function uploadVoucher(
  opaqueId: string,
  file: File,
  options: UploadVoucherOptions = {},
): Promise<VoucherUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("POST", `${apiBaseUrl()}/public/n/${encodeURIComponent(opaqueId)}/vouchers`);
    xhr.responseType = "json";

    const { onProgress } = options;
    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(event.loaded / event.total);
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status === 201) {
        const body = xhr.response as { voucherId?: unknown } | null;
        if (body && typeof body.voucherId === "string") {
          resolve({ voucherId: body.voucherId });
          return;
        }
        reject(
          new PublicApiError("Respuesta inesperada del servidor. Intenta de nuevo.", xhr.status),
        );
        return;
      }
      reject(new PublicApiError(uploadErrorMessage(xhr.status), xhr.status));
    });

    xhr.addEventListener("error", () => {
      reject(new PublicApiError("Sin conexión. Revisa tu internet e intenta de nuevo.", null));
    });

    xhr.addEventListener("abort", () => {
      reject(new PublicApiError("La subida se canceló. Intenta de nuevo.", null));
    });

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

/**
 * `GET /public/vouchers/:voucherId` — estado de procesamiento y veredicto
 * del comprobante. Usado por el polling del resultado en vivo (E09-T5).
 */
export async function getVoucherStatus(voucherId: string): Promise<VoucherStatus> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl()}/public/vouchers/${encodeURIComponent(voucherId)}`, {
      cache: "no-store",
    });
  } catch {
    throw new PublicApiError("Sin conexión. Revisa tu internet.", null);
  }

  if (!response.ok) {
    throw new PublicApiError("No se pudo consultar el estado del comprobante.", response.status);
  }

  return (await response.json()) as VoucherStatus;
}
