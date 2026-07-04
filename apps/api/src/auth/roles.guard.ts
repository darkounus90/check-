import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { TenantService } from "../tenant/tenant.service";
import { ROLES_KEY } from "./roles.decorator";
import type { AuthUser } from "./supabase-jwt.guard";

/**
 * Resuelve el contexto de tenant del usuario (E03-T2) y lo deja en `req.tenant`.
 * Si el handler declara @Roles(...), exige que el rol del usuario esté incluido.
 * Debe correr DESPUÉS de SupabaseJwtGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenant: TenantService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser; tenant?: { businessId: string; role: string } }>();
    if (!req.user) throw new ForbiddenException("No autenticado");

    const ctx = await this.tenant.resolve(req.user.userId);
    if (!ctx) throw new ForbiddenException("El usuario no pertenece a ningún negocio");
    req.tenant = ctx;

    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0 && !required.includes(ctx.role)) {
      throw new ForbiddenException(`Requiere rol: ${required.join(" o ")}`);
    }
    return true;
  }
}
