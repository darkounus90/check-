import assert from "node:assert/strict";
import { test } from "node:test";

import { isUnsupportedByOcrPipeline } from "../src/preprocess.js";

/**
 * Guarda del gap de PDF del pipeline de OCR (E09-T6): sharp solo normaliza
 * imágenes rasterizadas, así que un PDF debe detectarse por su ruta de Storage
 * antes de intentar normalizarlo.
 */

test("detecta PDF por la extensión de la ruta (incluye mayúsculas)", () => {
  assert.equal(isUnsupportedByOcrPipeline("biz1/uuid.pdf"), true);
  assert.equal(isUnsupportedByOcrPipeline("biz1/uuid.PDF"), true);
});

test("las imágenes soportadas no se marcan como no soportadas", () => {
  assert.equal(isUnsupportedByOcrPipeline("biz1/uuid.jpg"), false);
  assert.equal(isUnsupportedByOcrPipeline("biz1/uuid.png"), false);
  assert.equal(isUnsupportedByOcrPipeline("biz1/uuid.webp"), false);
});
