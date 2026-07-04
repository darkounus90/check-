import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { TenantContext } from "../tenant/tenant.service";

/** Inyecta el contexto de tenant (poblado por RolesGuard) en un handler. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext => {
    const req = context.switchToHttp().getRequest<{ tenant: TenantContext }>();
    return req.tenant;
  },
);
