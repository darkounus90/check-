import { Module } from "@nestjs/common";

import { HabeasDataController } from "./habeas-data.controller";
import { HabeasDataService } from "./habeas-data.service";

/**
 * Módulo de habeas data (Épica 12, E12-T4). CryptoModule/AuditModule/TenantModule/DatabaseModule
 * son globales, así que sus providers ya están disponibles para inyección.
 */
@Module({
  controllers: [HabeasDataController],
  providers: [HabeasDataService],
})
export class HabeasDataModule {}
