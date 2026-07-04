import { Injectable, NotFoundException } from "@nestjs/common";
import { MailboxStatus, ReceiverBank } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { env } from "../env";

/** Instrucciones de reenvío por banco receptor (E03-T7). */
const FORWARDING_STEPS: Record<ReceiverBank, string> = {
  BANCOLOMBIA:
    "Sucursal Virtual Personas → Configuración → Notificaciones → activa el aviso de 'Recibiste una transferencia' y reenvíalo a este correo.",
  DAVIVIENDA:
    "Banca Web Davivienda → Alertas y notificaciones → correo → agrega el reenvío automático a este correo.",
  BBVA: "BBVA net → Configuración → Notificaciones por correo → reenvía los avisos de abono a este correo.",
};

export interface MailboxStatusResponse {
  address: string;
  mailboxStatus: MailboxStatus;
  /** Regla dura (E03-T9 / D-verificación): sin buzón verificado nunca se emite 🟢. */
  canEmitGreen: boolean;
  instructions: { bank: ReceiverBank; steps: string }[];
}

@Injectable()
export class MailboxService {
  constructor(private readonly prisma: PrismaService) {}

  private async getBusiness(businessId: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException("Negocio no encontrado");
    return business;
  }

  private address(inboundMailboxId: string): string {
    return `${inboundMailboxId}@${env.INBOUND_EMAIL_DOMAIN}`;
  }

  async getStatus(businessId: string): Promise<MailboxStatusResponse> {
    const business = await this.getBusiness(businessId);
    return {
      address: this.address(business.inboundMailboxId),
      mailboxStatus: business.mailboxStatus,
      canEmitGreen: business.mailboxStatus === MailboxStatus.VERIFIED,
      instructions: (Object.keys(FORWARDING_STEPS) as ReceiverBank[]).map((bank) => ({
        bank,
        steps: FORWARDING_STEPS[bank],
      })),
    };
  }

  /**
   * E03-T8: marca el buzón como VERIFIED si ya llegó al menos un correo bancario.
   * En producción lo dispara la ingesta de Postmark (Épica 4); aquí es idempotente.
   */
  async refresh(businessId: string): Promise<MailboxStatusResponse> {
    const business = await this.getBusiness(businessId);
    if (business.mailboxStatus === MailboxStatus.PENDING) {
      const inbound = await this.prisma.bankEmail.count({ where: { businessId } });
      if (inbound > 0) {
        await this.prisma.business.update({
          where: { id: businessId },
          data: { mailboxStatus: MailboxStatus.VERIFIED },
        });
      }
    }
    return this.getStatus(businessId);
  }

  /** E03-T9: helper para el motor de verificación — sin buzón verificado, nunca 🟢. */
  async canEmitGreen(businessId: string): Promise<boolean> {
    const business = await this.getBusiness(businessId);
    return business.mailboxStatus === MailboxStatus.VERIFIED;
  }
}
