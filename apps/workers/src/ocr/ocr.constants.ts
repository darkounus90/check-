/** Nombre de la cola BullMQ de OCR de comprobantes (E05-T3). */
export const OCR_QUEUE_NAME = "ocr-processing";

/** Nombre del job dentro de la cola de OCR. */
export const OCR_JOB_NAME = "ocr";

/** Token de inyección Nest para el `OcrProvider` (Google Vision en producción). */
export const OCR_PROVIDER = Symbol("OCR_PROVIDER");

/** Token de inyección Nest para el descargador de imágenes de Storage. */
export const VOUCHER_IMAGE_DOWNLOADER = Symbol("VOUCHER_IMAGE_DOWNLOADER");

/** Token de inyección Nest para la función de normalización de imagen (sharp). */
export const NORMALIZE_IMAGE = Symbol("NORMALIZE_IMAGE");

/** Token de inyección Nest para encolar la verificación antifraude (E06-T12) al
 * terminar el OCR con éxito. Ver `ocr.service.ts`/`ocr.module.ts`. */
export const VERIFICATION_ENQUEUER = Symbol("VERIFICATION_ENQUEUER");
