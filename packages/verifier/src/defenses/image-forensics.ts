import exifr from "exifr";
import sharp from "sharp";

import { failSignal, notApplicableSignal, passSignal } from "../signal.js";
import type { Defense, DefenseInput, DefenseSignal } from "../types.js";

/** Identificador de esta defensa en `EvidenceSource`/`DefenseSignal`. */
export const IMAGE_FORENSICS_KIND = "image_forensics";

// --- Umbrales del heurístico (E06-T7) --------------------------------------
//
// Todos los valores de abajo fueron calibrados empíricamente contra imágenes
// sintéticas (ver `test/defenses/image-forensics.test.ts`), no contra un corpus
// forense real. Son deliberadamente conservadores (prefieren `pass` en la duda)
// porque D4 exige que la falta/ambigüedad de una señal técnica nunca hunda por
// sí sola un comprobante legítimo; ver limitaciones documentadas más abajo.

/** Calidad JPEG usada para la recompresión de control del ELA. Una calidad media
 * (ni muy alta ni muy baja) maximiza el contraste entre regiones con distinta
 * historia de compresión sin saturar el error en toda la imagen. */
const ELA_JPEG_QUALITY = 60;

/** Redimensiona antes de analizar: el heurístico es un promedio por bloques, no
 * necesita resolución completa y así se mantiene rápido/barato en el worker. */
const ELA_MAX_DIMENSION = 800;

/** Tamaño del grid usado para la comparación por bloques (localización del error). */
const ELA_GRID_CELLS = 8;

/** Un bloque cuyo error medio es esta cantidad de veces el error medio "típico"
 * (mediana de bloques) del resto de la imagen se considera un "hot spot" ELA:
 * señal clásica de una región pegada/editada con distinta historia de compresión. */
const ELA_LOCALIZATION_RATIO_THRESHOLD = 4;

/** Piso absoluto (escala 0–255 en gris) para el bloque de mayor error: evita que
 * imágenes casi perfectamente lisas (mediana ~0) disparen el ratio por ruido
 * insignificante que no representa manipulación real. */
const ELA_MIN_ABS_DIFF_FOR_LOCALIZATION = 2;

/** Software de edición conocido; su presencia en el campo EXIF `Software` es la
 * señal fuerte más directa de post-procesamiento manual del comprobante. */
const KNOWN_EDITING_SOFTWARE_PATTERN = /photoshop|gimp|affinity photo|paint\.net|lightroom|snapseed/i;

/** Proporción (lado largo / lado corto) por encima de la cual se considera atípica
 * para una captura de pantalla de app bancaria móvil (señal débil únicamente). */
const UNUSUAL_ASPECT_RATIO_THRESHOLD = 3;

/** Dimensión mínima (px) esperada para una captura legible de comprobante
 * (señal débil únicamente: no dispara `fail` por sí sola). */
const MIN_EXPECTED_DIMENSION = 200;

interface ElaAnalysis {
  readonly localizationRatio: number;
  readonly localized: boolean;
}

/**
 * Error Level Analysis pragmático (D-MVP): recomprime la imagen a una calidad
 * JPEG conocida y compara, en escala de grises y por bloques, el error de
 * recompresión contra sí misma. Una región con error desproporcionadamente
 * mayor al resto ("hot spot") sugiere que fue pegada/editada con una historia
 * de compresión distinta al resto de la imagen — la firma clásica de ELA.
 *
 * Limitaciones honestas (documentadas para no sobre-vender la técnica):
 * - Se analiza en escala de grises para evitar desalinear canales/espacios de
 *   color entre el decodificador original y el de la recompresión JPEG (que no
 *   preserva canal alfa ni siempre el mismo espacio de color); esto pierde
 *   señal de manipulaciones que solo alteran color/saturación sin afectar luminancia.
 * - No es un ELA forense de nivel académico (no analiza por cuantización DCT
 *   real ni detecta "double JPEG compression" mediante histogramas de
 *   coeficientes); es un proxy razonable para el MVP, reutilizado también como
 *   heurístico de doble compresión (mismo cálculo, mismo umbral) según lo
 *   acordado en el PRD de esta tarea.
 * - Umbrales fijos calibrados contra imágenes sintéticas de prueba; imágenes
 *   reales con ruido de cámara/compresión previa pueden requerir recalibración
 *   quality-por-quality en un ajuste post-MVP.
 */
