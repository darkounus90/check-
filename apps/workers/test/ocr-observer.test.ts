import assert from "node:assert/strict";
import { test } from "node:test";

import { createMemorySink, MetricsRegistry, StructuredLogger, type AlertEvent } from "@check/shared";

import type { AlertPort } from "../src/observability/alert.port";
import { OcrObserver } from "../src/ocr/ocr.observer";

/**
 * E11-T4/T7: el observador registra la tasa de extracción por banco y dispara alerta cuando
 * una ventana de comprobantes cae mayormente en "no reconocido".
 */

function setup() {
  const metrics = new MetricsRegistry();
  const dispatched: AlertEvent[] = [];
  const alerts: AlertPort = { dispatch: async (e) => void dispatched.push(e) };
  const logger = new StructuredLogger({ sink: createMemorySink().sink });
  return { observer: new OcrObserver(metrics, alerts, logger), metrics, dispatched };
}

test("registra tasa de extracción por banco (E11-T7)", () => {
  const { observer, metrics } = setup();
  observer.onExtractionResult(true, "nequi");
  observer.onExtractionResult(true, "nequi");
  observer.onExtractionResult(false, "nequi");

  const rates = metrics.snapshot().rates.voucher_extraction;
  assert.equal(rates?.nequi?.total, 3);
  assert.equal(rates?.nequi?.ok, 2);
});

test("una tanda de no reconocidos dispara alerta de parser (E11-T4)", () => {
  const { observer, dispatched } = setup();
  // Ventana por defecto = 20; llenamos con 18 fallos + 2 ok → 90% fallo.
  for (let i = 0; i < 18; i++) observer.onExtractionResult(false, "desconocido");
  observer.onExtractionResult(true, "nequi");
  observer.onExtractionResult(true, "nequi"); // cierra la ventana en 20

  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]?.kind, "parser_match_failure");
  assert.equal(dispatched[0]?.context?.source, "voucher_ocr");
});

test("comprobantes mayormente reconocidos → sin alerta", () => {
  const { observer, dispatched } = setup();
  for (let i = 0; i < 20; i++) observer.onExtractionResult(true, "nequi");
  assert.equal(dispatched.length, 0);
});

test("recordProcessingDuration alimenta el histograma", () => {
  const { observer, metrics } = setup();
  observer.recordProcessingDuration(1500);
  assert.equal(metrics.snapshot().durations.ocr_processing_ms?.count, 1);
});
