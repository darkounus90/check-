import { Module } from "@nestjs/common";

import { RetentionService } from "./retention.service";

/**
 * Módulo del job de purga por retención (Épica 12, E12-T3). `PrismaService` llega vía
 * `DatabaseModule` (@Global). El `setInterval` de purga vive en `RetentionService`.
 */
@Module({
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
