import { err, ok, type Result } from "@check/shared";

import type { OcrProvider } from "../types.js";

/**
 * Subconjunto del cliente de `@google-cloud/vision` (`ImageAnnotatorClient`) que
 * este provider necesita. Permite inyectar un cliente fake en tests sin depender
 * del tipo real del SDK.
 */
export interface VisionClientLike {
  documentTextDetection(request: {
    image: { content: Uint8Array };
  }): Promise<[{ fullTextAnnotation?: { text?: string | null } | null }]>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Opciones de construcción del cliente Vision que este provider usa. */
interface VisionClientOptions {
  credentials?: { client_email: string; private_key: string };
  projectId?: string;
}

/** Forma mínima del módulo `@google-cloud/vision` que este provider consume. */
interface VisionModuleLike {
  ImageAnnotatorClient: new (opts?: VisionClientOptions) => VisionClientLike;
}

/** Carga real del SDK vía import dinámico (no acopla el build a la credencial). */
function loadVisionSdk(): Promise<VisionModuleLike> {
  return import("@google-cloud/vision") as unknown as Promise<VisionModuleLike>;
}

/**
 * Resuelve las opciones de credencial del cliente Vision.
 *
 * En hosts sin sistema de archivos persistente (p.ej. Railway) no se puede usar la
 * convención de `GOOGLE_APPLICATION_CREDENTIALS` apuntando a un archivo. Si está
 * `GCP_CREDENTIALS_B64` (el JSON de la service account en base64), se decodifica y se
 * pasan las credenciales en memoria. Si no está, se devuelve `undefined` para que el
 * SDK caiga a la convención estándar (ADC / `GOOGLE_APPLICATION_CREDENTIALS`).
 */
function clientOptionsFromEnv(): VisionClientOptions | undefined {
  const b64 = process.env.GCP_CREDENTIALS_B64;
  if (!b64) return undefined;
  const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as {
    client_email: string;
    private_key: string;
    project_id?: string;
  };
  return {
    credentials: { client_email: json.client_email, private_key: json.private_key },
    ...(json.project_id ? { projectId: json.project_id } : {}),
  };
}

/**
 * Integración con Google Cloud Vision (E05-T1): usa `documentTextDetection` para
 * extraer el texto plano de un comprobante (imagen/PDF como bytes).
 *
 * El SDK (`@google-cloud/vision`) se importa dinámicamente (`await import(...)`)
 * para no acoplar el build/tests del monorepo a la credencial de servicio. La
 * autenticación real la resuelve el SDK por convención estándar
 * (`GOOGLE_APPLICATION_CREDENTIALS` apuntando al JSON de la service account).
 *
 * Para tests: inyecta un `VisionClientLike` fake por el constructor (evita red real
 * y permite simular éxito/error de Vision), y/o un `loadSdk` fake para simular que
 * el import dinámico del SDK falla (sin credencial/paquete disponible).
 */
export class GoogleVisionProvider implements OcrProvider {
  private client: VisionClientLike | undefined;
  private readonly loadSdk: () => Promise<VisionModuleLike>;

  constructor(client?: VisionClientLike, loadSdk: () => Promise<VisionModuleLike> = loadVisionSdk) {
    this.client = client;
    this.loadSdk = loadSdk;
  }

  /** Resuelve el cliente inyectado o crea uno real vía import dinámico del SDK. */
  private async getClient(): Promise<Result<VisionClientLike>> {
    if (this.client) return ok(this.client);

    try {
      const { ImageAnnotatorClient } = await this.loadSdk();
      this.client = new ImageAnnotatorClient(clientOptionsFromEnv());
      return ok(this.client);
    } catch (error) {
      return err(
        `Google Vision no disponible: no se pudo cargar @google-cloud/vision (${errorMessage(error)}).`,
      );
    }
  }

  async recognize(input: Uint8Array): Promise<Result<string>> {
    const clientResult = await this.getClient();
    if (!clientResult.ok) return clientResult;

    try {
      const [response] = await clientResult.value.documentTextDetection({
        image: { content: input },
      });
      const text = response.fullTextAnnotation?.text;
      if (!text) {
        return err("Google Vision no detectó texto en el comprobante.");
      }
      return ok(text);
    } catch (error) {
      return err(`Google Vision falló al procesar el comprobante: ${errorMessage(error)}.`);
    }
  }
}

/**
 * Proveedor de OCR de prueba: devuelve un texto fijo. Útil para pruebas del pipeline
 * de extracción sin llamar a Vision.
 */
export class TextOcrProvider implements OcrProvider {
  constructor(private readonly text: string) {}
  async recognize(): Promise<Result<string>> {
    return ok(this.text);
  }
}
