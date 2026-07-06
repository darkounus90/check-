"use client";

import { Camera, FileText, ImageUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ACCEPTED_VOUCHER_MIME_TYPES,
  PublicApiError,
  uploadVoucherAuthenticated,
  validateVoucherFile,
} from "@/lib/public-api";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Subida de comprobante desde el dashboard autenticado (E10-T3 + gap #9).
 *
 * Sube por el endpoint AUTENTICADO `POST /vouchers`: el negocio del cajero se resuelve
 * server-side por el JWT (no por opaqueId), así el operador no necesita configurar nada. El
 * access token de Supabase se lee del cliente de navegador (mismas cookies que la sesión).
 * Al terminar, notifica al padre para que refetch-ee el estado en vivo, sin recargar.
 */

type Phase = "idle" | "uploading" | "error";

const IMAGE_MIME_TYPES = ACCEPTED_VOUCHER_MIME_TYPES.filter((t) => t.startsWith("image/")).join(",");
const ALL_ACCEPTED_MIME_TYPES = ACCEPTED_VOUCHER_MIME_TYPES.join(",");

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function UploadVoucher({
  onUploaded,
}: {
  onUploaded: () => void;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!selectedFile || !selectedFile.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    const error = validateVoucherFile(file);
    if (error) {
      setSelectedFile(null);
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setUploadError(null);
    setSuccess(false);
    setPhase("idle");
    setProgress(0);
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile || phase === "uploading") return;
    setPhase("uploading");
    setProgress(0);
    setUploadError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new PublicApiError("Tu sesión expiró. Vuelve a iniciar sesión.", 401);
      }
      await uploadVoucherAuthenticated(accessToken, selectedFile, { onProgress: setProgress });
      setPhase("idle");
      setSelectedFile(null);
      setProgress(0);
      setSuccess(true);
      onUploaded();
    } catch (error) {
      setPhase("error");
      setUploadError(
        error instanceof PublicApiError
          ? error.message
          : "No pudimos subir tu comprobante. Intenta de nuevo.",
      );
    }
  }

  function handleClear() {
    setSelectedFile(null);
    setValidationError(null);
    setUploadError(null);
    setPhase("idle");
    setProgress(0);
  }

  return (
    <section className="flex w-full flex-col gap-4">
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

      {success ? (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-700">
          Comprobante enviado. Sigue su verificación abajo.
        </p>
      ) : null}

      {!selectedFile ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            className="h-14 flex-1 gap-2 text-base"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
            Tomar foto
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 flex-1 gap-2 text-base"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageUp className="h-5 w-5" aria-hidden="true" />
            Elegir foto o PDF
          </Button>
        </div>
      ) : (
        <>
          {previewUrl ? (
            // Preview local vía object URL: next/image no aplica aquí.
            <img
              src={previewUrl}
              alt="Vista previa del comprobante seleccionado"
              className="max-h-64 w-full rounded-xl border border-slate-200 object-contain"
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
                Subiendo… {Math.round(progress * 100)}%
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {uploadError ? (
                <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {uploadError}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="lg"
                  className="h-12 flex-1 text-base"
                  onClick={() => void handleUpload()}
                >
                  {phase === "error" ? "Reintentar" : "Enviar comprobante"}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 flex-1 text-base"
                  onClick={handleClear}
                >
                  Cambiar archivo
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-slate-500">
        Formatos aceptados: JPG, PNG, WebP o PDF. Máximo 10 MB.
      </p>
      {validationError ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {validationError}
        </p>
      ) : null}
    </section>
  );
}
