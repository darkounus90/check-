import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";

export interface TenantContext {
  businessId: string;
  role: string;
}

/**
 * Resuelve el negocio/rol de un usuario (E03-T2) y ejecuta consultas con el
 * contexto de RLS activo (defensa en profundidad: además del scoping en código).
 */
@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  /** Devuelve el contexto de tenant del usuario Supabase, o null si no tiene membresía. */
  async resolve(supabaseUserId: string): Promise<TenantContext | null> {
    const user = await this.prisma.user.findUnique({
      where: { supabaseUserId },
      select: { memberships: { take: 1, select: { businessId: true, role: true } } },
    });
    const membership = user?.memberships[0];
    if (!membership) return null;
    return { businessId: membership.businessId, role: membership.role };
  }

  /**
   * Corre `fn` dentro de una transacción con RLS activo para el negocio dado:
   * fija el claim `business_id` y el rol `authenticated`, tal como un request real.
   */
  async runAsTenant<T>(
    businessId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `select set_config('request.jwt.claims', json_build_object('business_id', $1::text)::text, true)`,
        businessId,
      );
      await tx.$executeRawUnsafe(`set local role authenticated`);
      return fn(tx);
    });
  }
}
