import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { OcrStatus, VerdictStatus } from "@prisma/client";

import type { OcrEnqueuer } from "../src/public/ocr-queue.service";
import { MAX_VOUCHER_FILE_BYTES } from "../src/public/public.constants";
import {
  type PublicStore,
  PublicVouchersService,
  type UploadedVoucherFile,
} from "../src/public/public-vouchers.service";
import type { VoucherStorageUploader } from "../src/public/voucher-storage.service";

/**
 * Tests unitarios de los endpoints públicos de la PWA (E09-T2/T4), con dependencias
 * fake: Prisma, subida a Storage y productor de la cola de OCR. No requieren BD,
 * Supabase ni Redis reales (mismo patrón que `apps/workers/test/ocr.service.test.ts`).
 */

interface FakeBusiness {
  id: string;
  opaqueId: string;
  name: string;
}

interface FakeVoucherRow {
  id: string;
  ocrStatus: OcrStatus;
  transaction: { verdict: VerdictStatus } | null;
}

function makeFakeStore(options: {
  business?: FakeBusiness;
  voucherRow?: FakeVoucherRow;
}): {
  store: PublicStore;
  created: Array<{ businessId: string; storagePath: string }>;
} {
  const created: Array<{ businessId: string; storagePath: string }> = [];
  const store: PublicStore = {
    business: {
      async findUnique({ where }) {
        const b = options.business;
        if (!b || b.opaqueId !== where.opaqueId) return null;
        return { id: b.id, name: b.name };
      },
    },
    voucher: {
      async create({ data }) {
        created.push(data);
        return { id: "voucher-nuevo-1" };
      },
      async findUnique({ where }) {
        const row = options.voucherRow;
        if (!row || row.id !== where.id) return null;
        return { ocrStatus: row.ocrStatus, transaction: row.transaction };
      },
    },
  };
  return { store, created };
}

function makeFakeStorage(): {
  uploader: VoucherStorageUploader;
  uploads: Array<{ storagePath: string; bytes: Uint8Array; contentType: string }>;
} {
  const uploads: Array<{ storagePath: string; bytes: Uint8Array; contentType: string }> = [];
  return {
    uploads,
    uploader: {
      async uploadVoucher(storagePath, bytes, contentType) {
        uploads.push({ storagePath, bytes, contentType });
      },
    },
  };
}

function makeFakeQueue(): { enqueuer: OcrEnqueuer; enqueued: string[] } {
  const enqueued: string[] = [];
  return {
    enqueued,
    enqueuer: {
      async enqueueVoucherOcr(voucherId) {
        enqueued.push(voucherId);
      },
    },
  };
}

const BUSINESS: FakeBusiness = { id: "biz-interno-1", opaqueId: "opq123", name: "Tienda Doña Rosa" };

const jpegFile = (size = 100): UploadedVoucherFile => ({
  mimetype: "image/jpeg",
  size,
  buffer: Buffer.from([0xff, 0xd8, 0xff]),
});

function makeService(
  store: PublicStore,
  uploader: VoucherStorageUploader,
  enqueuer: OcrEnqueuer,
): PublicVouchersService {
  return new PublicVouchersService(store, uploader, enqueuer);
}

// ── E09-T2: GET /public/n/:opaqueId ─────────────────────────────

test("negocio existente: devuelve SOLO el nombre (nunca el businessId interno ni el buzón)", async () => {
  const { store } = makeFakeStore({ business: BUSINESS });
  const service = makeService(store, makeFakeStorage().uploader, makeFakeQueue().enqueuer);

  const result = await service.getBusinessName("opq123");

  assert.deepEqual(result, { name: "Tienda Doña Rosa" });
  assert.deepEqual(Object.keys(result), ["name"]);
});

test("opaqueId inexistente: 404 NotFoundException", async () => {
  const { store } = makeFakeStore({ business: BUSINESS });
  const service = makeService(store, makeFakeStorage().uploader, makeFakeQueue().enqueuer);

  await assert.rejects(service.getBusinessName("no-existe"), NotFoundException);
});

// ── E09-T4: POST /public/n/:opaqueId/vouchers ───────────────────

