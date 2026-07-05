import assert from "node:assert/strict";
import { before, test } from "node:test";

import { BankEmailStatus, IssuerBank } from "@check/database";

import type { ApprovalNumberGateway } from "../src/verification/verification.approval-gateway";
import type {
  VerificationBankEmailRecord,
  VerificationContextStore,
  VerificationReceivingAccountRecord,
  VerificationVoucherRecord,
} from "../src/verification/verification.context";
import type { VerificationProcessorService as VerificationProcessorServiceClass } from "../src/verification/verification.processor";
import type { VerificationRetryScheduler } from "../src/verification/verification.queue";
import type {
  EvidenceSourceCreateData,
  MoneyOpLogCreateData,
  TransactionRecord,
  VerificationService as VerificationServiceClass,
  VerificationStore,
  VerificationTransactionClient,
} from "../src/verification/verification.service";

/**
 * `VerificationProcessorService` importa (a nivel de módulo) `VerificationQueueService`
 * (`verification.queue.ts`), que a su vez importa `../env` — el singleton `env` valida
 * variables de entorno reales al cargar el módulo. Se cargan ambas clases con `import()`
 * dinámico tras poner variables dummy en `process.env` (mismo problema/solución que
 * `test/env.test.ts`), para no requerir Redis/Supabase real en este test unitario.
 */
let VerificationProcessorService: typeof VerificationProcessorServiceClass;
let VerificationService: typeof VerificationServiceClass;

before(async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/check";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "dummy-secret";

  ({ VerificationProcessorService } = await import("../src/verification/verification.processor"));
  ({ VerificationService } = await import("../src/verification/verification.service"));
});

/**
 * Tests de integración del flujo completo de verificación (E06-T12): gatherer de
 * contexto + las 7 defensas REALES de `@check/verifier` (sin mocks) + persistencia
 * (`VerificationService`, E06-T11) + reintento (`retryPendingVerification`,
 * `packages/verifier/src/state-machine.ts`).
 *
 * No requiere BullMQ/Redis real: el "paso del tiempo" y el reintento se simulan
 * llamando directamente `processor.retry(...)` con un reloj fake inyectado
 * (`VERIFICATION_CLOCK`), en vez de esperar un job programado en una cola real.
 */

/** Prisma fake/duck-typed para el gatherer (mismo patrón que `verification.context.test.ts`). */
function makeContextStore(state: {
  voucher: VerificationVoucherRecord;
  receivingAccounts: VerificationReceivingAccountRecord[];
  bankEmails: VerificationBankEmailRecord[];
}): VerificationContextStore {
  return {
    voucher: {
      async findUniqueOrThrow({ where }) {
        if (where.id !== state.voucher.id) throw new Error(`voucher no encontrado: ${where.id}`);
        return state.voucher;
      },
    },
    receivingAccount: {
      async findMany({ where }) {
        return where.businessId === state.voucher.businessId ? state.receivingAccounts : [];
      },
    },
    bankEmail: {
      async findMany({ where }) {
        if (where.businessId !== state.voucher.businessId || where.status !== BankEmailStatus.PARSED) {
          return [];
        }
        return state.bankEmails.filter((email) => {
          if (!email.occurredAt) return false;
          return (
            email.occurredAt >= where.occurredAt.gte && email.occurredAt <= where.occurredAt.lte
          );
        });
      },
    },
  };
}

/** `ApprovalNumberGateway` fake: nunca ve el número como reutilizado, registra en un
 * arreglo en memoria para poder verificar que se llamó tras un veredicto VERIFIED. */
function makeApprovalGateway(): { gateway: ApprovalNumberGateway; registered: string[] } {
  const registered: string[] = [];
  const gateway: ApprovalNumberGateway = {
    async exists() {
      return false;
    },
    async register(bank, approvalNumber) {
      registered.push(`${bank}:${approvalNumber}`);
    },
  };
  return { gateway, registered };
}

