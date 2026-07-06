import { BadRequestException, Body, Controller, Delete, Post, UseGuards } from "@nestjs/common";

import { CurrentTenant } from "../auth/current-tenant.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { type AuthUser, SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import type { TenantContext } from "../tenant/tenant.service";
import { HabeasDataService } from "./habeas-data.service";

/**
 * Endpoints de habeas data (Épica 12, E12-T4). Autenticado + autorizado: solo el DUEÑO
 * (`OWNER`) del negocio puede ejercer/atender derechos del titular, y siempre acotado a su
 * propio negocio (el `businessId` viene del contexto de tenant, no del cliente).
 *
 * - POST /habeas-data/export  → exporta la info de un titular (por su JID de WhatsApp).
 * - DELETE /habeas-data       → elimina la info de un titular.
 */
@Controller("habeas-data")
@UseGuards(SupabaseJwtGuard, RolesGuard)
@Roles("OWNER")
export class HabeasDataController {
  constructor(private readonly habeasData: HabeasDataService) {}

  @Post("export")
  export(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthUser,
    @Body("subjectRef") subjectRef?: string,
  ) {
    if (!subjectRef?.trim()) {
      throw new BadRequestException("Falta subjectRef (identificador del titular)");
    }
    return this.habeasData.exportSubject(tenant.businessId, user.userId, subjectRef.trim());
  }

  @Delete()
  remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthUser,
    @Body("subjectRef") subjectRef?: string,
  ) {
    if (!subjectRef?.trim()) {
      throw new BadRequestException("Falta subjectRef (identificador del titular)");
    }
    return this.habeasData.deleteSubject(tenant.businessId, user.userId, subjectRef.trim());
  }
}
