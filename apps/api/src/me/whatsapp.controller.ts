import { Controller, Get, UseGuards } from "@nestjs/common";

import { CurrentTenant } from "../auth/current-tenant.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import type { TenantContext } from "../tenant/tenant.service";
import { type WhatsappStatusDto, WhatsappStatusService } from "./whatsapp-status.service";

/**
 * Estado de vinculación de WhatsApp del negocio del usuario. Alimenta la pantalla
 * "Conectar WhatsApp" del dashboard: el admin ve el QR y lo escanea con su teléfono.
 * El negocio se resuelve del JWT (nunca de un parámetro del cliente).
 */
@Controller("whatsapp")
@UseGuards(SupabaseJwtGuard, RolesGuard)
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappStatusService) {}

  @Get("status")
  status(@CurrentTenant() tenant: TenantContext): Promise<WhatsappStatusDto> {
    return this.whatsapp.getStatus(tenant.businessId);
  }
}