async function computeElaAnalysis(imageBytes: Uint8Array): Promise<ElaAnalysis | undefined> {
  try {
    const base = sharp(imageBytes)
      .resize({
        width: ELA_MAX_DIMENSION,
        height: ELA_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .greyscale();

    const { data: originalRaw, info } = await base.clone().raw().toBuffer({ resolveWithObject: true });
    const recompressedJpeg = await base.clone().jpeg({ quality: ELA_JPEG_QUALITY }).toBuffer();
    const { data: recompressedRaw, info: recompressedInfo } = await sharp(recompressedJpeg)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.width !== recompressedInfo.width || info.height !== recompressedInfo.height) {
      // Recompresión produjo dimensiones distintas (no debería pasar en el flujo normal);
      // por seguridad no se arriesga un falso positivo/negativo, se reporta "sin análisis".
      return undefined;
    }

    const { width, height } = info;
    const pixelCount = width * height;
    const diff = new Float64Array(pixelCount);
    for (let i = 0; i < pixelCount; i += 1) {
      diff[i] = Math.abs((originalRaw[i] ?? 0) - (recompressedRaw[i] ?? 0));
    }

    const cellsX = Math.min(ELA_GRID_CELLS, width);
    const cellsY = Math.min(ELA_GRID_CELLS, height);
    const blockWidth = Math.max(1, Math.floor(width / cellsX));
    const blockHeight = Math.max(1, Math.floor(height / cellsY));
    const blockMeans: number[] = [];

    for (let blockY = 0; blockY < height; blockY += blockHeight) {
      for (let blockX = 0; blockX < width; blockX += blockWidth) {
        const maxY = Math.min(blockY + blockHeight, height);
        const maxX = Math.min(blockX + blockWidth, width);
        let sum = 0;
        let count = 0;
        for (let y = blockY; y < maxY; y += 1) {
          for (let x = blockX; x < maxX; x += 1) {
            sum += diff[y * width + x] ?? 0;
            count += 1;
          }
        }
        if (count > 0) {
          blockMeans.push(sum / count);
        }
      }
    }

    const sortedBlockMeans = [...blockMeans].sort((a, b) => a - b);
    const median = sortedBlockMeans[Math.floor(sortedBlockMeans.length / 2)] ?? 0;
    const max = sortedBlockMeans[sortedBlockMeans.length - 1] ?? 0;
    const localizationRatio = max / Math.max(median, 1);
    const localized =
      max >= ELA_MIN_ABS_DIFF_FOR_LOCALIZATION && localizationRatio >= ELA_LOCALIZATION_RATIO_THRESHOLD;

    return { localizationRatio, localized };
  } catch {
    // Formato no decodificable por sharp, imagen corrupta, etc.: no se arriesga
    // un veredicto sobre un dato que no se pudo analizar.
    return undefined;
  }
}

interface ExifAnalysis {
  readonly editingSoftware?: string;
  /** `true` si el formato normalmente trae EXIF (jpeg/tiff) y no se encontró ninguno. */
  readonly missing: boolean;
}

/**
 * Lee metadata EXIF con `exifr` y busca dos cosas: presencia de software de
 * edición conocido en el campo `Software` (señal fuerte), y ausencia total de
 * EXIF en un formato que normalmente lo trae (señal débil — muchas capturas de
 * pantalla legítimas de apps bancarias tampoco tienen EXIF de cámara, así que
 * esto nunca dispara `fail` por sí solo).
 */
async function analyzeExif(imageBytes: Uint8Array, format: string | undefined): Promise<ExifAnalysis> {
  try {
    const metadata: unknown = await exifr.parse(Buffer.from(imageBytes));
    if (!metadata || typeof metadata !== "object") {
      return { missing: format === "jpeg" || format === "tiff" };
    }
    const software = (metadata as Record<string, unknown>).Software;
    if (typeof software === "string" && KNOWN_EDITING_SOFTWARE_PATTERN.test(software)) {
      return { editingSoftware: software, missing: false };
    }
    return { missing: false };
  } catch {
    return { missing: false };
  }
}

/** `true` si la proporción es marcadamente distinta a la típica de una captura móvil. */
function hasUnusualAspectRatio(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) {
    return false;
  }
  const longer = Math.max(width, height);
  const shorter = Math.min(width, height);
  return longer / shorter > UNUSUAL_ASPECT_RATIO_THRESHOLD;
}

