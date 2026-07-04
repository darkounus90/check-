import { Body, Controller, Post, UseGuards } from "@nestjs/common";

import { CurrentTenant } from "../auth/current-tenant.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { type AuthUser, SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import type { TenantContext } from "../tenant/tenant.service";
import { OnboardingService } from "./onboarding.service";

@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** El usuario autenticado crea su negocio y queda como dueño. */
  @Post("register-business")
  @UseGuards(SupabaseJwtGuard)
  registerBusiness(@CurrentUser() user: AuthUser, @Body("name") name: string) {
    return this.onboarding.registerBusiness(user, name);
  }

  /** El dueño da de alta un cajero. */
  @Post("cashiers")
  @UseGuards(SupabaseJwtGuard, RolesGuard)
  @Roles("OWNER")
  inviteCashier(
    @CurrentTenant() tenant: TenantContext,
    @Body("email") email: string,
    @Body("password") password: string,
  ) {
    return this.onboarding.inviteCashier(tenant.businessId, email, password);
  }
}
