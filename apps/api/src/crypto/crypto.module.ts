import { Global, Module } from "@nestjs/common";

import { CryptoService } from "./crypto.service";

/**
 * Módulo global de cifrado en reposo (Épica 12). Global porque múltiples módulos (habeas data,
 * auditoría, ingesta) necesitan `CryptoService` sin re-importarlo en cada uno.
 */
@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
