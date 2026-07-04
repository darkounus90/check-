import { parseBankEmail } from "@check/parsers";
import { Injectable, Logger } from "@nestjs/common";
import { BankEmailStatus, MailboxStatus, ReceiverBank } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { env } from "../env";

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

  constructor(private readonly prisma: PrismaService) {}

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
}
