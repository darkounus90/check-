import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

/** Restringe un handler/controlador a los roles dados (p. ej. @Roles("OWNER")). */
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
