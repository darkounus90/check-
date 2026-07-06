import { Controller, Get, UseGuards } from "@nestjs/common";

import { CurrentTenant } from "../auth/current-tenant.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import type { TenantContext } from "../tenant/tenant.service";
import { type BusinessQr, QrService } from "./qr.service";

/**
 * E08-T6: QR imprimible y estable del negocio del dueño. AUTENTICADO (solo dueño): la URL
 * codificada apunta al enrutador público `${PUBLIC_APP_URL}/n/{opaqueId}`. El negocio se toma
 * del contexto de tenant resuelto por `RolesGuard` (nunca de un parámetro del cliente), así un
 * dueño solo puede obtener el QR de SU negocio.
 */
@Controller("me/qr")
@UseGuards(SupabaseJwtGuard, RolesGuard)
export class QrController {
  constructor(private readonly qr: QrService) {}

  @Get()
  @Roles("OWNER")
  get(@CurrentTenant() tenant: TenantContext): Promise<BusinessQr> {
    return this.qr.getBusinessQr(tenant.businessId);
  }
}
