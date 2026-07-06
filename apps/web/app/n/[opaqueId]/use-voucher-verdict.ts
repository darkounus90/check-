"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getVoucherStatus,
  isImageProblemStatus,
  type VoucherOcrStatus,
  type VoucherVerdict,
} from "@/lib/public-api";

// Polling del veredicto (E09-T5): consulta cada ~2.5s con backoff suave
// (x1.25 por ciclo, tope 10s) hasta resolver o agotar 2 minutos en total.
const INITIAL_DELAY_MS = 2500;
const BACKOFF_FACTOR = 1.25;
const MAX_DELAY_MS = 10_000;
const MAX_TOTAL_MS = 120_000;

export type VoucherVerdictState = {
  /** Último veredicto conocido; `null` hasta la primera respuesta. */
  verdict: VoucherVerdict | null;
  /**
   * Último `ocrStatus` conocido; `null` hasta la primera respuesta. La vista lo
   * usa para pedir mejor foto cuando el OCR falla (LOW_QUALITY/FAILED, E09-T6).
   */
  ocrStatus: VoucherOcrStatus | null;
  /** `true` si se agotó la ventana de polling sin veredicto final. */
  timedOut: boolean;
  /** Reinicia la ventana de polling (botón "Seguir verificando"). */
  restart: () => void;
};

/**
 * Hace polling de `GET /public/vouchers/:voucherId` hasta que el veredicto
 * resuelva (VERIFIED/SUSPICIOUS) o se agote la ventana de tiempo. Detiene el
 * polling al resolver y limpia el timer al desmontar. Los errores de red
 * durante el polling se tratan como transitorios: se reintenta en el
 * siguiente ciclo sin loguear nada (el voucherId no debe filtrarse — D3).
 */
export function useVoucherVerdict(voucherId: string | null): VoucherVerdictState {
  const [verdict, setVerdict] = useState<VoucherVerdict | null>(null);
  const [ocrStatus, setOcrStatus] = useState<VoucherOcrStatus | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [pollingRun, setPollingRun] = useState(0);

  const restart = useCallback(() => {
    setTimedOut(false);
    setPollingRun((run) => run + 1);
  }, []);

  useEffect(() => {
    if (!voucherId) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delayMs = INITIAL_DELAY_MS;
    const startedAt = Date.now();

    const poll = async (): Promise<void> => {
      if (cancelled) {
        return;
      }

      try {
        const status = await getVoucherStatus(voucherId);
        if (cancelled) {
          return;
        }
        setOcrStatus(status.ocrStatus);
        // Falla de imagen (foto ilegible / no reconocida / PDF): detener el
        // polling y dejar que la vista pida una mejor foto (E09-T6). No es un
        // 🚨: el pago no se marcó sospechoso, solo no se pudo leer.
        if (isImageProblemStatus(status.ocrStatus)) {
          return;
        }
        if (status.verdict === "VERIFIED" || status.verdict === "SUSPICIOUS") {
          // Veredicto final: detener el polling.
          setVerdict(status.verdict);
          return;
        }
        // PENDING o veredicto aún nulo: sigue en verificación.
        setVerdict("PENDING");
      } catch {
        // Error transitorio (red caída, 5xx): se reintenta en el siguiente
        // ciclo. Silencioso a propósito: no logueamos nada asociado al
        // voucherId (D3). Los estados de error finos son E09-T6.
      }

      if (cancelled) {
        return;
      }

      if (Date.now() - startedAt >= MAX_TOTAL_MS) {
        setTimedOut(true);
        return;
      }

      timer = setTimeout(() => {
        void poll();
      }, delayMs);
      delayMs = Math.min(delayMs * BACKOFF_FACTOR, MAX_DELAY_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [voucherId, pollingRun]);

  return { verdict, ocrStatus, timedOut, restart };
}
