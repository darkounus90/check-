import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { env } from "../env";

/** Usuario autenticado extraído del JWT de Supabase. */
export interface AuthUser {
  userId: string;
  email: string | undefined;
  /** Claim custom `business_id` (lo inyecta el auth hook — E03-T2). */
  businessId: string | undefined;
  /** Claim custom `user_role` (OWNER/CASHIER) del auth hook. */
  role: string | undefined;
}

// JWKS remoto de Supabase (ES256). Se cachea internamente por `jose`.
const jwks = createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
const ISSUER = `${env.SUPABASE_URL}/auth/v1`;

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();

    const header = req.headers["authorization"] ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("Falta el token Bearer");
    }

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: ISSUER,
        audience: "authenticated",
      });
      req.user = {
        userId: String(payload.sub ?? ""),
        email: typeof payload["email"] === "string" ? payload["email"] : undefined,
        businessId: typeof payload["business_id"] === "string" ? payload["business_id"] : undefined,
        role: typeof payload["user_role"] === "string" ? payload["user_role"] : undefined,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Token inválido o expirado");
    }
  }
}
