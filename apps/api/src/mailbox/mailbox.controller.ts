import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

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

  /**
   * Modo "solo comprobante": el dueño declara si su banco/billetera NO envía correos de
   * abono (ej. algunos flujos Bre-B, solo push/SMS). Solo dueño.
   */
  @Post("no-email")
  @Roles("OWNER")
  setNoBankEmail(@CurrentTenant() tenant: TenantContext, @Body() body: { value?: boolean }) {
    return this.mailbox.setNoBankEmail(tenant.businessId, body?.value === true);
  }
}
