import { BankEmailStatus, IssuerBank } from "@check/database";
import type { ExtractedVoucher } from "@check/ocr";
import type { ParsedBankEmail } from "@check/parsers";
import { toCents } from "@check/shared";
import type { DefenseContext, DefenseInput } from "@check/verifier";

import type { ApprovalNumberGateway } from "./verification.approval-gateway";

/**
 * Gatherer de contexto de verificación (E06-T12): arma el `DefenseInput`/`DefenseContext`
 * completo que necesita `runDefenses(allDefenses, input)` (`@check/verifier`) a partir de
 * un `voucherId` ya procesado por OCR (Épica 5, `ocrStatus: PROCESSED`).
 *
 * Deudas explícitas (documentadas también en el reporte de la tarea):
 * - `imageBytes` no se puebla (queda `undefined`): la Defensa 5 (análisis forense de
 *   imagen, E06-T7) emitirá `not_applicable` en todas las verificaciones de este worker
 *   — por diseño (D4) esto no penaliza el veredicto. Requeriría re-descargar la imagen
 *   de Storage en este worker (`StorageModule` ya existe); se pospone para no ampliar
 *   el scope de esta tarea.
 * - `recentFailedAttemptsByClient` queda siempre `undefined`: no existe todavía ningún
 *   canal con identidad de cliente (WhatsApp es Épica 7, aún no implementada). La
 *   Defensa 7 ya trata `undefined` como 0 intentos (no penaliza).
 * - `Business` (`packages/database/prisma/schema.prisma`) todavía no tiene columnas de
 *   configuración (`verificationWindowMinutes`, `failedAttemptsThreshold`): se usa un
 *   valor por defecto hardcodeado (`DEFAULT_VERIFICATION_WINDOW_MINUTES`) en vez de
 *   agregar una migración, para mantener esta tarea acotada. `failedAttemptsThreshold`
 *   se deja `undefined` a propósito: la Defensa 7 ya cae a su propio default
 *   (`DEFAULT_FAILED_ATTEMPTS_THRESHOLD`) cuando no se configura.
 * - `declaredBeneficiary` se puebla desde `ReceivingAccount.alias` (apodo de cuenta),
 *   la única columna disponible hoy que se le parece a un nombre declarado — no es
 *   necesariamente el nombre legal del beneficiario. No existe todavía un campo
 *   dedicado en el schema.
 */

/** Ventana de verificación (minutos) por defecto mientras `Business` no tenga esta
 * configuración persistida (ver deuda documentada arriba). */
export const DEFAULT_VERIFICATION_WINDOW_MINUTES = 15;

/** Traduce el enum `IssuerBank` de Prisma (mayúsculas, ej. `"NEQUI"`) al identificador
 * en minúsculas que usan `ExtractedVoucher.issuerBank`/las defensas (ej. Defensa 6,
 * `structuralDefense`) y la base global de aprobaciones (`ApprovalNumberGateway`). Es
 * el inverso de `ISSUER_BANK_MAP` en `apps/workers/src/ocr/ocr.service.ts`. */
const ISSUER_BANK_TO_SLUG: Readonly<Record<IssuerBank, string>> = {
  [IssuerBank.NEQUI]: "nequi",
  [IssuerBank.BANCOLOMBIA]: "bancolombia",
  [IssuerBank.DAVIPLATA]: "daviplata",
  [IssuerBank.DAVIVIENDA]: "davivienda",
  [IssuerBank.BBVA]: "bbva",
  [IssuerBank.BANCO_DE_BOGOTA]: "banco_de_bogota",
  [IssuerBank.COLPATRIA]: "colpatria",
};

/** Registro `Voucher` mínimo que este gatherer necesita leer (campos ya extraídos por
 * el OCR de la Épica 5; deben estar todos presentes para poder verificar). */
export interface VerificationVoucherRecord {
  readonly id: string;
  readonly businessId: string;
  readonly issuerBank: IssuerBank | null;
  readonly amountCents: number | null;
  readonly approvalNumber: string | null;
  readonly paidAt: Date | null;
  readonly destinationAccount: string | null;
  readonly beneficiary: string | null;
}

/** Registro `ReceivingAccount` mínimo (cuenta declarada por el negocio, Épica 3). */
export interface VerificationReceivingAccountRecord {
  readonly accountNumber: string;
  readonly alias: string | null;
}

