import { Injectable } from "@nestjs/common";
import type { Prisma, VerdictStatus } from "@prisma/client";

import { TenantService } from "../tenant/tenant.service";

/** Transacción tal como la consume el dashboard (histórico/alertas). Dinero en centavos. */
export interface DashboardTransactionDto {
  id: string;
  verdict: VerdictStatus;
  amountCents: number;
  approvalNumber: string | null;
  createdAt: string;
  resolvedAt: string | null;
  /**
   * Id de la cuenta receptora (`ReceivingAccount`) inferido del `destinationAccount` del
   * voucher (match por número de cuenta). `null` si el OCR no capturó la cuenta o no coincide
   * con ninguna cuenta configurada del negocio.
   */
  accountId: string | null;
}

/** Filtros server-side del listado (gap #8). Todos opcionales; se combinan con AND. */
export interface ListTransactionsFilters {
  /** Veredictos a incluir. Vacío/omitido = todos. */
  verdicts?: VerdictStatus[];
  /** Fecha desde (ISO, inclusive) sobre `createdAt`. */
  from?: Date;
  /** Fecha hasta (ISO, inclusive) sobre `createdAt`. */
  to?: Date;
  /** Id de cuenta receptora (`ReceivingAccount.id`). */
  accountId?: string;
}

/** Fila que Prisma devuelve para el mapeo a DTO. */
interface TransactionRow {
  id: string;
  verdict: VerdictStatus;
  amountCents: number;
  approvalNumber: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  voucher: { destinationAccount: string | null } | null;
}

/**
 * Subconjunto del cliente RLS-scoped que este servicio necesita dentro de `runAsTenant`.
 * Tipado explícito para poder inyectar un fake en tests unitarios sin BD real.
 */
export interface TransactionsTxClient {
  transaction: {
    findMany(args: {
      where: Prisma.TransactionWhereInput;
      select: {
        id: true;
        verdict: true;
        amountCents: true;
        approvalNumber: true;
        createdAt: true;
        resolvedAt: true;
        voucher: { select: { destinationAccount: true } };
      };
      orderBy: { createdAt: "desc" };
    }): Promise<TransactionRow[]>;
  };
  receivingAccount: {
    findMany(args: {
      select: { id: true; accountNumber: true };
    }): Promise<Array<{ id: string; accountNumber: string }>>;
  };
}

/** Interfaz mínima de `TenantService` para poder mockear en tests. */
export interface TenantRunner {
  runAsTenant<T>(businessId: string, fn: (tx: TransactionsTxClient) => Promise<T>): Promise<T>;
}

/**
 * Gap #8: listado autenticado de transacciones del negocio del usuario. Corre SIEMPRE dentro
 * de `TenantService.runAsTenant` (fija el claim `business_id` y el rol `authenticated`), así
 * la RLS de la Épica 2 garantiza el aislamiento server-side además del scoping en código.
 *
 * Los filtros (estado, rango de fecha, cuenta) se aplican en la BD. La `accountId` se resuelve
 * cruzando el `destinationAccount` del voucher (texto del OCR) con el `accountNumber` de las
 * `ReceivingAccount` del negocio; se hace en memoria porque Prisma no relaciona ambos por FK.
 */
@Injectable()
export class TransactionsService {
  constructor(private readonly tenant: TenantService) {}

  async list(
    businessId: string,
    filters: ListTransactionsFilters = {},
  ): Promise<DashboardTransactionDto[]> {
    return (this.tenant as unknown as TenantRunner).runAsTenant(businessId, async (tx) => {
      const accounts = await tx.receivingAccount.findMany({
        select: { id: true, accountNumber: true },
      });
      // Mapa numero-de-cuenta → id, para inferir la cuenta receptora de cada voucher.
      const accountByNumber = new Map(accounts.map((a) => [a.accountNumber, a.id]));

      // Si se filtra por cuenta, traducimos el id de cuenta a su número para acotar por el
      // `destinationAccount` del voucher directamente en la BD.
      const wantedAccount = filters.accountId
        ? accounts.find((a) => a.id === filters.accountId)
        : undefined;
      // accountId presente pero desconocido para el negocio ⇒ ninguna coincidencia posible.
      if (filters.accountId && !wantedAccount) return [];

      const where: Prisma.TransactionWhereInput = {};
      if (filters.verdicts && filters.verdicts.length > 0) {
        where.verdict = { in: filters.verdicts };
      }
      if (filters.from || filters.to) {
        where.createdAt = {
          ...(filters.from ? { gte: filters.from } : {}),
          ...(filters.to ? { lte: filters.to } : {}),
        };
      }
      if (wantedAccount) {
        where.voucher = { destinationAccount: wantedAccount.accountNumber };
      }

      const rows = await tx.transaction.findMany({
        where,
        select: {
          id: true,
          verdict: true,
          amountCents: true,
          approvalNumber: true,
          createdAt: true,
          resolvedAt: true,
          voucher: { select: { destinationAccount: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return rows.map((row) => ({
        id: row.id,
        verdict: row.verdict,
        amountCents: row.amountCents,
        approvalNumber: row.approvalNumber,
        createdAt: row.createdAt.toISOString(),
        resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
        accountId: row.voucher?.destinationAccount
          ? (accountByNumber.get(row.voucher.destinationAccount) ?? null)
          : null,
      }));
    });
  }
}
