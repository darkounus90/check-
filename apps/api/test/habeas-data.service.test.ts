import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decryptString,
  encryptString,
  generateKeyBase64,
  isEncrypted,
  KeyRing,
  keyRingFromEnv,
} from "@check/shared";

import { HabeasDataService } from "../src/habeas-data/habeas-data.service";

/**
 * Tests de habeas data (Épica 12, E12-T4/T8) con fakes: NO requieren BD real. Verifican que
 * dado un titular (por su JID de WhatsApp) se puede EXPORTAR su info (descifrando los campos
 * sensibles) y ELIMINARLA, dejando en ambos casos un evento de AUDITORÍA.
 */

// KeyRing real para ejercer el descifrado del export.
const KEY = generateKeyBase64();
const ring: KeyRing = keyRingFromEnv(`v1:${KEY}`);

// Fake de CryptoService: usa el KeyRing real para cifrar/descifrar strings.
function fakeCrypto() {
  return {
    encryptString(v: string | null) {
      if (v == null) return v;
      return isEncrypted(v) ? v : encryptWith(v);
    },
    decryptString(v: string | null) {
      if (v == null) return v;
      return isEncrypted(v) ? decryptWith(v) : v;
    },
  } as unknown as ConstructorParameters<typeof HabeasDataService>[1];
}

function encryptWith(v: string): string {
  return encryptString(ring, v);
}
function decryptWith(v: string): string {
  return decryptString(ring, v);
}

interface AuditRow {
  resource: string;
  action: string;
  resourceId: string | null;
  metadata: unknown;
}

function fakeAudit(events: AuditRow[]) {
  return {
    async record(input: AuditRow) {
      events.push(input);
    },
  } as unknown as ConstructorParameters<typeof HabeasDataService>[2];
}

test("exportSubject descifra el ocrText y audita el acceso", async () => {
  const encryptedOcr = encryptWith("Pago de Juan Pérez por $50.000");
  const events: AuditRow[] = [];
  const prisma = {
    waVoucherContext: {
      async findMany() {
        return [
          {
            voucher: {
              id: "v-1",
              issuerBank: "NEQUI",
              amountCents: 5000000,
              approvalNumber: "123",
              paidAt: new Date(),
              destinationAccount: null,
              beneficiary: null,
              storagePath: "b-1/x.jpg",
              ocrText: encryptedOcr,
              ocrStatus: "PROCESSED",
              createdAt: new Date(),
              transaction: null,
            },
          },
        ];
      },
    },
    privacyConsent: {
      async findMany() {
        return [{ channel: "whatsapp", noticeVersion: "2026-07-06", acceptedAt: new Date() }];
      },
    },
  } as unknown as ConstructorParameters<typeof HabeasDataService>[0];

  const svc = new HabeasDataService(prisma, fakeCrypto(), fakeAudit(events));
  const result = await svc.exportSubject("b-1", "user-1", "573001234567@s.whatsapp.net");

  assert.equal(result.vouchers.length, 1);
  // El export entrega el ocrText EN CLARO (descifrado), no el sobre.
  assert.equal(result.vouchers[0].ocrText, "Pago de Juan Pérez por $50.000");
  assert.equal(result.consents.length, 1);
  // Se auditó el export.
  assert.equal(events.length, 1);
  assert.equal(events[0].resource, "data_subject_export");
  assert.equal(events[0].action, "export");
});

test("deleteSubject borra vouchers/consents y audita la eliminación", async () => {
  const events: AuditRow[] = [];
  let deletedVoucherIds: string[] = [];
  const prisma = {
    waVoucherContext: {
      async findMany() {
        return [
          { voucherId: "v-1", voucher: { storagePath: "b-1/x.jpg" } },
          { voucherId: "v-2", voucher: { storagePath: null } },
        ];
      },
    },
    voucher: {
      async deleteMany({ where }: { where: { id: { in: string[] } } }) {
        deletedVoucherIds = where.id.in;
        return { count: where.id.in.length };
      },
    },
    privacyConsent: {
      async deleteMany() {
        return { count: 1 };
      },
    },
  } as unknown as ConstructorParameters<typeof HabeasDataService>[0];

  const svc = new HabeasDataService(prisma, fakeCrypto(), fakeAudit(events));
  const result = await svc.deleteSubject("b-1", "user-1", "573001234567@s.whatsapp.net");

  assert.deepEqual(deletedVoucherIds.sort(), ["v-1", "v-2"]);
  assert.equal(result.vouchersDeleted, 2);
  assert.equal(result.consentsDeleted, 1);
  assert.deepEqual(result.storagePathsToPurge, ["b-1/x.jpg"]);
  assert.equal(events.length, 1);
  assert.equal(events[0].resource, "data_subject_delete");
  assert.equal(events[0].action, "delete");
});
