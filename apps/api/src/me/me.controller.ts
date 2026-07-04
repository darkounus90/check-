import { Controller, Get, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../auth/current-user.decorator";
import { type AuthUser, SupabaseJwtGuard } from "../auth/supabase-jwt.guard";
import { TenantService } from "../tenant/tenant.service";

interface MeResponse extends AuthUser {
  businessId: string | undefined;
  role: string | undefined;
}

@Controller("me")
@UseGuards(SupabaseJwtGuard)
export class MeController {
  constructor(private readonly tenant: TenantService) {}

  @Get()
  async me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    // El businessId/role se resuelven desde la BD (no del JWT), evitando el auth hook.
    const ctx = await this.tenant.resolve(user.userId);
    return { ...user, businessId: ctx?.businessId, role: ctx?.role };
  }
}