/** Registro `BankEmail` mínimo (correo ya parseado, Épica 4). */
export interface VerificationBankEmailRecord {
  readonly bank: string | null;
  readonly amountCents: number | null;
  readonly approvalNumber: string | null;
  readonly occurredAt: Date | null;
  readonly destinationAccount: string | null;
}

/** Subconjunto de `PrismaClient` que el gatherer necesita (duck-typed, mismo patrón que
 * `VoucherStore` en `apps/workers/src/ocr/ocr.service.ts` — permite inyectar un fake en
 * tests unitarios sin depender de una BD real). */
export interface VerificationContextStore {
  voucher: {
    findUniqueOrThrow(args: { where: { id: string } }): Promise<VerificationVoucherRecord>;
  };
  receivingAccount: {
    findMany(args: {
      where: { businessId: string };
    }): Promise<VerificationReceivingAccountRecord[]>;
  };
  bankEmail: {
    findMany(args: {
      where: {
        businessId: string;
        status: BankEmailStatus;
        occurredAt: { gte: Date; lte: Date };
      };
    }): Promise<VerificationBankEmailRecord[]>;
  };
}

/** Entrada de `gatherVerificationContext`. */
export interface GatherVerificationContextInput {
  readonly voucherId: string;
  /** "Ahora" inyectado por el llamador (worker) — nunca `Date.now()` real aquí. */
  readonly nowUtc: string;
  /** Override de la ventana de verificación (minutos); si se omite, usa
   * `DEFAULT_VERIFICATION_WINDOW_MINUTES` (ver deuda documentada arriba). */
  readonly verificationWindowMinutes?: number;
  /** Deuda: siempre `undefined` hasta que exista un canal con identidad de cliente
   * (Épica 7). Parametrizado para no cerrar la puerta a poblarlo más adelante. */
  readonly recentFailedAttemptsByClient?: number;
}

/** Resultado de `gatherVerificationContext`: el `DefenseInput` listo para
 * `runDefenses`, más los datos que necesita `persistVerdict`/`ApprovalNumberGateway`. */
export interface GatheredVerification {
  readonly input: DefenseInput;
  readonly businessId: string;
  readonly amountCents: number;
  readonly approvalNumber?: string;
  /** Identificador de banco emisor en minúsculas (ver `ISSUER_BANK_TO_SLUG`), para
   * registrar el número de aprobación tras un veredicto `VERIFIED`. */
  readonly issuerBankSlug?: string;
}

/** Deja solo dígitos y toma los últimos 4 (para comparar cuentas de distinto largo/formato). */
function last4Digits(raw: string): string | undefined {
  const digitsOnly = raw.replace(/\D/g, "");
  return digitsOnly.length > 0 ? digitsOnly.slice(-4) : undefined;
}

/** Elige, entre las cuentas receptoras declaradas por el negocio, la que mejor
 * representa "lo declarado" para comparar contra el comprobante (Defensa 3): la que
 * coincide por últimos 4 dígitos si existe, o la primera configurada en su defecto
 * (para que un comprobante hacia una cuenta ajena siga marcando `fail` correctamente). */
function selectDeclaredAccount(
  accounts: readonly VerificationReceivingAccountRecord[],
  voucherDestinationAccount: string,
): { last4: string | undefined; beneficiary: string | undefined } {
  if (accounts.length === 0) {
    return { last4: undefined, beneficiary: undefined };
  }

  const voucherLast4 = last4Digits(voucherDestinationAccount);
  const matching = voucherLast4
    ? accounts.find((account) => last4Digits(account.accountNumber) === voucherLast4)
    : undefined;
  const chosen = matching ?? accounts[0];

  return { last4: chosen?.accountNumber, beneficiary: chosen?.alias ?? undefined };
}

/** Mapea filas `BankEmail` (status `PARSED`) a `ParsedBankEmail` (`@check/parsers`),
 * descartando defensivamente filas incompletas (no deberían existir con `status:
 * PARSED`, pero el tipo de columna es nullable en el schema). */
function toParsedBankEmails(rows: readonly VerificationBankEmailRecord[]): ParsedBankEmail[] {
  const emails: ParsedBankEmail[] = [];
  for (const row of rows) {
    if (
      row.amountCents === null ||
      row.approvalNumber === null ||
      row.occurredAt === null ||
      row.destinationAccount === null
    ) {
      continue;
    }
    emails.push({
      bank: row.bank ?? "unknown",
      amount: toCents(row.amountCents),
      approvalNumber: row.approvalNumber,
      occurredAtUtc: row.occurredAt.toISOString(),
      destinationAccount: row.destinationAccount,
    });
  }
  return emails;
}

