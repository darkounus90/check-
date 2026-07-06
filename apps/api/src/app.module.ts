import { Module } from "@nestjs/common";

import { AccountsController } from "./accounts/accounts.controller";
import { AuditModule } from "./audit/audit.module";
import { ConsentModule } from "./consent/consent.module";
import { CryptoModule } from "./crypto/crypto.module";
import { DatabaseModule } from "./database/database.module";
import { HabeasDataModule } from "./habeas-data/habeas-data.module";
import { HealthController } from "./health/health.controller";
import { IngestionModule } from "./ingestion/ingestion.module";
import { MailboxController } from "./mailbox/mailbox.controller";
import { MailboxService } from "./mailbox/mailbox.service";
import { MeController } from "./me/me.controller";
import { QrController } from "./me/qr.controller";
import { QrService } from "./me/qr.service";
import { ObservabilityModule } from "./observability/observability.module";
import { OnboardingController } from "./onboarding/onboarding.controller";
import { OnboardingService } from "./onboarding/onboarding.service";
import { PublicModule } from "./public/public.module";
import { SupabaseModule } from "./supabase/supabase.module";
import { TenantModule } from "./tenant/tenant.module";

@Module({
  imports: [
    ObservabilityModule,
    DatabaseModule,
    TenantModule,
    SupabaseModule,
    IngestionModule,
    PublicModule,
    // Hardening / cumplimiento (Épica 12): cifrado, auditoría, habeas data, consentimiento.
    CryptoModule,
    AuditModule,
    HabeasDataModule,
    ConsentModule,
  ],
  controllers: [
    HealthController,
    MeController,
    QrController,
    OnboardingController,
    AccountsController,
    MailboxController,
  ],
  providers: [OnboardingService, MailboxService, QrService],
})
export class AppModule {}
