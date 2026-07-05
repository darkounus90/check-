import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtractedVoucher } from "@check/ocr";
import { toCents } from "@check/shared";
import sharp from "sharp";

import { imageForensicsDefense } from "../../src/defenses/image-forensics.ts";
import type { DefenseInput } from "../../src/index.ts";

const voucher: ExtractedVoucher = {
  issuerBank: "nequi",
  amount: toCents(5_000_000),
  approvalNumber: "1234567",
  paidAtUtc: "2026-07-03T15:30:00.000Z",
  destinationAccount: "3001234567",
  beneficiary: "Panaderia Ejemplo",
};

function inputWith(imageBytes: Uint8Array | undefined): DefenseInput {
  return {
    voucher,
    context: { business: { businessId: "biz_1" }, receivedBankEmails: [] },
    ...(imageBytes !== undefined ? { imageBytes } : {}),
  };
}

const WIDTH = 256;
const HEIGHT = 256;

/** Genera una imagen "de comprobante" sintética: gradiente suave, sin bordes duros
 * ni contenido de alta frecuencia, que recomprime de forma consistente en toda la
 * imagen (ELA no debería marcar ningún "hot spot" localizado). */
function makeCleanGradientRaw(): Buffer {
  const buf = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const i = (y * WIDTH + x) * 3;
      buf[i] = Math.floor((x / WIDTH) * 255);
      buf[i + 1] = Math.floor((y / HEIGHT) * 255);
      buf[i + 2] = Math.floor(((x + y) / (WIDTH + HEIGHT)) * 255);
    }
  }
  return buf;
}

/** Toma el gradiente limpio y "pega" un parche de ruido de alta frecuencia en una
 * esquina — simula una región editada/pegada con distinta historia de compresión,
 * el caso clásico que ELA detecta vía un ratio de error localizado alto. */
function makeSplicedRaw(): Buffer {
  const buf = Buffer.from(makeCleanGradientRaw());
  let seed = 42;
  const pseudoRandom = () => {
    // PRNG determinista simple (LCG) para que el test sea reproducible.
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 20; y < 100; y += 1) {
    for (let x = 20; x < 100; x += 1) {
      const i = (y * WIDTH + x) * 3;
      buf[i] = Math.floor(pseudoRandom() * 255);
      buf[i + 1] = Math.floor(pseudoRandom() * 255);
      buf[i + 2] = Math.floor(pseudoRandom() * 255);
    }
  }
  return buf;
}

async function toPng(raw: Buffer): Promise<Uint8Array> {
  const out = await sharp(raw, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
    .png()
    .toBuffer();
  return new Uint8Array(out);
}

test("kind es 'image_forensics'", () => {
  assert.equal(imageForensicsDefense.kind, "image_forensics");
});

test("sin imageBytes → not_applicable (no penaliza por dato faltante, D4)", async () => {
  const signal = await imageForensicsDefense.evaluate(inputWith(undefined));

  assert.equal(signal.kind, "image_forensics");
  assert.equal(signal.outcome, "not_applicable");
  assert.equal(signal.weight, 0);
  assert.equal(signal.enablesGreen, false);
});

test("imageBytes vacío → not_applicable", async () => {
  const signal = await imageForensicsDefense.evaluate(inputWith(new Uint8Array()));

  assert.equal(signal.outcome, "not_applicable");
});

test("bytes ilegibles (no es una imagen) → not_applicable, no falla", async () => {
  const signal = await imageForensicsDefense.evaluate(inputWith(new Uint8Array([1, 2, 3, 4, 5])));

  assert.equal(signal.outcome, "not_applicable");
  assert.ok(signal.detail && signal.detail.length > 0);
});

test("imagen limpia (gradiente suave, sin EXIF de edición) → pass, sin enablesGreen", async () => {
  const png = await toPng(makeCleanGradientRaw());

  const signal = await imageForensicsDefense.evaluate(inputWith(png));

  assert.equal(signal.kind, "image_forensics");
  assert.equal(signal.outcome, "pass");
  assert.equal(signal.enablesGreen, false);
});

test("imagen con parche pegado de alta frecuencia (ELA localizado) → fail", async () => {
  const png = await toPng(makeSplicedRaw());

  const signal = await imageForensicsDefense.evaluate(inputWith(png));

  assert.equal(signal.kind, "image_forensics");
  assert.equal(signal.outcome, "fail");
  assert.equal(signal.enablesGreen, false);
  assert.match(signal.detail ?? "", /recompresión|ELA/i);
});

test("EXIF con software de edición conocido (Photoshop) → fail, aunque la imagen no esté 'pegada'", async () => {
  const cleanPng = await toPng(makeCleanGradientRaw());
  const withEditedExif = await sharp(cleanPng)
    .withExif({ IFD0: { Software: "Adobe Photoshop 25.0" } })
    .jpeg({ quality: 95 })
    .toBuffer();

  const signal = await imageForensicsDefense.evaluate(inputWith(new Uint8Array(withEditedExif)));

  assert.equal(signal.outcome, "fail");
  assert.match(signal.detail ?? "", /Photoshop/);
});

test("JPEG sin ningún EXIF (señal débil) sigue siendo pass, no penaliza por sí sola", async () => {
  const cleanPng = await toPng(makeCleanGradientRaw());
  const plainJpeg = await sharp(cleanPng).jpeg({ quality: 95 }).toBuffer();

  const signal = await imageForensicsDefense.evaluate(inputWith(new Uint8Array(plainJpeg)));

  assert.equal(signal.outcome, "pass");
});

test("el resultado es determinista para los mismos bytes", async () => {
  const png = await toPng(makeCleanGradientRaw());
  const input = inputWith(png);

  const first = await imageForensicsDefense.evaluate(input);
  const second = await imageForensicsDefense.evaluate(input);

  assert.deepEqual(first, second);
});
