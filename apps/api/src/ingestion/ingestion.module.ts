import { Module } from "@nestjs/common";

import { IngestionService } from "./ingestion.service";
import { WebhooksController } from "./webhooks.controller";

@Module({
  controllers: [WebhooksController],
  providers: [IngestionService],
})
export class IngestionModule {}
