"use client";

import { Camera, FileText, ImageUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ACCEPTED_VOUCHER_MIME_TYPES,
  isImageProblemStatus,
  PublicApiError,
  uploadVoucher,
  validateVoucherFile,
} from "@/lib/public-api";

import { useVoucherVerdict } from "./use-voucher-verdict";

// Flujo público de comprobante (E09-T3 + E09-T5): capturar/elegir archivo,
// validarlo en cliente, subirlo con progreso y mostrar el semáforo en vivo
// en la misma pantalla. Mobile-first: botones grandes, textos simples.
//
// D3: ni el opaqueId ni el voucherId se loguean en consola/analytics.

type VoucherFlowProps = {
  opaqueId: string;
  businessName: string;
};

type UploadPhase = "idle" | "uploading" | "error" | "done";

const IMAGE_MIME_TYPES = ACCEPTED_VOUCHER_MIME_TYPES.filter((type) =>
  type.startsWith("image/"),
).join(",");

const ALL_ACCEPTED_MIME_TYPES = ACCEPTED_VOUCHER_MIME_TYPES.join(",");

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function VoucherFlow({ opaqueId, businessName }: VoucherFlowProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [voucherId, setVoucherId] = useState<string | null>(null);

  const { verdict, ocrStatus, timedOut, restart } = useVoucherVerdict(voucherId);

  // Preview solo para imágenes; los PDF muestran una tarjeta con el nombre.
  // El object URL se revoca al cambiar de archivo o desmontar.
  useEffect(() => {
    if (!selectedFile || !selectedFile.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedFile]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // Permite volver a elegir el mismo archivo tras un error.
    event.target.value = "";

    if (!file) {
      return;
    }

    const error = validateVoucherFile(file);
    if (error) {
      setSelectedFile(null);
      setValidationError(error);
      return;
    }

    setValidationError(null);
    setUploadError(null);
    setPhase("idle");
    setProgress(0);
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile || phase === "uploading") {
      return;
    }

    setPhase("uploading");
    setProgress(0);
    setUploadError(null);

    try {
      const result = await uploadVoucher(opaqueId, selectedFile, {
        onProgress: setProgress,
      });
      setVoucherId(result.voucherId);
      setPhase("done");
    } catch (error) {
      setPhase("error");
      setUploadError(
        error instanceof PublicApiError
          ? error.message
          : "No pudimos subir tu comprobante. Intenta de nuevo.",
      );
    }
  }

  function handleChangeFile() {
    setSelectedFile(null);
    setValidationError(null);
    setUploadError(null);
    setPhase("idle");
    setProgress(0);
  }

  // Reintento tras una foto ilegible (E09-T6): vuelve a la pantalla de captura
  // SIN recargar. Limpia el voucherId para que el hook de polling se detenga y
  // se reinicie con la próxima subida.
  function handleRetakePhoto() {
    setVoucherId(null);
    setSelectedFile(null);
    setValidationError(null);
    setUploadError(null);
    setPhase("idle");
    setProgress(0);
  }

  // ── Vista de resultado en vivo (E09-T5) ─────────────────────────────
  if (phase === "done" && voucherId) {
    // Foto ilegible / no reconocida / PDF no soportado (E09-T6): NO es un 🚨
    // (el pago no se marcó sospechoso, solo no se pudo leer). Pedir mejor foto
    // con reintento sin recargar. Tiene prioridad sobre el estado 🟡 pendiente.
    const needsBetterPhoto = ocrStatus !== null && isImageProblemStatus(ocrStatus);

    return (
      <section aria-live="polite" className="w-full">
        {needsBetterPhoto ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8">
            <p className="text-5xl" aria-hidden="true">
              📷
            </p>
            <h2 className="mt-4 text-xl font-semibold text-amber-800">
              La foto no se ve bien
            </h2>
            <p className="mt-2 text-sm text-amber-700">
              No pudimos leer el comprobante. Toma otra foto más clara, con buena luz y que se vea
              completo. Por ahora aceptamos fotos; si subiste un PDF, tómale una foto a la pantalla.
            </p>
            <Button size="lg" className="mt-6 w-full" onClick={handleRetakePhoto}>
              Tomar otra foto
            </Button>
          </div>
        ) : verdict === "VERIFIED" ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-8">
            <p className="text-5xl" aria-hidden="true">
              🟢
            </p>
            <h2 className="mt-4 text-xl font-semibold text-green-800">
              Pago verificado — puedes entregar
            </h2>
            <p className="mt-2 text-sm text-green-700">
              El comprobante coincide con un pago real recibido por {businessName}.
            </p>
          </div>
        ) : verdict === "SUSPICIOUS" ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8">
            <p className="text-5xl" aria-hidden="true">
              🚨
            </p>
            <h2 className="mt-4 text-xl font-semibold text-red-800">
              No entregues — no pudimos verificar este pago
            </h2>
            <p className="mt-2 text-sm text-red-700">
              Este comprobante no coincide con un pago recibido. Confirma directamente con{" "}
              {businessName} antes de entregar.
            </p>
          </div>
        ) : timedOut ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8">
            <p className="text-5xl" aria-hidden="true">
              🟡
            </p>
            <h2 className="mt-4 text-xl font-semibold text-amber-800">
              La verificación está tardando más de lo normal
            </h2>
            <p className="mt-2 text-sm text-amber-700">
              Tu comprobante ya fue recibido y sigue en proceso. Puedes seguir esperando el
              resultado aquí.
            </p>
            <Button size="lg" className="mt-6 w-full" onClick={restart}>
              Seguir verificando
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8">
            <p className="animate-pulse text-5xl" aria-hidden="true">
              🟡
            </p>
            <h2 className="mt-4 text-xl font-semibold text-amber-800">Verificando…</h2>
            <p className="mt-2 text-sm text-amber-700">
              Estamos revisando tu comprobante. Esto suele tardar unos segundos; no cierres esta
              pantalla.
            </p>
          </div>
        )}
      </section>
    );
  }

  // ── Captura / selección y subida (E09-T3) ───────────────────────────
  return (
    <section className="flex w-full flex-col gap-4 text-left">
      {/* Inputs ocultos: cámara trasera y selector de archivo (imagen/PDF). */}
      <input
        ref={cameraInputRef}
        type="file"
        accept={IMAGE_MIME_TYPES}
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={ALL_ACCEPTED_MIME_TYPES}
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {!selectedFile ? (
        <>
          <Button
            size="lg"
            className="h-14 w-full gap-2 text-base"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
            Tomar foto del comprobante
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 w-full gap-2 text-base"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageUp className="h-5 w-5" aria-hidden="true" />
            Elegir foto o PDF
          </Button>
          <p className="text-center text-xs text-slate-500">
            Formatos aceptados: JPG, PNG, WebP o PDF. Máximo 10 MB.
          </p>
          {/* Aviso de privacidad / consentimiento (Épica 12, E12-T5): el titular VE el aviso
              antes de enviar; enviar implica aceptar el tratamiento (habeas data, Ley 1581/2012).
              Tus datos se guardan cifrados y por el tiempo necesario para verificar el pago. */}
          <p className="text-center text-[11px] leading-relaxed text-slate-400">
            🔒 Al enviar tu comprobante aceptas que {businessName} trate tus datos con la finalidad
            de verificar el pago y prevenir fraude. Se almacenan cifrados y por el tiempo necesario.
            Puedes ejercer tus derechos de acceso y eliminación (habeas data, Ley 1581 de 2012).
          </p>
          {validationError ? (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {validationError}
            </p>
          ) : null}
        </>
      ) : (
        <>
          {/* Preview del archivo elegido */}
          {previewUrl ? (
            // Preview local vía object URL: next/image no aplica aquí.
            <img
              src={previewUrl}
              alt="Vista previa del comprobante seleccionado"
              className="max-h-72 w-full rounded-xl border border-slate-200 object-contain"
            />
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
              <FileText className="h-8 w-8 shrink-0 text-slate-500" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">PDF · {formatFileSize(selectedFile.size)}</p>
              </div>
            </div>
          )}

          {phase === "uploading" ? (
            <div className="flex flex-col gap-2" aria-live="polite">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
              >
                <div
                  className="h-full rounded-full bg-slate-900 transition-[width] duration-200"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="text-center text-sm text-slate-600">
                Subiendo comprobante… {Math.round(progress * 100)}%
              </p>
            </div>
          ) : (
            <>
              {uploadError ? (
                <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {uploadError}
                </p>
              ) : null}
              <Button
                size="lg"
                className="h-14 w-full text-base"
                onClick={() => void handleUpload()}
              >
                {phase === "error" ? "Reintentar" : "Enviar comprobante"}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 w-full text-base"
                onClick={handleChangeFile}
              >
                Cambiar archivo
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
