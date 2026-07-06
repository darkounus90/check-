import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from "@nestjs/common";

import { MAX_VOUCHER_FILE_BYTES } from "../src/public/public.constants";
import {
  type PublicStore,
  PublicVouchersService,
  type UploadedVoucherFile,
} from "../src/public/public-vouchers.service";
import { VouchersController } from "../src/me/vouchers.controller";
import type { TenantContext } from "../src/tenant/tenant.service";

/**
 * Gap #9: subida AUTENTICADA de comprobante (cajero). El negocio se resuelve por el JWT
 * (`req.tenant`), NO por opaqueId, y entra al MISMO pipeline (Storage + cola OCR) que la ruta
 * pública. Tests unitarios con Prisma/Storage/cola FAKE — sin BD, Supabase ni Redis reales.
 */

const TENANT: TenantContext = { businessId: "biz-cajero-1", role: "CASHIER" };

function makeFakeStore(): {
  store: PublicStore;
  created: Array<{ businessId: string; storagePath: string }>;
} {
  const created: Array<{ businessId: string; storagePath: string }> = [];
  const store: PublicStore = {
    business: {
      async findUnique() {
        // La subida autenticada NO resuelve por opaqueId; no debería tocar `business`.
        throw new Error("no debería resolver el negocio por opaqueId en la ruta autenticada");
      },
    },
    voucher: {
      async create({ data }) {
        created.push(data);
        return { id: "voucher-auth-1" };
      },
      async findUnique() {
        return null;
      },
    },
  };
  return { store, created };
}

function makeFakeStorage(): {
  uploader: { uploadVoucher(p: string, b: Uint8Array, c: string): Promise<void> };
  uploads: Array<{ storagePath: string; contentType: string }>;
} {
  const uploads: Array<{ storagePath: string; contentType: string }> = [];
  return {
    uploads,
    uploader: {
      async uploadVoucher(storagePath, _bytes, contentType) {
        uploads.push({ storagePath, contentType });
      },
    },
  };
}

function makeFakeQueue(): { enqueuer: { enqueueVoucherOcr(id: string): Promise<void> }; enqueued: string[] } {
  const enqueued: string[] = [];
  return { enqueued, enqueuer: { async enqueueVoucherOcr(id) { enqueued.push(id); } } };
}

const jpegFile = (size = 100): UploadedVoucherFile => ({
  mimetype: "image/jpeg",
  size,
  buffer: Buffer.from([0xff, 0xd8, 0xff]),
});

function makeController(): {
  controller: VouchersController;
  created: Array<{ businessId: string; storagePath: string }>;
  uploads: Array<{ storagePath: string; contentType: string }>;
  enqueued: string[];
} {
  const { store, created } = makeFakeStore();
  const storage = makeFakeStorage();
  const queue = makeFakeQueue();
  const service = new PublicVouchersService(store, storage.uploader, queue.enqueuer);
  return {
    controller: new VouchersController(service),
    created,
    uploads: storage.uploads,
    enqueued: queue.enqueued,
  };
}

test("subida autenticada feliz: liga el Voucher al negocio del JWT, sube a Storage y encola OCR", async () => {
  const { controller, created, uploads, enqueued } = makeController();

  const result = await controller.upload(TENANT, jpegFile());

  assert.deepEqual(result, { voucherId: "voucher-auth-1" });
  // Storage bajo el prefijo del negocio resuelto por el JWT (no por opaqueId).
  assert.equal(uploads.length, 1);
  assert.match(uploads[0]?.storagePath ?? "", /^biz-cajero-1\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(uploads[0]?.contentType, "image/jpeg");
  // Voucher ligado al negocio del cajero + MISMO pipeline OCR.
  assert.equal(created.length, 1);
  assert.equal(created[0]?.businessId, "biz-cajero-1");
  assert.deepEqual(enqueued, ["voucher-auth-1"]);
});

test("sin archivo: 400 BadRequestException y nada persiste", () => {
  const { controller, created, uploads, enqueued } = makeController();

  // El guard de "falta archivo" lanza de forma síncrona (antes de tocar el pipeline).
  assert.throws(() => controller.upload(TENANT, undefined), BadRequestException);
  assert.equal(uploads.length, 0);
  assert.equal(created.length, 0);
  assert.equal(enqueued.length, 0);
});

test("tipo no soportado: 415 y nada persiste", async () => {
  const { controller, created, uploads } = makeController();

  await assert.rejects(
    controller.upload(TENANT, { mimetype: "image/gif", size: 100, buffer: Buffer.from([0x47]) }),
    UnsupportedMediaTypeException,
  );
  assert.equal(uploads.length, 0);
  assert.equal(created.length, 0);
});

test("archivo mayor a 10 MB: 413 (defensa además del límite de multer)", async () => {
  const { controller } = makeController();

  await assert.rejects(
    controller.upload(TENANT, jpegFile(MAX_VOUCHER_FILE_BYTES + 1)),
    PayloadTooLargeException,
  );
});
