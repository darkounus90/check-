import { randomBytes } from "node:crypto";

import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Role } from "@prisma/client";

import type { AuthUser } from "../auth/supabase-jwt.guard";
import { PrismaService } from "../database/prisma.service";
import { SupabaseAdminService } from "../supabase/supabase-admin.service";

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseAdminService,
  ) {}

  /** E03-T4: crea el negocio + primer dueño (el usuario actual). Uno por usuario (MVP). */
  async registerBusiness(user: AuthUser, name: string) {
    if (!name?.trim()) throw new BadRequestException("Falta el nombre del negocio");

    const dbUser = await this.prisma.user.upsert({
      where: { supabaseUserId: user.userId },
      create: { supabaseUserId: user.userId, email: user.email ?? `${user.userId}@unknown` },
      update: {},
      include: { memberships: true },
    });
    if (dbUser.memberships.length > 0) {
      throw new ConflictException("El usuario ya pertenece a un negocio");
    }

    const business = await this.prisma.business.create({
      data: {
        name: name.trim(),
        inboundMailboxId: `pagos-${randomBytes(6).toString("hex")}`,
        memberships: { create: { userId: dbUser.id, role: Role.OWNER } },
      },
    });
    return {
      id: business.id,
      name: business.name,
      opaqueId: business.opaqueId,
      inboundMailboxId: business.inboundMailboxId,
      mailboxStatus: business.mailboxStatus,
    };
  }

  /** E03-T5: da de alta un cajero (crea usuario Supabase + membresía CASHIER). */
  async inviteCashier(businessId: string, email: string, password: string) {
    if (!email?.includes("@")) throw new BadRequestException("Email inválido");
    if (!password || password.length < 8) throw new BadRequestException("Password muy corto");

    const supabaseUserId = await this.supabase.createConfirmedUser(email, password);
    try {
      const dbUser = await this.prisma.user.create({
        data: {
          supabaseUserId,
          email,
          memberships: { create: { businessId, role: Role.CASHIER } },
        },
      });
      return { userId: dbUser.id, email };
    } catch (e) {
      // Rollback del usuario Supabase si falla la BD (evita huérfanos).
      await this.supabase.deleteUser(supabaseUserId);
      throw e;
    }
  }
}
