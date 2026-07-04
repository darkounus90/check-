import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ReceiverBank } from "@prisma/client";

import { CurrentTenant } from "../auth/current-tenant.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import { PrismaService } from "../database/prisma.service";
import type { TenantContext } from "../tenant/tenant.service";

/** E03-T6: CRUD de cuentas receptoras del negocio. Lectura: cualquier miembro. Escritura: dueño. */
@Controller("accounts")
@UseGuards(SupabaseJwtGuard, RolesGuard)
export class AccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.prisma.receivingAccount.findMany({
      where: { businessId: tenant.businessId },
      orderBy: { createdAt: "asc" },
    });
  }

  @Post()
  @Roles("OWNER")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body("bank") bank: string,
    @Body("accountNumber") accountNumber: string,
    @Body("alias") alias?: string,
  ) {
    if (!Object.values(ReceiverBank).includes(bank as ReceiverBank)) {
      throw new BadRequestException(`Banco receptor no soportado: ${bank}`);
    }
    if (!accountNumber?.trim()) throw new BadRequestException("Falta accountNumber");
    return this.prisma.receivingAccount.create({
      data: {
        businessId: tenant.businessId,
        bank: bank as ReceiverBank,
        accountNumber: accountNumber.trim(),
        alias: alias?.trim() || null,
      },
    });
  }

  @Delete(":id")
  @Roles("OWNER")
  async remove(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    const result = await this.prisma.receivingAccount.deleteMany({
      where: { id, businessId: tenant.businessId },
    });
    if (result.count === 0) throw new NotFoundException("Cuenta no encontrada");
    return { deleted: true };
  }
}