/** `VerificationStore` fake en memoria (mismo patrón que `verification.service.test.ts`). */
function makeVerificationStore(): {
  store: VerificationStore;
  transactions: Array<TransactionRecord & { verdict: string; resolvedAt: Date | null }>;
  moneyOpLogs: MoneyOpLogCreateData[];
} {
  const transactions: Array<TransactionRecord & { verdict: string; resolvedAt: Date | null }> = [];
  const moneyOpLogs: MoneyOpLogCreateData[] = [];

  const tx: VerificationTransactionClient = {
    transaction: {
      async upsert({ where, create, update }) {
        const existing = transactions.find(
          (t) => t.id === `txn-${where.voucherId}` /* mismo voucherId => mismo id */,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = {
          id: `txn-${where.voucherId}`,
          verdict: create.verdict,
          resolvedAt: create.resolvedAt,
        };
        transactions.push(row);
        return row;
      },
    },
    evidenceSource: {
      async deleteMany() {
        return { count: 0 };
      },
      async createMany(args: { data: EvidenceSourceCreateData[] }) {
        return { count: args.data.length };
      },
    },
    moneyOpLog: {
      async create({ data }) {
        const id = `log${moneyOpLogs.length + 1}`;
        moneyOpLogs.push(data);
        return { id };
      },
    },
  };

  const store: VerificationStore = {
    async $transaction(fn) {
      return fn(tx);
    },
  };

  return { store, transactions, moneyOpLogs };
}

function makeScheduler(): { scheduler: VerificationRetryScheduler; scheduled: Array<{ voucherId: string; pendingSinceUtc: string; delayMs: number }> } {
  const scheduled: Array<{ voucherId: string; pendingSinceUtc: string; delayMs: number }> = [];
  const scheduler: VerificationRetryScheduler = {
    async scheduleRetry(voucherId, pendingSinceUtc, delayMs) {
      scheduled.push({ voucherId, pendingSinceUtc, delayMs });
    },
  };
  return { scheduler, scheduled };
}

const PAID_AT = new Date("2026-07-05T15:30:00.000Z");

const BASE_VOUCHER: VerificationVoucherRecord = {
  id: "v1",
  businessId: "biz1",
  issuerBank: IssuerBank.NEQUI,
  amountCents: 5_000_000,
  approvalNumber: "1234567",
  paidAt: PAID_AT,
  destinationAccount: "3001234567",
  beneficiary: "Panaderia Ejemplo",
};

test("escenario 1: PENDING (sin correo aún) -> el correo llega dentro de la ventana -> reintento resuelve a VERIFIED", async () => {
  const bankEmails: VerificationBankEmailRecord[] = [];
  const contextStore = makeContextStore({
    voucher: BASE_VOUCHER,
    receivingAccounts: [{ accountNumber: "3001234567", alias: "Panaderia Ejemplo" }],
    bankEmails,
  });
  const { gateway, registered } = makeApprovalGateway();
  const { store, transactions, moneyOpLogs } = makeVerificationStore();
  const verificationService = new VerificationService(store);
  const { scheduler, scheduled } = makeScheduler();

  let now = "2026-07-05T15:31:00.000Z"; // +1 min: aún no llega el correo
  const clock = () => now;

  const processor = new VerificationProcessorService(
    contextStore,
    gateway,
    verificationService,
    scheduler,
    clock,
  );

  const firstVerdict = await processor.process("v1");
  assert.equal(firstVerdict.status, "PENDING");
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0]?.verdict, "PENDING");
  assert.equal(moneyOpLogs.length, 1);
  assert.equal(scheduled.length, 1);
  const pendingSinceUtc = scheduled[0]?.pendingSinceUtc;
  assert.equal(pendingSinceUtc, "2026-07-05T15:31:00.000Z");

  // El correo real del banco receptor llega, dentro de la ventana (±15 min por defecto).
  bankEmails.push({
    bank: "BANCOLOMBIA",
    amountCents: BASE_VOUCHER.amountCents,
    approvalNumber: BASE_VOUCHER.approvalNumber,
    occurredAt: new Date("2026-07-05T15:35:00.000Z"),
    destinationAccount: BASE_VOUCHER.destinationAccount,
  });

  now = "2026-07-05T15:36:00.000Z"; // +6 min: dentro de la ventana de espera (pendingSince +1min)
  const retryVerdict = await processor.retry("v1", pendingSinceUtc as string);

  assert.equal(retryVerdict.status, "VERIFIED");
  assert.equal(transactions.length, 1, "misma Transaction, no se crea una segunda fila");
  assert.equal(transactions[0]?.verdict, "VERIFIED");
  assert.ok(transactions[0]?.resolvedAt);
  assert.equal(moneyOpLogs.length, 2, "MoneyOpLog append-only: PENDING + VERIFIED");
  assert.equal(moneyOpLogs[0]?.verdict, "PENDING");
  assert.equal(moneyOpLogs[1]?.verdict, "VERIFIED");
  assert.equal(scheduled.length, 1, "un veredicto final no programa otro reintento");
  assert.deepEqual(registered, ["nequi:1234567"], "VERIFIED registra el número en la base global");
});

