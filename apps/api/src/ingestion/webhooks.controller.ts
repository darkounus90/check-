import { Body, Controller, Headers, Post, Query, UnauthorizedException } from "@nestjs/common";

import { type InboundEmail, IngestionService } from "./ingestion.service";

/** Payload del webhook de CloudMailin (formato JSON). Campos tolerantes a mayúsc/minúsc. */
interface CloudMailinPayload {
  envelope?: { from?: string; to?: string; recipients?: string[] };
  headers?: Record<string, string | string[] | undefined>;
  plain?: string;
  html?: string;
}

/** Lee un header de CloudMailin tolerando el caso y valores en array. */
function header(headers: CloudMailinPayload["headers"], name: string): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : undefined;
  return Array.isArray(value) ? value[0] : value;
}

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

  /**
   * Webhook de CloudMailin (formato JSON). Mapea su estructura al `InboundEmail` común y
   * reusa el mismo pipeline de ingesta que Postmark. Permite recibir correo bancario GRATIS
   * sin dominio propio (dirección `hash+mailboxId@cloudmailin.net`). Mismo secreto compartido.
   */
  @Post("cloudmailin")
  cloudmailin(
    @Body() payload: CloudMailinPayload,
    @Query("token") queryToken?: string,
    @Headers("x-webhook-token") headerToken?: string,
  ) {
    if (!this.ingestion.isAuthorized(queryToken ?? headerToken)) {
      throw new UnauthorizedException("Webhook token inválido");
    }
    const recipient = payload.envelope?.to ?? header(payload.headers, "to") ?? "";
    const email: InboundEmail = {
      From: payload.envelope?.from ?? header(payload.headers, "from"),
      Subject: header(payload.headers, "subject"),
      TextBody: payload.plain,
      To: recipient,
      OriginalRecipient: recipient,
    };
    return this.ingestion.ingest(email);
  }
}
