import { Module } from "@nestjs/common";

import { ConsentController } from "./consent.controller";
import { ConsentService } from "./consent.service";

/** Módulo de consentimiento / aviso de privacidad (Épica 12, E12-T5). */
@Module({
  controllers: [ConsentController],
  providers: [ConsentService],
})
export class ConsentModule {}