test("escenario 2: PENDING (sin correo) -> nunca llega el correo -> reintento tras expirar la ventana resuelve a SUSPICIOUS", async () => {
  const contextStore = makeContextStore({
    voucher: BASE_VOUCHER,
    receivingAccounts: [{ accountNumber: "3001234567", alias: "Panaderia Ejemplo" }],
    bankEmails: [], // el correo real nunca llega en este escenario
  });
  const { gateway, registered } = makeApprovalGateway();
  const { store, transactions, moneyOpLogs } = makeVerificationStore();
  const verificationService = new VerificationService(store);
  const { scheduler, scheduled } = makeScheduler();

  let now = "2026-07-05T15:31:00.000Z"; // +1 min
  const clock = () => now;

  const processor = new VerificationProcessorService(
    contextStore,
    gateway,
    verificationService,
    scheduler,
    clock,
  );

  const firstVerdict = await processor.process("v1");
  assert.equal(firstVerdict.status, "PENDING");
  const pendingSinceUtc = scheduled[0]?.pendingSinceUtc as string;

  // La ventana de verificación por defecto es de 15 minutos; se reintenta bastante
  // después de que expiró, sin que nunca haya llegado un correo real.
  now = "2026-07-05T16:00:00.000Z"; // +30 min: la ventana (desde pendingSinceUtc) ya expiró
  const retryVerdict = await processor.retry("v1", pendingSinceUtc);

  assert.equal(retryVerdict.status, "SUSPICIOUS");
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0]?.verdict, "SUSPICIOUS");
  assert.ok(transactions[0]?.resolvedAt);
  assert.equal(moneyOpLogs.length, 2, "MoneyOpLog append-only: PENDING + SUSPICIOUS");
  assert.equal(moneyOpLogs[0]?.verdict, "PENDING");
  assert.equal(moneyOpLogs[1]?.verdict, "SUSPICIOUS");
  assert.equal(scheduled.length, 1, "un veredicto final (SUSPICIOUS) no programa otro reintento");
  assert.deepEqual(registered, [], "nunca se registra el número: el veredicto no llegó a VERIFIED");
});

