import sharp from "sharp";

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
