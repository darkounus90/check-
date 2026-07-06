import { Global, Module } from "@nestjs/common";

import { CryptoService } from "./crypto.service";

/** Módulo global de cifrado en reposo de los workers (Épica 12). */
@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