test("regla dura end-to-end (gatherer + 7 defensas reales + persistVerdict): un correo real que matchea perfecto pero con approvalNumberSeenGlobally=true nunca persiste VERIFIED", async () => {
  // Mismo patrón que el 'escenario limpio' de packages/verifier/test/wire-defenses.test.ts,
  // pero corrido a través del worker completo (gatherer real -> runDefenses real ->
  // persistVerdict real), para confirmar que la regla dura ("sin Defensa 1 en pass,
  // nunca VERIFIED" y, más general, "cualquier fail baja el veredicto") también se
  // cumple al nivel de persistencia, no solo dentro de `packages/verifier`.
  const bankEmails: VerificationBankEmailRecord[] = [
    {
      bank: "BANCOLOMBIA",
      amountCents: BASE_VOUCHER.amountCents,
      approvalNumber: BASE_VOUCHER.approvalNumber,
      occurredAt: new Date("2026-07-05T15:35:00.000Z"), // dentro de ventana, matchea todo
      destinationAccount: BASE_VOUCHER.destinationAccount,
    },
  ];
  const contextStore = makeContextStore({
    voucher: BASE_VOUCHER,
    receivingAccounts: [{ accountNumber: "3001234567", alias: "Panaderia Ejemplo" }],
    bankEmails,
  });
  // El número de aprobación ya fue visto en la red (reutilización, Defensa 2 falla),
  // aunque el correo real matchee perfecto (Defensa 1 pasa).
  const registered: string[] = [];
  const gateway: ApprovalNumberGateway = {
    async exists() {
      return true;
    },
    async register(bank, approvalNumber) {
      registered.push(`${bank}:${approvalNumber}`);
    },
  };
  const { store, transactions, moneyOpLogs } = makeVerificationStore();
  const verificationService = new VerificationService(store);
  const { scheduler, scheduled } = makeScheduler();

  const clock = () => "2026-07-05T15:36:00.000Z"; // +6 min, dentro de cualquier ventana razonable

  const processor = new VerificationProcessorService(
    contextStore,
    gateway,
    verificationService,
    scheduler,
    clock,
  );

  const verdict = await processor.process("v1");

  assert.equal(verdict.status, "SUSPICIOUS", "una reutilización de aprobación baja el veredicto de inmediato");
  assert.notEqual(verdict.status, "VERIFIED");
  const bankEmailEvidence = verdict.evidenceSources.find((e) => e.kind === "bank_email_match");
  assert.equal(bankEmailEvidence?.passed, true, "la Defensa 1 (correo real) sí pasó en este escenario");
  const globalApprovalEvidence = verdict.evidenceSources.find((e) => e.kind === "global_approval");
  assert.equal(globalApprovalEvidence?.passed, false, "la Defensa 2 (reutilización) es la que falla");

  // La regla dura se cumple también en lo persistido: la Transaction y el MoneyOpLog
  // quedan en SUSPICIOUS, nunca VERIFIED, y no se registra el número reutilizado.
  assert.equal(transactions[0]?.verdict, "SUSPICIOUS");
  assert.equal(moneyOpLogs.length, 1);
  assert.equal(moneyOpLogs[0]?.verdict, "SUSPICIOUS");
  assert.ok(moneyOpLogs.every((log) => log.verdict !== "VERIFIED"));
  assert.equal(scheduled.length, 0, "un veredicto SUSPICIOUS inmediato no programa reintento");
  assert.deepEqual(registered, [], "un veredicto SUSPICIOUS nunca registra el número de aprobación");
});

test("segundo reintento sigue PENDING (dentro de ventana, correo aún no llega): se reprograma otro reintento", async () => {
  const contextStore = makeContextStore({
    voucher: BASE_VOUCHER,
    receivingAccounts: [],
    bankEmails: [],
  });
  const { gateway } = makeApprovalGateway();
  const { store, transactions } = makeVerificationStore();
  const verificationService = new VerificationService(store);
  const { scheduler, scheduled } = makeScheduler();

  let now = "2026-07-05T15:31:00.000Z";
  const clock = () => now;
  const processor = new VerificationProcessorService(
    contextStore,
    gateway,
    verificationService,
    scheduler,
    clock,
  );

  await processor.process("v1");
  const pendingSinceUtc = scheduled[0]?.pendingSinceUtc as string;

  now = "2026-07-05T15:33:00.000Z"; // +3 min desde pendingSinceUtc, aún dentro de la ventana de 15 min
  const verdict = await processor.retry("v1", pendingSinceUtc);

  assert.equal(verdict.status, "PENDING");
  assert.equal(transactions[0]?.resolvedAt, null);
  assert.equal(scheduled.length, 2, "se programa un segundo reintento");
  assert.equal(scheduled[1]?.pendingSinceUtc, pendingSinceUtc, "conserva el pendingSinceUtc original");
});
