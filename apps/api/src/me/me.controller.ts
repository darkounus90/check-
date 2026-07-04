import { Controller, Get, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../auth/current-user.decorator";
import { type AuthUser, SupabaseJwtGuard } from "../auth/supabase-jwt.guard";

@Controller("me")
@UseGuards(SupabaseJwtGuard)
export class MeController {
  @Get()
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
