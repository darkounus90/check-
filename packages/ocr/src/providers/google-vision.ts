import { err, type Result } from "@check/shared";

import type { OcrProvider } from "../types.js";

/**
 * Punto de integración de Google Cloud Vision (E05-T1).
 *
 * Para activarlo en producción:
 *   1. `pnpm --filter @check/ocr add @google-cloud/vision`
 *   2. Configura `GOOGLE_APPLICATION_CREDENTIALS` (JSON de service account).
 *   3. Implementa `recognize` con `documentTextDetection` (import dinámico del SDK).
 *
 * Se deja como placeholder para no acoplar la credencial/SDK al build del MVP.
 */
export class GoogleVisionProvider implements OcrProvider {
  async recognize(_input: Uint8Array): Promise<Result<string>> {
    return err(
      "Google Vision no configurado (E05-T1): instala @google-cloud/vision y credenciales.",
    );
  }
}

/**
 * Proveedor de OCR de prueba: devuelve un texto fijo. Útil para pruebas del pipeline
 * de extracción sin llamar a Vision.
 */
export class TextOcrProvider implements OcrProvider {
  constructor(private readonly text: string) {}
  async recognize(): Promise<Result<string>> {
    const { ok } = await import("@check/shared");
    return ok(this.text);
  }
}
