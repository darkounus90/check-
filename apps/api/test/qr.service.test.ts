import assert from "node:assert/strict";
import { test } from "node:test";

import { NotFoundException } from "@nestjs/common";

import { QrBusinessStore, QrService } from "../src/me/qr.service";

/**
 * Tests del generador de QR del dueño (E08-T6). El QR codifica la URL estable
 * `${PUBLIC_APP_URL}/n/{opaqueId}` (dominio configurable) y produce PNG + SVG.
 */

function makeStore(business: { id: string; opaqueId: string } | null): QrBusinessStore {
  return {
    business: {
      async findUnique({ where }) {
        if (!business || business.id !== where.id) return null;
        return { opaqueId: business.opaqueId };
      },
    },
  };
}

test("buildUrl usa PUBLIC_APP_URL y la ruta /n/{opaqueId}, sin doble slash", () => {
  const url = QrService.buildUrl("opq-xyz");
  assert.match(url, /\/n\/opq-xyz$/);
  assert.doesNotMatch(url, /[^:]\/\//); // sin '//' fuera del esquema
});

test("genera PNG (data URI) y SVG del QR que apunta a la URL del negocio", async () => {
  const service = new QrService(makeStore({ id: "biz-1", opaqueId: "opq-xyz" }));

  const qr = await service.getBusinessQr("biz-1");

  assert.equal(qr.url, QrService.buildUrl("opq-xyz"));
  assert.match(qr.pngDataUrl, /^data:image\/png;base64,/);
  assert.match(qr.svg, /^<\?xml|^<svg/);
});

test("negocio inexistente: 404 NotFoundException", async () => {
  const service = new QrService(makeStore(null));
  await assert.rejects(service.getBusinessQr("biz-desconocido"), NotFoundException);
});