test("ingesta feliz: sube a Storage bajo el prefijo del negocio, crea el Voucher y encola el OCR", async () => {
  const { store, created } = makeFakeStore({ business: BUSINESS });
  const storage = makeFakeStorage();
  const queue = makeFakeQueue();
  const service = makeService(store, storage.uploader, queue.enqueuer);

  const result = await service.ingestVoucher("opq123", jpegFile());

  assert.deepEqual(result, { voucherId: "voucher-nuevo-1" });
  // Subida a Storage: prefijo del negocio + extensión según el mimetype.
  assert.equal(storage.uploads.length, 1);
  const upload = storage.uploads[0];
  assert.match(upload?.storagePath ?? "", /^biz-interno-1\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(upload?.contentType, "image/jpeg");
  // Voucher ligado al negocio correcto, con el mismo storagePath subido.
  assert.equal(created.length, 1);
  assert.equal(created[0]?.businessId, "biz-interno-1");
  assert.equal(created[0]?.storagePath, upload?.storagePath);
  // Entra al MISMO pipeline: job de OCR con el id del Voucher creado.
  assert.deepEqual(queue.enqueued, ["voucher-nuevo-1"]);
});

test("ingesta de PDF: extensión .pdf y content-type application/pdf", async () => {
  const { store } = makeFakeStore({ business: BUSINESS });
  const storage = makeFakeStorage();
  const service = makeService(store, storage.uploader, makeFakeQueue().enqueuer);

  await service.ingestVoucher("opq123", {
    mimetype: "application/pdf",
    size: 500,
    buffer: Buffer.from("%PDF-1.4"),
  });

  assert.match(storage.uploads[0]?.storagePath ?? "", /\.pdf$/);
  assert.equal(storage.uploads[0]?.contentType, "application/pdf");
});

test("ingesta con opaqueId inexistente: 404 y NO sube, NO crea, NO encola", async () => {
  const { store, created } = makeFakeStore({ business: BUSINESS });
  const storage = makeFakeStorage();
  const queue = makeFakeQueue();
  const service = makeService(store, storage.uploader, queue.enqueuer);

  await assert.rejects(service.ingestVoucher("no-existe", jpegFile()), NotFoundException);
  assert.equal(storage.uploads.length, 0);
  assert.equal(created.length, 0);
  assert.equal(queue.enqueued.length, 0);
});

test("tipo de archivo no soportado: 415 UnsupportedMediaTypeException y nada persiste", async () => {
  const { store, created } = makeFakeStore({ business: BUSINESS });
  const storage = makeFakeStorage();
  const service = makeService(store, storage.uploader, makeFakeQueue().enqueuer);

  await assert.rejects(
    service.ingestVoucher("opq123", {
      mimetype: "image/gif",
      size: 100,
      buffer: Buffer.from([0x47]),
    }),
    UnsupportedMediaTypeException,
  );
  assert.equal(storage.uploads.length, 0);
  assert.equal(created.length, 0);
});

test("archivo mayor a 10 MB: 413 PayloadTooLargeException (defensa además del límite de multer)", async () => {
  const { store } = makeFakeStore({ business: BUSINESS });
  const service = makeService(store, makeFakeStorage().uploader, makeFakeQueue().enqueuer);

  await assert.rejects(
    service.ingestVoucher("opq123", jpegFile(MAX_VOUCHER_FILE_BYTES + 1)),
    PayloadTooLargeException,
  );
});

// ── E09-T4/T5: GET /public/vouchers/:voucherId ──────────────────

test("voucher sin Transaction: verdict null (🟡 aún en proceso)", async () => {
  const { store } = makeFakeStore({
    business: BUSINESS,
    voucherRow: { id: "v1", ocrStatus: OcrStatus.PENDING, transaction: null },
  });
  const service = makeService(store, makeFakeStorage().uploader, makeFakeQueue().enqueuer);

  assert.deepEqual(await service.getVoucherStatus("v1"), {
    ocrStatus: OcrStatus.PENDING,
    verdict: null,
  });
});

test("voucher procesado y verificado: devuelve ocrStatus y verdict reales", async () => {
  const { store } = makeFakeStore({
    business: BUSINESS,
    voucherRow: {
      id: "v2",
      ocrStatus: OcrStatus.PROCESSED,
      transaction: { verdict: VerdictStatus.VERIFIED },
    },
  });
  const service = makeService(store, makeFakeStorage().uploader, makeFakeQueue().enqueuer);

  assert.deepEqual(await service.getVoucherStatus("v2"), {
    ocrStatus: OcrStatus.PROCESSED,
    verdict: VerdictStatus.VERIFIED,
  });
});

test("voucherId inexistente: 404 NotFoundException (handle público sin fugas)", async () => {
  const { store } = makeFakeStore({ business: BUSINESS });
  const service = makeService(store, makeFakeStorage().uploader, makeFakeQueue().enqueuer);

  await assert.rejects(service.getVoucherStatus("no-existe"), NotFoundException);
});
