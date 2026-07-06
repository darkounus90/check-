/**
 * Rastreador de fallos de parseo por ventana (Épica 11, E11-T4).
 *
 * Acumula resultados de parseo (reconocido / no reconocido, con etiqueta de banco) y, cada
 * `windowSize` resultados, cierra la ventana y evalúa si la tasa de "no reconocido" supera el
 * umbral → construye un `AlertEvent` (o `null`). Es puro salvo por el estado acumulado; no
 * hace I/O. El consumidor (api/workers) despacha el evento devuelto.
 *
 * Mantener esto compartido evita duplicar la lógica entre correos bancarios (api) y
 * comprobantes OCR (workers), que sufren el mismo problema: un banco cambia su formato y el
 * parser/extractor deja de matchear en masa.
 */

import { evaluateParserFailure, type ParserAlertThresholds } from "./alert-triggers.js";
import type { AlertEvent } from "./alerts.js";

export interface ParserFailureTrackerOptions {
  /** Fuente de la tanda: correos bancarios o comprobantes OCR. */
  readonly source: "bank_email" | "voucher_ocr";
  /** Tamaño de la ventana antes de evaluar (por defecto 20). */
  readonly windowSize?: number;
  readonly thresholds?: ParserAlertThresholds;
}

export class ParserFailureTracker {
  private readonly source: "bank_email" | "voucher_ocr";
  private readonly windowSize: number;
  private readonly thresholds: ParserAlertThresholds;

  private total = 0;
  private unrecognized = 0;
  private byBank = new Map<string, number>();

  constructor(options: ParserFailureTrackerOptions) {
    this.source = options.source;
    this.windowSize = options.windowSize ?? 20;
    this.thresholds = options.thresholds ?? {};
  }

  /**
   * Registra un resultado de parseo. `bank` es la etiqueta detectada (o `"desconocido"` si el
   * parser no reconoció ni el banco). Devuelve un `AlertEvent` cuando la ventana se cierra y
   * supera el umbral; `null` en caso contrario. Al cerrar ventana, resetea los contadores.
   */
  record(recognized: boolean, bank: string): AlertEvent | null {
    this.total += 1;
    if (!recognized) {
      this.unrecognized += 1;
      this.byBank.set(bank, (this.byBank.get(bank) ?? 0) + 1);
    }
    if (this.total < this.windowSize) return null;

    const alert = evaluateParserFailure(
      {
        total: this.total,
        unrecognized: this.unrecognized,
        byBank: Object.fromEntries(this.byBank),
        source: this.source,
      },
      this.thresholds,
    );
    this.reset();
    return alert;
  }

  private reset(): void {
    this.total = 0;
    this.unrecognized = 0;
    this.byBank = new Map<string, number>();
  }
}
