import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AuthUser } from "./supabase-jwt.guard";

/** Inyecta el usuario autenticado (poblado por SupabaseJwtGuard) en un handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const req = context.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);
