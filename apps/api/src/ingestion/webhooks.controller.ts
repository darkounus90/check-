import { Body, Controller, Headers, Post, Query, UnauthorizedException } from "@nestjs/common";

import { type InboundEmail, IngestionService } from "./ingestion.service";

@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly ingestion: IngestionService) {}

  /** Webhook de Postmark Inbound. Autenticado por secreto compartido (query o header). */
  @Post("postmark")
  postmark(
    @Body() payload: InboundEmail,
    @Query("token") queryToken?: string,
    @Headers("x-webhook-token") headerToken?: string,
  ) {
    if (!this.ingestion.isAuthorized(queryToken ?? headerToken)) {
      throw new UnauthorizedException("Webhook token inválido");
    }
    return this.ingestion.ingest(payload);
  }
}
