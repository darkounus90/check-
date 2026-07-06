import sharp from "sharp";

/**
 * El pipeline de normalización (sharp) SOLO maneja imágenes rasterizadas
 * (JPG/PNG/WebP). Un PDF no tiene ruta de normalización todavía (E09-T6): si
 * entra a `normalizeImage` sharp lanza y el job agota reintentos, dejando el
 * `Voucher` colgado en `PENDING` para siempre. Detectarlo ANTES permite marcarlo
 * `LOW_QUALITY` con un mensaje accionable ("por ahora solo aceptamos fotos") en
 * vez de colgarse. Cuando exista soporte real de PDF, esta guarda desaparece.
 */
export function isUnsupportedByOcrPipeline(storagePath: string): boolean {
  return storagePath.toLowerCase().endsWith(".pdf");
}

/**
 * Normaliza una imagen antes del OCR (E05-T2): auto-orienta por EXIF, limita el
 * tamaño máximo y estandariza a PNG. Acepta JPG/PNG/WebP (para PDF va otra ruta).
 */
export async function normalizeImage(input: Uint8Array): Promise<Uint8Array> {
  const out = await sharp(input)
    .rotate() // respeta la orientación EXIF
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  return new Uint8Array(out);
}
