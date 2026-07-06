import assert from "node:assert/strict";
import { test } from "node:test";

import { ParserFailureTracker } from "../src/parser-failure-tracker.js";

test("no evalúa hasta cerrar la ventana", () => {
  const tracker = new ParserFailureTracker({ source: "bank_email", windowSize: 5 });
  for (let i = 0; i < 4; i++) assert.equal(tracker.record(false, "bancolombia"), null);
});

test("dispara al cerrar ventana con demasiados no reconocidos", () => {
  const tracker = new ParserFailureTracker({ source: "bank_email", windowSize: 5 });
  tracker.record(true, "bancolombia");
  tracker.record(false, "bancolombia");
  tracker.record(false, "bancolombia");
  tracker.record(false, "desconocido");
  const alert = tracker.record(false, "desconocido"); // cierra en 5

  assert.ok(alert);
  assert.equal(alert?.kind, "parser_match_failure");
  assert.equal(alert?.context?.unrecognized, 4);
  assert.deepEqual(alert?.context?.byBank, { bancolombia: 2, desconocido: 2 });
});

test("no dispara si la ventana está mayormente sana, y resetea", () => {
  const tracker = new ParserFailureTracker({ source: "voucher_ocr", windowSize: 6 });
  for (let i = 0; i < 5; i++) tracker.record(true, "nequi");
  const alert = tracker.record(false, "nequi"); // 1/6 fallo → bajo umbral
  assert.equal(alert, null);

  // Tras cerrar, el contador se reinició: una nueva mala racha vuelve a poder disparar.
  for (let i = 0; i < 5; i++) tracker.record(false, "nequi");
  const second = tracker.record(false, "nequi"); // 6/6 fallo → dispara
  assert.ok(second);
});
