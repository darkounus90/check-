import assert from "node:assert/strict";
import { test } from "node:test";

import {
  detectVoucherMedia,
  isProcessableIncoming,
  remoteJidOf,
} from "../src/incoming.js";

/**
 * Tests de la normalización de mensajes entrantes → decisión de ingesta (E07-T2).
 * Puros: no tocan Baileys/Storage/BD, solo clasifican el contenido del mensaje.
 */

test("detectVoucherMedia: imagen JPEG se acepta como comprobante", () => {
  const result = detectVoucherMedia({ imageMessage: { mimetype: "image/jpeg" } });
  assert.deepEqual(result, {
    contentType: "imageMessage",
    mimeType: "image/jpeg",
    extension: "jpg",
  });
});

test("detectVoucherMedia: imagen sin mimetype asume image/jpeg", () => {
  const result = detectVoucherMedia({ imageMessage: {} });
  assert.equal(result?.extension, "jpg");
  assert.equal(result?.mimeType, "image/jpeg");
});

test("detectVoucherMedia: documento PDF se acepta", () => {
  const result = detectVoucherMedia({ documentMessage: { mimetype: "application/pdf" } });
  assert.deepEqual(result, {
    contentType: "documentMessage",
    mimeType: "application/pdf",
    extension: "pdf",
  });
});

test("detectVoucherMedia: documento no-PDF (ej. docx) se rechaza", () => {
  const result = detectVoucherMedia({
    documentMessage: { mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  });
  assert.equal(result, null);
});

test("detectVoucherMedia: mensaje de texto no es comprobante", () => {
  const result = detectVoucherMedia({ conversation: "hola" });
  assert.equal(result, null);
});

test("detectVoucherMedia: mensaje vacío/undefined devuelve null", () => {
  assert.equal(detectVoucherMedia(null), null);
  assert.equal(detectVoucherMedia(undefined), null);
  assert.equal(detectVoucherMedia({}), null);
});

test("isProcessableIncoming: descarta fromMe, status broadcast y sin remoteJid", () => {
  assert.equal(isProcessableIncoming({ key: { fromMe: true, remoteJid: "123@s.whatsapp.net" } }), false);
  assert.equal(isProcessableIncoming({ key: { fromMe: false, remoteJid: "status@broadcast" } }), false);
  assert.equal(isProcessableIncoming({ key: { fromMe: false, remoteJid: null } }), false);
  assert.equal(isProcessableIncoming({ key: { fromMe: false, remoteJid: "57300@s.whatsapp.net" } }), true);
});

test("remoteJidOf: extrae el JID de origen o null", () => {
  assert.equal(remoteJidOf({ key: { remoteJid: "57300@s.whatsapp.net" } }), "57300@s.whatsapp.net");
  assert.equal(remoteJidOf({ key: { remoteJid: null } }), null);
});
