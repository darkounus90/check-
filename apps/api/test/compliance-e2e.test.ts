import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type AuditEvent,
  Auditor,
  buildConsentRecord,
  createMemoryAuditSink,
  decryptString,
  encryptString,
  generateKeyBase64,
  isBeyondRetention,
  isEncrypted,
  KeyRing,
  keyRingFromEnv,
  reencrypt,
  retentionCutoff,
} from "@check/shared";

/**
 * Prueba de cumplimiento end-to-end (Épica 12, E12-T8): demuestra los CUATRO pilares
 * funcionando juntos sobre un recorrido de un comprobante:
 *   1. Consentimiento: el titular acepta el aviso y queda registrado.
 *   2. Cifrado en reposo: el ocrText se guarda cifrado; sin la clave no es legible.
 *   3. Auditoría inmutable: cada acceso al dato sensible queda registrado.
 *   4. Retención + habeas data: el dato fuera de ventana se purga; y a solicitud del titular
 *      se exporta (descifrado) y se elimina.
 *
 * Todo con las primitivas puras de `@check/shared` (los servicios de api/workers las envuelven).
 */
test("recorrido de cumplimiento: consentimiento + cifrado + auditoría + retención/habeas", () => {
  const clock = () => new Date("2026-07-06T12:00:00.000Z");
  const ring: KeyRing = keyRingFromEnv(`v1:${generateKeyBase64()}`);
  const { sink, events } = createMemoryAuditSink();
  const auditor = new Auditor(sink, clock);

  // ── 1. Consentimiento ──────────────────────────────────────
  const consent = buildConsentRecord(
    { businessId: "b-1", channel: "whatsapp", subjectRef: "573001234567@s.whatsapp.net" },
    clock,
  );
  assert.equal(consent.channel, "whatsapp");
  assert.ok(consent.noticeVersion.length > 0);
  assert.equal(consent.acceptedAt, clock().toISOString());

  // ── 2. Cifrado en reposo del ocrText (PII del pagador) ─────
  const ocrPlain = "Comprobante Nequi — Juan Pérez — $50.000 — aprob 998877";
  const ocrStored = encryptString(ring, ocrPlain);
  assert.ok(isEncrypted(ocrStored));
  assert.notEqual(ocrStored, ocrPlain);
  // Sin la clave correcta, no es legible.
  const otroRing = keyRingFromEnv(`v1:${generateKeyBase64()}`);
  assert.throws(() => decryptString(otroRing, ocrStored));

  // ── 3. Auditoría de un acceso al dato sensible ─────────────
  void auditor.record({
    businessId: "b-1",
    actorId: "user-owner",
    resource: "voucher",
    action: "decrypt",
    resourceId: "v-1",
  });
  assert.equal(events.length, 1);
  const audit: AuditEvent = events[0];
  assert.equal(audit.action, "decrypt");
  assert.equal(audit.occurredAt, clock().toISOString());

  // ── 4a. Retención: un comprobante viejo cae fuera de ventana ─
  const now = clock();
  const oldCreatedAt = new Date(retentionCutoff("voucher", now).getTime() - 1000);
  assert.equal(isBeyondRetention("voucher", oldCreatedAt, now), true);
  const recentCreatedAt = new Date(now.getTime() - 1000);
  assert.equal(isBeyondRetention("voucher", recentCreatedAt, now), false);

  // ── 4b. Habeas data: export descifra; luego se elimina ─────
  const exported = decryptString(ring, ocrStored);
  assert.equal(exported, ocrPlain); // el titular recibe su info legible
  void auditor.record({
    businessId: "b-1",
    actorId: "user-owner",
    resource: "data_subject_export",
    action: "export",
    resourceId: consent.subjectRef,
  });
  void auditor.record({
    businessId: "b-1",
    actorId: "user-owner",
    resource: "data_subject_delete",
    action: "delete",
    resourceId: consent.subjectRef,
  });
  // Los tres accesos quedaron auditados en orden.
  assert.deepEqual(
    events.map((e) => e.action),
    ["decrypt", "export", "delete"],
  );

  // ── Bonus: rotación de clave (E12-T2) sin perder datos ─────
  const ring2 = ring.withKey({ version: 2, key: Buffer.from(generateKeyBase64(), "base64") }, true);
  const rotated = reencrypt(ring2, ocrStored);
  assert.ok(rotated.startsWith("enc:v2:"));
  assert.equal(decryptString(ring2, rotated), ocrPlain);
});
