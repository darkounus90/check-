import { parseBankEmail } from "@check/parsers";
import { type MetricsRegistry, ParserFailureTracker } from "@check/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { BankEmailStatus, MailboxStatus, ReceiverBank } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { env } from "../env";
import type { AlertPort } from "../observability/alert.port";
import { ALERT_DISPATCHER, METRICS_REGISTRY } from "../observability/observability.tokens";

/** Payload relevante de un webhook Inbound de Postmark. */
export interface InboundEmail {
  From?: string;
  Subject?: string;
  TextBody?: string;
  OriginalRecipient?: string;
  To?: string;
}

const BANK_MAP: Record<string, ReceiverBank> = {
  bancolombia: ReceiverBank.BANCOLOMBIA,
  davivienda: ReceiverBank.DAVIVIENDA,
  bbva: ReceiverBank.BBVA,
};

/**
 * Ingesta de correos bancarios (E04-T2/T3/T9/T10).
 * En producción el parseo iría a una cola BullMQ; sin Redis se procesa inline.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger("ingestion");
  /** E11-T4: rastreo de fallos de parseo por ventana de correos (dispara alerta si una tanda
   * cae mayormente en "no reconocido"). Estado de instancia porque `IngestionService` es
   * singleton en Nest. */
  private readonly parserTracker = new ParserFailureTracker({ source: "bank_email" });

  constructor(
    private readonly prisma: PrismaService,
    @Inject(METRICS_REGISTRY) private readonly metrics: MetricsRegistry,
    @Inject(ALERT_DISPATCHER) private readonly alerts: AlertPort,
  ) {}

  async ingest(payload: InboundEmail): Promise<{ status: string; bankEmailId?: string }> {
    const recipient = payload.OriginalRecipient ?? payload.To ?? "";
    const mailboxId = recipient.split("@")[0] ?? "";
    const business = await this.prisma.business.findUnique({
      where: { inboundMailboxId: mailboxId },
    });
    if (!business) {
      // E04-T9: buzón desconocido → alerta (feed de Épica 11). No se pierde ni crashea.
      this.logger.warn(`Buzón entrante desconocido: ${mailboxId}`);
      return { status: "unknown_mailbox" };
    }

    const raw = [payload.From, payload.Subject, payload.TextBody].filter(Boolean).join("\n");
    const parsed = parseBankEmail(raw);

    // E11-T4/T7: métrica de tasa de parseo por banco y detección de "parser dejó de matchear".
    // La etiqueta es el banco reconocido (o "desconocido" si ningún parser matcheó).
    this.recordParseOutcome(parsed.ok, parsed.ok ? parsed.value.bank : "desconocido");

    const bankEmail = await this.prisma.bankEmail.create({
      data: {
        businessId: business.id,
        rawContent: raw,
        status: parsed.ok ? BankEmailStatus.PARSED : BankEmailStatus.UNPARSED,
        ...(parsed.ok
          ? {
              bank: BANK_MAP[parsed.value.bank] ?? null,
              parserVersion: "v1",
              amountCents: parsed.value.amount,
              approvalNumber: parsed.value.approvalNumber,
              occurredAt: new Date(parsed.value.occurredAtUtc),
              destinationAccount: parsed.value.destinationAccount,
            }
          : {}),
      },
    });

    // El primer correo verifica el buzón (E03-T8).
    if (business.mailboxStatus === MailboxStatus.PENDING) {
      await this.prisma.business.update({
        where: { id: business.id },
        data: { mailboxStatus: MailboxStatus.VERIFIED },
      });
    }

    if (parsed.ok) {
      // Registrar el número en la base global (D6) — idempotente por índice único.
      await this.prisma.$executeRawUnsafe(
        `select approval_number_register($1, $2, $3)`,
        parsed.value.bank,
        parsed.value.approvalNumber,
        business.id,
      );
      return { status: "parsed", bankEmailId: bankEmail.id };
    }

    // E04-T9: no reconocido → alerta.
    this.logger.warn(`Correo no parseado (negocio ${business.id}): ${parsed.error}`);
    return { status: "unparsed", bankEmailId: bankEmail.id };
  }

  /** Verifica el secreto del webhook (E04-T1). */
  isAuthorized(token: string | undefined): boolean {
    return token === env.POSTMARK_INBOUND_SECRET;
  }

  /**
   * E11-T4/T7: registra el resultado del parseo de un correo (métrica por banco) y alimenta el
   * rastreador de ventana; si una tanda cae mayormente en "no reconocido", encola la alerta de
   * parser que dejó de matchear. Aislado: no debe hacer fallar la ingesta si algo falla.
   */
  private recordParseOutcome(recognized: boolean, bank: string): void {
    this.metrics.recordOutcome("bank_email_parse", bank, recognized);
    const alert = this.parserTracker.record(recognized, bank);
    if (alert) {
      this.logger.warn(`Parser de correos dejó de matchear: ${JSON.stringify(alert.context)}`);
      void this.alerts.dispatch(alert);
    }
  }
}
