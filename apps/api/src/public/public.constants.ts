/**
 * Constantes de los endpoints públicos de la PWA de fallback (Épica 9).
 *
 * Los nombres de cola/job y el bucket de Storage son CONTRATO con `apps/workers`
 * (E05-T3: `apps/workers/src/ocr/ocr.constants.ts` y `storage.service.ts`).
 * Si cambian allá, deben cambiar acá.
 */

/** Nombre de la cola BullMQ de OCR de comprobantes (consumida por apps/workers). */
export const OCR_QUEUE_NAME = "ocr-processing";

/** Nombre del job dentro de la cola de OCR. */
export const OCR_JOB_NAME = "ocr";

/** Bucket privado de Supabase Storage donde viven los comprobantes.
 * `Voucher.storagePath` es la ruta del objeto dentro de este bucket (sin prefijo). */
export const VOUCHER_STORAGE_BUCKET = "vouchers";

/** Token de inyección Nest para el uploader de comprobantes a Storage. */
export const VOUCHER_STORAGE_UPLOADER = Symbol("VOUCHER_STORAGE_UPLOADER");

/** Token de inyección Nest para el productor de jobs de OCR. */
export const OCR_ENQUEUER = Symbol("OCR_ENQUEUER");

/** Tipos MIME aceptados en la ingesta pública → extensión del objeto en Storage. */
export const ALLOWED_VOUCHER_MIME_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Tamaño máximo del comprobante subido: 10 MB. */
export const MAX_VOUCHER_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Rate limiting anti-abuso de los endpoints públicos (E09-T7). Ventana de 1 min.
 * Calibrado para NO estorbar el uso legítimo: un cliente sube 1-3 comprobantes y
 * el polling corre cada ~2.5 s durante ≤2 min (≈48 requests/2 min por voucher).
 *
 * Se separan dos dimensiones para la ingesta: por IP (frena un flood desde una
 * sola máquina) y por negocio (`opaqueId`, frena un flood distribuido contra un
 * mismo enlace). El polling se limita solo por IP, generoso, porque su volumen
 * legítimo es alto y predecible.
 *
 * Los nombres son los `name` de los throttlers registrados en `ThrottlerModule`
 * (ver `public.module.ts`) y referenciados por `@Throttle` en el controlador.
 */
export const PUBLIC_THROTTLE_TTL_MS = 60_000;

export const PUBLIC_RATE_LIMITS = {
  /** Ingesta por IP: 10/min. */
  ingestPerIp: { name: "public-ingest-ip", limit: 10 },
  /** Ingesta por negocio (opaqueId): 30/min. */
  ingestPerBusiness: { name: "public-ingest-business", limit: 30 },
  /** Polling del estado por IP: 60/min. */
  pollPerIp: { name: "public-poll-ip", limit: 60 },
} as const;
