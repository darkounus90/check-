import { Global, Module } from "@nestjs/common";

import { AuditService } from "./audit.service";

/**
 * Módulo global de auditoría (Épica 12, E12-T6). Global para que cualquier controlador/servicio
 * que toque datos sensibles pueda inyectar `AuditService` sin re-importarlo.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