/**
 * Arma el `DefenseInput` completo para un `voucherId` ya procesado por OCR:
 * 1. Lee el `Voucher` (falla si le faltan campos extraídos: no se puede verificar un
 *    comprobante sin OCR exitoso).
 * 2. Lee las `ReceivingAccount` del negocio para poblar `declaredAccountLast4`/
 *    `declaredBeneficiary` (Defensa 3).
 * 3. Lee los `BankEmail` ya parseados (`status: PARSED`) del negocio dentro de una
 *    ventana generosa alrededor del pago, para poblar `receivedBankEmails` (Defensa 1).
 * 4. Consulta la base global de aprobaciones (`ApprovalNumberGateway.exists`) para
 *    poblar `approvalNumberSeenGlobally` (Defensa 2); si la consulta falla, se deja
 *    `undefined` (no penaliza, D4 extendido — ver `global-approvals.ts`) y se relanza
 *    para que el llamador decida cómo loggear/alertar.
 */
export async function gatherVerificationContext(
  store: VerificationContextStore,
  approvalNumbers: ApprovalNumberGateway,
  input: GatherVerificationContextInput,
  onApprovalCheckError?: (error: unknown) => void,
): Promise<GatheredVerification> {
  const voucher = await store.voucher.findUniqueOrThrow({ where: { id: input.voucherId } });

  if (
    voucher.issuerBank === null ||
    voucher.amountCents === null ||
    voucher.approvalNumber === null ||
    voucher.paidAt === null ||
    voucher.destinationAccount === null ||
    voucher.beneficiary === null
  ) {
    throw new Error(
      `Voucher ${input.voucherId} no tiene todos los campos extraídos por OCR; no se puede verificar`,
    );
  }

  const windowMinutes = input.verificationWindowMinutes ?? DEFAULT_VERIFICATION_WINDOW_MINUTES;
  const issuerBankSlug = ISSUER_BANK_TO_SLUG[voucher.issuerBank];

  const receivingAccounts = await store.receivingAccount.findMany({
    where: { businessId: voucher.businessId },
  });
  const declared = selectDeclaredAccount(receivingAccounts, voucher.destinationAccount);

  // Margen generoso (2x la ventana de verificación) para capturar correos cercanos al
  // pago sin depender de que el reloj del cliente/banco esté perfectamente sincronizado;
  // el match exacto de ±windowMinutes lo aplica igualmente `emailMatchDefense`.
  const bankEmailMarginMs = windowMinutes * 60_000 * 2;
  const bankEmails = await store.bankEmail.findMany({
    where: {
      businessId: voucher.businessId,
      status: BankEmailStatus.PARSED,
      occurredAt: {
        gte: new Date(voucher.paidAt.getTime() - bankEmailMarginMs),
        lte: new Date(voucher.paidAt.getTime() + bankEmailMarginMs),
      },
    },
  });
  const receivedBankEmails = toParsedBankEmails(bankEmails);

  let approvalNumberSeenGlobally: boolean | undefined;
  try {
    approvalNumberSeenGlobally = await approvalNumbers.exists(issuerBankSlug, voucher.approvalNumber);
  } catch (error) {
    approvalNumberSeenGlobally = undefined;
    onApprovalCheckError?.(error);
  }

  const extractedVoucher: ExtractedVoucher = {
    issuerBank: issuerBankSlug,
    amount: toCents(voucher.amountCents),
    approvalNumber: voucher.approvalNumber,
    paidAtUtc: voucher.paidAt.toISOString(),
    destinationAccount: voucher.destinationAccount,
    beneficiary: voucher.beneficiary,
  };

  const context: DefenseContext = {
    business: {
      businessId: voucher.businessId,
      declaredAccountLast4: declared.last4,
      declaredBeneficiary: declared.beneficiary,
      verificationWindowMinutes: windowMinutes,
    },
    receivedBankEmails,
    approvalNumberSeenGlobally,
    recentFailedAttemptsByClient: input.recentFailedAttemptsByClient,
    nowUtc: input.nowUtc,
  };

  return {
    input: { voucher: extractedVoucher, context },
    businessId: voucher.businessId,
    amountCents: voucher.amountCents,
    approvalNumber: voucher.approvalNumber,
    issuerBankSlug,
  };
}
