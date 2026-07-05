import assert from "node:assert/strict";
import { test } from "node:test";

import { BankEmailStatus, IssuerBank } from "@check/database";

import type { ApprovalNumberGateway } from "../src/verification/verification.approval-gateway";
import {
  DEFAULT_VERIFICATION_WINDOW_MINUTES,
  gatherVerificationContext,
  type VerificationBankEmailRecord,
  type VerificationContextStore,
  type VerificationReceivingAccountRecord,
  type VerificationVoucherRecord,
} from "../src/verification/verification.context";

/**
 * Tests unitarios del gatherer de contexto de verificación (E06-T12), con un Prisma
 * fake/duck-typed (mismo patrón que `VoucherStore` en `test/ocr.service.test.ts`) y un
 * `ApprovalNumberGateway` fake. No requieren BD/Redis real.
 */

const BASE_VOUCHER: VerificationVoucherRecord = {
  id: "v1",
  businessId: "biz1",
  issuerBank: IssuerBank.NEQUI,
  amountCents: 5_000_000,
  approvalNumber: "1234567",
  paidAt: new Date("2026-07-05T15:30:00.000Z"),
  destinationAccount: "3001234567",
  beneficiary: "Panaderia Ejemplo",
};

function makeStore(overrides: {
  voucher?: VerificationVoucherRecord;
  receivingAccounts?: VerificationReceivingAccountRecord[];
  bankEmails?: VerificationBankEmailRecord[];
}): VerificationContextStore {
  const voucher = overrides.voucher ?? BASE_VOUCHER;
  const receivingAccounts = overrides.receivingAccounts ?? [];
  const bankEmails = overrides.bankEmails ?? [];

  return {
    voucher: {
      async findUniqueOrThrow({ where }) {
        if (where.id !== voucher.id) throw new Error(`voucher no encontrado: ${where.id}`);
        return voucher;
      },
    },
    receivingAccount: {
      async findMany({ where }) {
        return where.businessId === voucher.businessId ? receivingAccounts : [];
      },
    },
    bankEmail: {
      async findMany({ where }) {
        if (where.businessId !== voucher.businessId || where.status !== BankEmailStatus.PARSED) {
          return [];
        }
        return bankEmails.filter((email) => {
          if (!email.occurredAt) return false;
          return email.occurredAt >= where.occurredAt.gte && email.occurredAt <= where.occurredAt.lte;
        });
      },
    },
  };
}

function makeApprovalGateway(exists: boolean | (() => Promise<boolean>)): ApprovalNumberGateway {
  return {
    async exists() {
      if (typeof exists === "function") return exists();
      return exists;
    },
    async register() {
      // no-op en estos tests
    },
  };
}

test("arma el DefenseInput completo: mapea issuerBank NEQUI -> 'nequi' y aplica la ventana por defecto", async () => {
  const store = makeStore({});
  const gateway = makeApprovalGateway(false);

  const result = await gatherVerificationContext(store, gateway, {
    voucherId: "v1",
    nowUtc: "2026-07-05T15:40:00.000Z",
  });

  assert.equal(result.input.voucher.issuerBank, "nequi");
  assert.equal(result.input.voucher.amount, 5_000_000);
  assert.equal(result.input.voucher.approvalNumber, "1234567");
  assert.equal(result.businessId, "biz1");
  assert.equal(result.amountCents, 5_000_000);
  assert.equal(result.approvalNumber, "1234567");
  assert.equal(result.issuerBankSlug, "nequi");
  assert.equal(
    result.input.context.business.verificationWindowMinutes,
    DEFAULT_VERIFICATION_WINDOW_MINUTES,
  );
  assert.equal(result.input.context.approvalNumberSeenGlobally, false);
  assert.equal(result.input.context.recentFailedAttemptsByClient, undefined);
  assert.equal(result.input.context.nowUtc, "2026-07-05T15:40:00.000Z");
  assert.deepEqual(result.input.context.receivedBankEmails, []);
  assert.equal(result.input.context.business.declaredAccountLast4, undefined);
  assert.equal(result.input.context.business.declaredBeneficiary, undefined);
});

