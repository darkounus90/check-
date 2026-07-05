import type { VerdictStatus } from "@check/database";
import type { Verdict } from "@check/verifier";
import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";

/**
 * Registro `Transaction` mínimo que este servicio necesita leer de vuelta tras el
 * `upsert` (E06-T11).
 */
export interface TransactionRecord {
  readonly id: string;
}

/** Fila persistida de `EvidenceSource` (forma que este servicio escribe, sin lo leído de vuelta). */
export interface EvidenceSourceCreateData {
  readonly transactionId: string;
  readonly kind: string;
  readonly passed: boolean;
  readonly detail: string | null;
}

/** Fila persistida de `MoneyOpLog` (snapshot inmutable, append-only). */
export interface MoneyOpLogCreateData {
  readonly businessId: string;
  readonly transactionId: string;
  readonly verdict: VerdictStatus;
  readonly evidenceSources: ReadonlyArray<{
    readonly kind: string;
    readonly passed: boolean;
    readonly detail: string | null;
  }>;
}

/**
 * Subconjunto de `Prisma.TransactionClient` (dentro de un `$transaction`) que este
 * servicio necesita. Permite inyectar un fake en tests unitarios sin depender de una
 * BD real; `PrismaService` lo satisface estructuralmente (mismo patrón que `VoucherStore`
 * en `apps/workers/src/ocr/ocr.service.ts`).
 */
export interface VerificationTransactionClient {
  transaction: {
    upsert(args: {
      where: { voucherId: string };
      create: {
        businessId: string;
        voucherId: string;
        verdict: VerdictStatus;
        amountCents: number;
        approvalNumber?: string;
        resolvedAt: Date | null;
      };
      update: {
        verdict: VerdictStatus;
        amountCents: number;
        approvalNumber?: string;
        resolvedAt: Date | null;
      };
    }): Promise<TransactionRecord>;
  };
  evidenceSource: {
    deleteMany(args: { where: { transactionId: string } }): Promise<unknown>;
    createMany(args: { data: EvidenceSourceCreateData[] }): Promise<unknown>;
  };
  moneyOpLog: {
    create(args: { data: MoneyOpLogCreateData }): Promise<{ id: string }>;
  };
}

/**
 * Subconjunto de `PrismaClient` que este servicio necesita: únicamente `$transaction`,
 * para que la escritura de `Transaction` + `EvidenceSource` + `MoneyOpLog` sea atómica
 * (todo o nada).
 */
export interface VerificationStore {
  $transaction<T>(fn: (tx: VerificationTransactionClient) => Promise<T>): Promise<T>;
}

/** Entrada de `persistVerdict` (E06-T11). */
export interface PersistVerdictInput {
  readonly businessId: string;
  readonly voucherId: string;
  readonly amountCents: number;
  readonly approvalNumber?: string;
  readonly verdict: Verdict;
  /**
   * Momento (ISO UTC) usado como `resolvedAt` cuando el veredicto ya no es `PENDING`,
   * inyectado por el llamador (worker, E06-T12) para determinismo en tests — mismo
   * principio que `nowUtc` en `packages/verifier`. Si se omite, se usa el reloj real
   * (este servicio es el borde impuro que toca la BD, no una `Defense` pura).
   */
  readonly nowUtc?: string;
}

/** Resultado de `persistVerdict`: ids de las filas afectadas, útiles para logging/tests. */
export interface PersistVerdictResult {
  readonly transactionId: string;
  readonly moneyOpLogId: string;
}

/**
 * Mapea las `EvidenceSource` del `Verdict` (forma `@check/verifier`) a la forma que
 * espera Prisma para `EvidenceSource.detail` (`Json?` en el schema, aquí una columna
 * más simple `string | null`).
 *
 * Nota sobre `passed`: el mapeo de `DefenseSignal.outcome` ("pass"/"fail"/"not_applicable")
 * a este booleano ya ocurre en `packages/verifier/src/aggregate.ts` (`aggregateSignals`):
 * `passed: outcome !== "fail"`, es decir tanto `"pass"` como `"not_applicable"` guardan
 * `passed: true` (D4 — "no aplica" no penaliza, no es una falla auditable). El matiz de
 * `"not_applicable"` se preserva en `detail` (texto legible), no en la columna `passed`.
 */
