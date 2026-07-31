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

/**
 * Extrae el `inboundMailboxId` del destinatario, soportando dos esquemas:
 * - Dominio propio (Postmark): `biz-esquina@midominio` → `biz-esquina` (la parte local).
 * - Dirección compartida con plus-addressing (CloudMailin/Gmail, sin dominio propio):
 *   `abc123+biz-esquina@cloudmailin.net` → `biz-esquina` (lo que va tras el `+`).
 */
export function extractMailboxId(recipient: string): string {
  const local = recipient.split("@")[0] ?? "";
  const plus = local.indexOf("+");
  return plus >= 0 ? local.slice(plus + 1) : local;
}

const BANK_MAP: Record<string, ReceiverBank> = {
  bancolombia: ReceiverBank.BANCOLOMBIA,
  davivienda: ReceiverBank.DAVIVIENDA,
  bbva: ReceiverBank.BBVA,
};

/** Remitente de los correos de confirmación de reenvío de Gmail (fijo de Google). */
const GMAIL_FORWARD_SENDER = "forwarding-noreply@google.com";

export interface GmailForwardConfirmation {
  /** Código de 9 dígitos que Gmail pide pegar en su configuración. */
  code: string;
  /** Enlace de confirmación de un-clic (host google.com); al abrirlo se activa el reenvío. */
  link?: string;
}

/**
 * Detecta el correo "Gmail Forwarding Confirmation" que Google envía al buzón destino
 * cuando el dueño agrega nuestra dirección como reenvío, y extrae el código + enlace.
 * Devuelve `null` si no es ese correo. Tolerante a español/inglés y a solo-HTML (el
 * cuerpo ya viene aplanado por `bodyText`).
 */
export function parseGmailForwardConfirmation(
  from: string | undefined,
  raw: string,
): GmailForwardConfirmation | null {
  if (!from || !from.toLowerCase().includes(GMAIL_FORWARD_SENDER)) return null;
  // El código aparece como "(#123456789)" en el asunto y "código de confirmación es 123456789".
  const code = raw.match(/\b(\d{9})\b/)?.[1];
  if (!code) return null;
  // Enlace de confirmación de un clic: URL a un host de Google (mail-settings/mail.google.com).
  const link = raw
    .match(/https?:\/\/[^\s"'<>]+/gi)
    ?.find((url) => /(^https?:\/\/)([\w.-]*\.)?google\.com\//i.test(url));
  return link ? { code, link } : { code };
}

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
    const mailboxId = extractMailboxId(recipient);
    const business = await this.prisma.business.findUnique({
      where: { inboundMailboxId: mailboxId },
    });
    if (!business) {
      // E04-T9: buzón desconocido → alerta (feed de Épica 11). No se pierde ni crashea.
      this.logger.warn(`Buzón entrante desconocido: ${mailboxId}`);
      return { status: "unknown_mailbox" };
    }

    const raw = [payload.From, payload.Subject, payload.TextBody].filter(Boolean).join("\n");

    // Onboarding "conexión fácil": si es el correo de confirmación de reenvío de Gmail,
    // NO es un correo bancario. Guardamos el código y lo auto-confirmamos abriendo el
    // enlace de Google, para que el dueño no tenga que pegar nada manualmente.
    const confirmation = parseGmailForwardConfirmation(payload.From, raw);
    if (confirmation) {
      return this.handleForwardConfirmation(business.id, confirmation);
    }

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

  /**
   * Guarda el código de confirmación de reenvío de Gmail en el negocio y, si trae enlace de
   * un clic a un host de Google, lo abre para activar el reenvío automáticamente. Aislado:
   * un fallo del fetch no rompe la ingesta (el código queda guardado como respaldo manual).
   */
  private async handleForwardConfirmation(
    businessId: string,
    confirmation: GmailForwardConfirmation,
  ): Promise<{ status: string }> {
    let confirmedAt: Date | null = null;
    if (confirmation.link) {
      try {
        const res = await fetch(confirmation.link, { method: "GET", redirect: "follow" });
        if (res.ok) confirmedAt = new Date();
        else this.logger.warn(`Auto-confirmación de reenvío devolvió ${res.status}`);
      } catch (error) {
        this.logger.warn(`No se pudo auto-confirmar el reenvío de Gmail: ${String(error)}`);
      }
    }
    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        fwdConfirmCode: confirmation.code,
        fwdConfirmLink: confirmation.link ?? null,
        ...(confirmedAt ? { fwdConfirmedAt: confirmedAt } : {}),
      },
    });
    this.logger.log(
      `Confirmación de reenvío de Gmail para negocio ${businessId} (auto=${confirmedAt ? "sí" : "no"})`,
    );
    return { status: confirmedAt ? "forwarding_confirmed" : "forwarding_pending_code" };
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
