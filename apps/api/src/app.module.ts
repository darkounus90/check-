import { Module } from "@nestjs/common";

import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { MeController } from "./me/me.controller";
import { TenantModule } from "./tenant/tenant.module";

@Module({
  imports: [DatabaseModule, TenantModule],
  controllers: [HealthController, MeController],
})
export class AppModule {}
