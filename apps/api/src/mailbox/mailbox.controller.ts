import { Controller, Get, Post, UseGuards } from "@nestjs/common";

import { CurrentTenant } from "../auth/current-tenant.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import type { TenantContext } from "../tenant/tenant.service";
import { MailboxService } from "./mailbox.service";

@Controller("onboarding/mailbox")
@UseGuards(SupabaseJwtGuard, RolesGuard)
export class MailboxController {
  constructor(private readonly mailbox: MailboxService) {}

  /** Dirección del buzón + estado + guía de reenvío por banco (E03-T7). */
  @Get()
  status(@CurrentTenant() tenant: TenantContext) {
    return this.mailbox.getStatus(tenant.businessId);
  }

  /** Re-chequea si ya llegó el primer correo y marca VERIFIED (E03-T8). Solo dueño. */
  @Post("refresh")
  @Roles("OWNER")
  refresh(@CurrentTenant() tenant: TenantContext) {
    return this.mailbox.refresh(tenant.businessId);
  }
}
