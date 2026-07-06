import assert from "node:assert/strict";
import { test } from "node:test";

import { IssuerBank, OcrStatus } from "@check/database";
import { TextOcrProvider } from "@check/ocr";
import type { OcrProvider } from "@check/ocr";

import {
  OcrService,
  type VoucherRecord,
  type VoucherStore,
  type VoucherUpdateData,
} from "../src/ocr/ocr.service";
import type { VoucherImageDownloader } from "../src/storage/storage.service";

/**
 * Tests unitarios del pipeline de OCR (E05-T3), con dependencias fake: Prisma,
 * descarga de Storage y `OcrProvider`. No requieren Redis/BullMQ ni red real.
 */

const NEQUI_TEXT = [
  "Nequi",
  "Enviaste $50.000",
  "a Juan Perez",
  "3001234567",
  "Comprobante 1234567",
  "03/07/2026 10:30",
].join("\n");

function makeFakePrisma(voucher: VoucherRecord): {
  store: VoucherStore;
  updates: Array<{ where: { id: string }; data: VoucherUpdateData }>;
} {
  const updates: Array<{ where: { id: string }; data: VoucherUpdateData }> = [];
  const store: VoucherStore = {
    voucher: {
      async findUniqueOrThrow({ where }) {
        if (where.id !== voucher.id) throw new Error(`voucher no encontrado: ${where.id}`);
        return voucher;
      },
      async update(args) {
        updates.push(args);
        return { ...voucher, ...args.data };
      },
    },
  };
  return { store, updates };
}

const fakeDownload: VoucherImageDownloader = {
  async downloadVoucherImage() {
    return new Uint8Array([1, 2, 3]);
  },
};

/** Evita depender de `sharp`/imágenes reales: los fakes de OCR ignoran los bytes de entrada. */
const identityNormalize = async (input: Uint8Array): Promise<Uint8Array> => input;

test("comprobante reconocible: persiste los campos extraídos y ocrStatus PROCESSED", async () => {
  const voucher: VoucherRecord = { id: "v1", storagePath: "biz1/v1.png" };
  const { store, updates } = makeFakePrisma(voucher);
  const service = new OcrService(store, fakeDownload, new TextOcrProvider(NEQUI_TEXT), identityNormalize);

  await service.process("v1");

  assert.equal(updates.length, 1);
  const data = updates[0]?.data;
  assert.equal(data?.ocrStatus, OcrStatus.PROCESSED);
  assert.equal(data?.issuerBank, IssuerBank.NEQUI);
  assert.equal(data?.amountCents, 5_000_000);
  assert.equal(data?.approvalNumber, "1234567");
  assert.equal(data?.destinationAccount, "3001234567");
  assert.equal(data?.beneficiary, "Juan Perez");
  assert.equal(data?.ocrText, NEQUI_TEXT);
  assert.equal(data?.paidAt?.toISOString(), "2026-07-03T15:30:00.000Z");
});

test("comprobante de baja calidad: marca LOW_QUALITY (pedir mejor foto) en vez de fallar o marcar sospechoso", async () => {
  const voucher: VoucherRecord = { id: "v2", storagePath: "biz1/v2.png" };
  const { store, updates } = makeFakePrisma(voucher);
  const service = new OcrService(store, fakeDownload, new TextOcrProvider("borroso"), identityNormalize);

  await service.process("v2");

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.data.ocrStatus, OcrStatus.LOW_QUALITY);
  assert.equal(updates[0]?.data.ocrText, "borroso");
  assert.equal(updates[0]?.data.issuerBank, undefined);
});

test("comprobante con buena calidad pero no reconocido por ningún extractor: marca FAILED", async () => {
  const voucher: VoucherRecord = { id: "v3", storagePath: "biz1/v3.png" };
  const { store, updates } = makeFakePrisma(voucher);
  const unrecognized = "Texto con cifras $100.000 y numero 55555 pero de un banco desconocido";
  const service = new OcrService(store, fakeDownload, new TextOcrProvider(unrecognized), identityNormalize);

  await service.process("v3");

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.data.ocrStatus, OcrStatus.FAILED);
  assert.equal(updates[0]?.data.ocrText, unrecognized);
});

test("PDF (storagePath .pdf): marca LOW_QUALITY sin descargar/normalizar (no cuelga en PENDING) — E09-T6", async () => {
  const voucher: VoucherRecord = { id: "vpdf", storagePath: "biz1/vpdf.pdf" };
  const { store, updates } = makeFakePrisma(voucher);
  let downloaded = false;
  const spyDownload: VoucherImageDownloader = {
    async downloadVoucherImage() {
      downloaded = true;
      return new Uint8Array([1, 2, 3]);
    },
  };
  const service = new OcrService(store, spyDownload, new TextOcrProvider(NEQUI_TEXT), identityNormalize);

  await service.process("vpdf");

  // No se lanza (no se reintenta) y se persiste LOW_QUALITY: la PWA pedirá una foto.
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.data.ocrStatus, OcrStatus.LOW_QUALITY);
  // Ni siquiera se toca Storage: la guarda corta antes de descargar.
  assert.equal(downloaded, false);
});

test("error transitorio (ej. Vision falla): no persiste datos parciales y permite reintento vía BullMQ (lanza)", async () => {
  const voucher: VoucherRecord = { id: "v4", storagePath: "biz1/v4.png" };
  const { store, updates } = makeFakePrisma(voucher);
  const failingProvider: OcrProvider = {
    async recognize() {
      return { ok: false, error: "Vision no disponible (timeout)" };
    },
  };
  const service = new OcrService(store, fakeDownload, failingProvider, identityNormalize);

  await assert.rejects(() => service.process("v4"), /Vision no disponible/);
  assert.equal(updates.length, 0);
});

test("descarga de Storage caída: no persiste nada y permite reintento vía BullMQ (lanza)", async () => {
  const voucher: VoucherRecord = { id: "v5", storagePath: "biz1/v5.png" };
  const { store, updates } = makeFakePrisma(voucher);
  const failingDownload: VoucherImageDownloader = {
    async downloadVoucherImage() {
      throw new Error("Storage no disponible (503)");
    },
  };
  const service = new OcrService(store, failingDownload, new TextOcrProvider(NEQUI_TEXT), identityNormalize);

  await assert.rejects(() => service.process("v5"), /Storage no disponible/);
  assert.equal(updates.length, 0);
});

test("voucher sin storagePath: lanza sin intentar descargar ni persistir", async () => {
  const voucher: VoucherRecord = { id: "v6", storagePath: null };
  const { store, updates } = makeFakePrisma(voucher);
  const service = new OcrService(store, fakeDownload, new TextOcrProvider(NEQUI_TEXT), identityNormalize);

  await assert.rejects(() => service.process("v6"), /storagePath/);
  assert.equal(updates.length, 0);
});