test("selecciona la ReceivingAccount que coincide en últimos 4 dígitos como cuenta declarada", async () => {
  const store = makeStore({
    receivingAccounts: [
      { accountNumber: "9998887777", alias: "Cuenta vieja" },
      { accountNumber: "3009994567", alias: "Panaderia Ejemplo SAS" },
    ],
  });
  const gateway = makeApprovalGateway(false);

  const result = await gatherVerificationContext(store, gateway, {
    voucherId: "v1",
    nowUtc: "2026-07-05T15:40:00.000Z",
  });

  assert.equal(result.input.context.business.declaredAccountLast4, "3009994567");
  assert.equal(result.input.context.business.declaredBeneficiary, "Panaderia Ejemplo SAS");
});

test("sin ninguna ReceivingAccount coincidente: usa la primera configurada (para que la Defensa 3 marque fail correctamente)", async () => {
  const store = makeStore({
    receivingAccounts: [{ accountNumber: "9998887777", alias: "Otro Negocio" }],
  });
  const gateway = makeApprovalGateway(false);

  const result = await gatherVerificationContext(store, gateway, {
    voucherId: "v1",
    nowUtc: "2026-07-05T15:40:00.000Z",
  });

  assert.equal(result.input.context.business.declaredAccountLast4, "9998887777");
  assert.equal(result.input.context.business.declaredBeneficiary, "Otro Negocio");
});

test("mapea BankEmail (status PARSED) dentro de la ventana a ParsedBankEmail, filtra fuera de ventana e incompletos", async () => {
  const matching: VerificationBankEmailRecord = {
    bank: "BANCOLOMBIA",
    amountCents: 5_000_000,
    approvalNumber: "1234567",
    occurredAt: new Date("2026-07-05T15:35:00.000Z"),
    destinationAccount: "3001234567",
  };
  const outOfWindow: VerificationBankEmailRecord = {
    bank: "BANCOLOMBIA",
    amountCents: 5_000_000,
    approvalNumber: "9999999",
    occurredAt: new Date("2026-07-05T10:00:00.000Z"), // muy lejos del pago
    destinationAccount: "3001234567",
  };
  const incomplete: VerificationBankEmailRecord = {
    bank: "BANCOLOMBIA",
    amountCents: null,
    approvalNumber: null,
    occurredAt: new Date("2026-07-05T15:36:00.000Z"),
    destinationAccount: null,
  };

  const store = makeStore({ bankEmails: [matching, outOfWindow, incomplete] });
  const gateway = makeApprovalGateway(false);

  const result = await gatherVerificationContext(store, gateway, {
    voucherId: "v1",
    nowUtc: "2026-07-05T15:40:00.000Z",
  });

  assert.equal(result.input.context.receivedBankEmails.length, 1);
  const [email] = result.input.context.receivedBankEmails;
  assert.equal(email?.bank, "BANCOLOMBIA");
  assert.equal(email?.amount, 5_000_000);
  assert.equal(email?.approvalNumber, "1234567");
  assert.equal(email?.occurredAtUtc, "2026-07-05T15:35:00.000Z");
  assert.equal(email?.destinationAccount, "3001234567");
});

test("si la consulta a la base global de aprobaciones falla: approvalNumberSeenGlobally queda undefined y se notifica al callback (no penaliza, D4)", async () => {
  const store = makeStore({});
  const gateway = makeApprovalGateway(() => {
    throw new Error("timeout de la función SQL");
  });

  const errors: unknown[] = [];
  const result = await gatherVerificationContext(
    store,
    gateway,
    { voucherId: "v1", nowUtc: "2026-07-05T15:40:00.000Z" },
    (error) => errors.push(error),
  );

  assert.equal(result.input.context.approvalNumberSeenGlobally, undefined);
  assert.equal(errors.length, 1);
});

test("voucher sin todos los campos extraídos por OCR: lanza (no se puede verificar)", async () => {
  const incompleteVoucher: VerificationVoucherRecord = { ...BASE_VOUCHER, approvalNumber: null };
  const store = makeStore({ voucher: incompleteVoucher });
  const gateway = makeApprovalGateway(false);

  await assert.rejects(
    () => gatherVerificationContext(store, gateway, { voucherId: "v1", nowUtc: "2026-07-05T15:40:00.000Z" }),
    /no tiene todos los campos extraídos/,
  );
});