function toEvidenceSourceRows(
  transactionId: string,
  evidenceSources: Verdict["evidenceSources"],
): EvidenceSourceCreateData[] {
  return evidenceSources.map((source) => ({
    transactionId,
    kind: source.kind,
    passed: source.passed,
    detail: source.detail ?? null,
  }));
}

/**
 * Persiste un `Verdict` ya calculado (E06-T1/E06-T10) en la base de datos (E06-T11):
 *
 * 1. `upsert` de `Transaction` por `voucherId` (clave única del schema): crea la fila si
 *    es la primera evaluación de este comprobante, o actualiza `verdict`/`amountCents`/
 *    `approvalNumber`/`resolvedAt` si ya existía (ej. reintento tras espera de correo,
 *    E06-T2). `resolvedAt` se fija solo cuando `verdict.status !== "PENDING"`.
 * 2. Reemplaza las `EvidenceSource` de esa `Transaction` (borra las anteriores, crea las
 *    nuevas): `Transaction.evidenceSources` queda como la foto más reciente del estado.
 * 3. Inserta una fila **nueva** en `MoneyOpLog` (nunca actualiza una existente): es el
 *    log inmutable/append-only. Si el mismo comprobante se reevalúa (ej. `PENDING` →
 *    `VERIFIED` tras un reintento), esa reevaluación agrega una fila nueva, no reemplaza
 *    la anterior — así queda cada veredicto emitido como entrada auditable independiente.
 *
 * Los tres pasos ocurren dentro de una única `prisma.$transaction`: todo o nada. No hay
 * deduplicación entre llamadas concurrentes para el mismo `voucherId` (dos verificaciones
 * en paralelo sobre el mismo comprobante podrían producir dos filas de `MoneyOpLog`);
 * serializar por `voucherId` es responsabilidad del llamador (worker, E06-T12).
 */
export async function persistVerdict(
  prisma: VerificationStore,
  input: PersistVerdictInput,
): Promise<PersistVerdictResult> {
  const { businessId, voucherId, amountCents, approvalNumber, verdict } = input;
  const resolvedAt = verdict.status === "PENDING" ? null : new Date(input.nowUtc ?? Date.now());

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.upsert({
      where: { voucherId },
      create: {
        businessId,
        voucherId,
        verdict: verdict.status,
        amountCents,
        ...(approvalNumber !== undefined ? { approvalNumber } : {}),
        resolvedAt,
      },
      update: {
        verdict: verdict.status,
        amountCents,
        ...(approvalNumber !== undefined ? { approvalNumber } : {}),
        resolvedAt,
      },
    });

    await tx.evidenceSource.deleteMany({ where: { transactionId: transaction.id } });
    await tx.evidenceSource.createMany({
      data: toEvidenceSourceRows(transaction.id, verdict.evidenceSources),
    });

    const moneyOpLog = await tx.moneyOpLog.create({
      data: {
        businessId,
        transactionId: transaction.id,
        verdict: verdict.status,
        evidenceSources: toEvidenceSourceRows(transaction.id, verdict.evidenceSources).map(
          ({ kind, passed, detail }) => ({ kind, passed, detail }),
        ),
      },
    });

    return { transactionId: transaction.id, moneyOpLogId: moneyOpLog.id };
  });
}

/**
 * Wrapper `@Injectable` de `persistVerdict` (E06-T11), listo para inyección en el
 * futuro worker de verificación (E06-T12) — mismo patrón que `OcrService` en
 * `apps/workers/src/ocr/ocr.service.ts`.
 */
@Injectable()
export class VerificationService {
  constructor(@Inject(PrismaService) private readonly prisma: VerificationStore) {}

  persistVerdict(input: PersistVerdictInput): Promise<PersistVerdictResult> {
    return persistVerdict(this.prisma, input);
  }
}
