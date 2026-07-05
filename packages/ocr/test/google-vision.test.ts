import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GoogleVisionProvider,
  type VisionClientLike,
} from "../src/providers/google-vision.ts";

const FAKE_INPUT = new Uint8Array([1, 2, 3]);

test("GoogleVisionProvider.recognize devuelve ok(texto) con un cliente fake que detecta texto", async () => {
  const fakeClient: VisionClientLike = {
    async documentTextDetection() {
      return [{ fullTextAnnotation: { text: "Comprobante Nequi $50.000" } }];
    },
  };
  const provider = new GoogleVisionProvider(fakeClient);

  const result = await provider.recognize(FAKE_INPUT);

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value, "Comprobante Nequi $50.000");
});

test("GoogleVisionProvider.recognize devuelve err(...) si el cliente fake rechaza (error/timeout)", async () => {
  const fakeClient: VisionClientLike = {
    async documentTextDetection() {
      throw new Error("deadline exceeded");
    },
  };
  const provider = new GoogleVisionProvider(fakeClient);

  const result = await provider.recognize(FAKE_INPUT);

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /deadline exceeded/);
});

test("GoogleVisionProvider.recognize devuelve err(...) si Vision no detecta texto", async () => {
  const fakeClient: VisionClientLike = {
    async documentTextDetection() {
      return [{ fullTextAnnotation: null }];
    },
  };
  const provider = new GoogleVisionProvider(fakeClient);

  const result = await provider.recognize(FAKE_INPUT);

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /no detectó texto/);
});

test("GoogleVisionProvider.recognize devuelve err(...) si el import dinámico del SDK falla", async () => {
  const provider = new GoogleVisionProvider(undefined, async () => {
    throw new Error("Cannot find module '@google-cloud/vision'");
  });

  const result = await provider.recognize(FAKE_INPUT);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /Google Vision no disponible/);
    assert.match(result.error, /Cannot find module/);
  }
});

test("GoogleVisionProvider reutiliza el cliente ya inyectado sin volver a cargar el SDK", async () => {
  let calls = 0;
  const fakeClient: VisionClientLike = {
    async documentTextDetection() {
      calls += 1;
      return [{ fullTextAnnotation: { text: `intento ${calls}` } }];
    },
  };
  const provider = new GoogleVisionProvider(fakeClient, async () => {
    throw new Error("no debería llamarse: hay cliente inyectado");
  });

  const first = await provider.recognize(FAKE_INPUT);
  const second = await provider.recognize(FAKE_INPUT);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(calls, 2);
});