/**
 * Defensa 5 (E06-T7) — análisis técnico de imagen: ELA, EXIF, doble compresión
 * (proxy vía ELA) y resolución/proporción, usando `sharp` + `exifr`.
 *
 * Regla de combinación (una sola `DefenseSignal`, sin ponderación multi-señal
 * en este MVP): cualquier señal **fuerte** (software de edición en EXIF, o
 * "hot spot" ELA localizado) dispara `fail`. Las señales **débiles**
 * (EXIF ausente, proporción/resolución atípica) solo se anotan en `detail` y
 * bajan levemente el `weight` de un `pass`, nunca cambian el `outcome` — D4:
 * un dato ambiguo o simplemente inusual no penaliza por sí solo.
 *
 * Sin `input.imageBytes` (comprobante en PDF/texto sin imagen adjunta, o
 * bytes no propagados por el llamador) → `not_applicable`, nunca `fail`.
 */
export const imageForensicsDefense: Defense = {
  kind: IMAGE_FORENSICS_KIND,

  async evaluate(input: DefenseInput): Promise<DefenseSignal> {
    const { imageBytes } = input;
    if (!imageBytes || imageBytes.length === 0) {
      return notApplicableSignal(IMAGE_FORENSICS_KIND, {
        detail: "no se recibieron los bytes de la imagen del comprobante",
      });
    }

    let format: string | undefined;
    let width: number | undefined;
    let height: number | undefined;
    try {
      const metadata = await sharp(imageBytes).metadata();
      format = metadata.format;
      width = metadata.width;
      height = metadata.height;
    } catch {
      return notApplicableSignal(IMAGE_FORENSICS_KIND, {
        detail: "no se pudo leer la imagen del comprobante (formato no soportado o corrupta)",
      });
    }

    const [ela, exif] = await Promise.all([computeElaAnalysis(imageBytes), analyzeExif(imageBytes, format)]);

    const strongReasons: string[] = [];
    if (exif.editingSoftware !== undefined) {
      strongReasons.push(`metadata EXIF indica edición con "${exif.editingSoftware}"`);
    }
    if (ela?.localized) {
      strongReasons.push(
        `patrón de recompresión localizado (ELA/doble compresión, ratio ${ela.localizationRatio.toFixed(1)}x sobre el resto de la imagen)`,
      );
    }

    if (strongReasons.length > 0) {
      return failSignal(IMAGE_FORENSICS_KIND, {
        detail: `posible manipulación de imagen: ${strongReasons.join("; ")}`,
      });
    }

    const weakReasons: string[] = [];
    if (exif.missing) {
      weakReasons.push("sin metadata EXIF (señal débil, común también en capturas de pantalla legítimas)");
    }
    if (width !== undefined && height !== undefined) {
      if (hasUnusualAspectRatio(width, height)) {
        weakReasons.push("proporción de imagen atípica para una captura de comprobante");
      }
      if (width < MIN_EXPECTED_DIMENSION || height < MIN_EXPECTED_DIMENSION) {
        weakReasons.push("resolución baja para un comprobante típico");
      }
    }

    return passSignal(IMAGE_FORENSICS_KIND, {
      weight: weakReasons.length > 0 ? 0.6 : 1,
      ...(weakReasons.length > 0 ? { detail: weakReasons.join("; ") } : {}),
    });
  },
};
