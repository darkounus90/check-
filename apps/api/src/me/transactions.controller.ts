import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { VerdictStatus } from "@prisma/client";

import { CurrentTenant } from "../auth/current-tenant.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import type { TenantContext } from "../tenant/tenant.service";
import {
  type DashboardTransactionDto,
  type ListTransactionsFilters,
  TransactionsService,
} from "./transactions.service";

/**
 * Gap #8: listado autenticado de transacciones del negocio del usuario. El negocio se toma
 * del contexto de tenant resuelto por `RolesGuard` (nunca de un parámetro del cliente); el
 * servicio corre bajo `runAsTenant` para heredar la RLS de la Épica 2.
 *
 * Filtros server-side opcionales por query string:
 * - `verdict`: repetible o CSV (`VERIFIED,PENDING,SUSPICIOUS`).
 * - `from` / `to`: fechas ISO (inclusive) sobre `createdAt`.
 * - `accountId`: id de una `ReceivingAccount` del negocio.
 * Sin filtros, devuelve todas las transacciones del negocio (más recientes primero).
 */
@Controller("transactions")
@UseGuards(SupabaseJwtGuard, RolesGuard)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query("verdict") verdict?: string | string[],
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("accountId") accountId?: string,
  ): Promise<DashboardTransactionDto[]> {
    const filters: ListTransactionsFilters = {
      verdicts: parseVerdicts(verdict),
      from: parseDate(from, "from"),
      to: parseDate(to, "to"),
      accountId: accountId?.trim() || undefined,
    };
    return this.transactions.list(tenant.businessId, filters);
  }
}

/** Acepta `?verdict=A&verdict=B`, `?verdict=A,B` o vacío. Valida contra el enum real. */
function parseVerdicts(raw: string | string[] | undefined): VerdictStatus[] | undefined {
  if (raw === undefined) return undefined;
  const values = (Array.isArray(raw) ? raw : [raw])
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  if (values.length === 0) return undefined;

  const valid = new Set<string>(Object.values(VerdictStatus));
  for (const v of values) {
    if (!valid.has(v)) throw new BadRequestException(`Veredicto no soportado: ${v}`);
  }
  return values as VerdictStatus[];
}

function parseDate(raw: string | undefined, field: string): Date | undefined {
  if (!raw?.trim()) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Fecha inválida en \`${field}\``);
  }
  return parsed;
}
