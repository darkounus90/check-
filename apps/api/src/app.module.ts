import { Module } from "@nestjs/common";

import { AccountsController } from "./accounts/accounts.controller";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { IngestionModule } from "./ingestion/ingestion.module";
import { MailboxController } from "./mailbox/mailbox.controller";
import { MailboxService } from "./mailbox/mailbox.service";
import { MeController } from "./me/me.controller";
import { OnboardingController } from "./onboarding/onboarding.controller";
import { OnboardingService } from "./onboarding/onboarding.service";
import { SupabaseModule } from "./supabase/supabase.module";
import { TenantModule } from "./tenant/tenant.module";

@Module({
  imports: [DatabaseModule, TenantModule, SupabaseModule, IngestionModule],
  controllers: [
    HealthController,
    MeController,
    OnboardingController,
    AccountsController,
    MailboxController,
  ],
  providers: [OnboardingService, MailboxService],
})
export class AppModule {}
