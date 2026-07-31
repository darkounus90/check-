import { Injectable, NotFoundException } from "@nestjs/common";
import { MailboxStatus, ReceiverBank } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import { env } from "../env";

/** Instrucciones de reenvío por banco receptor (E03-T7). Referencia por si el aviso de
 * abono llega desde el propio banco y no desde el correo personal del dueño. */
const FORWARDING_STEPS: Record<ReceiverBank, string> = {
  BANCOLOMBIA:
    "Sucursal Virtual Personas → Configuración → Notificaciones → activa el aviso de 'Recibiste una transferencia' y reenvíalo a este correo.",
  DAVIVIENDA:
    "Banca Web Davivienda → Alertas y notificaciones → correo → agrega el reenvío automático a este correo.",
  BBVA: "BBVA net → Configuración → Notificaciones por correo → reenvía los avisos de abono a este correo.",
  NEQUI:
    "En la app Nequi, activa el recibo por correo de 'te enviaron plata' y reenvía ese correo a este buzón desde tu correo personal.",
  DAVIPLATA:
    "En DaviPlata, activa la notificación por correo de abonos y reenvíala a este buzón desde tu correo personal.",
};

/** Proveedor del correo personal del dueño (donde le llegan las alertas del banco). */
export type MailProvider = "GMAIL" | "OUTLOOK" | "OTHER";

export interface MailboxProviderGuide {
  provider: MailProvider;
  label: string;
  /** Enlace directo a la pantalla de reenvío del proveedor (o null si no aplica). */
  settingsUrl: string | null;
  steps: string[];
}

/** Guía de conexión "casi 1-clic" por proveedor (Opción B). `{address}` lo rellena la UI. */
function providerGuides(): MailboxProviderGuide[] {
  return [
    {
      provider: "GMAIL",
      label: "Gmail",
      settingsUrl: "https://mail.google.com/mail/u/0/#settings/fwdandpop",
      steps: [
        "En Gmail, abre Configuración (⚙️) → «Reenvío y correo POP/IMAP».",
        "Pulsa «Agregar una dirección de reenvío», pega el correo de arriba y confirma.",
        "Nosotros confirmamos el código automáticamente: no tienes que pegar nada. Si Gmail te pide el código a mano, aquí abajo te lo mostramos.",
        "Vuelve a «Reenvío», elige «Reenviar una copia del correo entrante a…» y selecciona el buzón. Guarda los cambios.",
      ],
    },
    {
      provider: "OUTLOOK",
      label: "Outlook / Hotmail",
      settingsUrl: "https://outlook.live.com/mail/0/options/mail/forwarding",
      steps: [
        "En Outlook, abre Configuración → Correo → «Reenvío».",
        "Activa «Habilitar el reenvío», pega el correo de arriba y guarda.",
        "Marca «Conservar una copia de los mensajes reenviados» para no perder tus correos.",
      ],
    },
    {
      provider: "OTHER",
      label: "Otro correo",
      settingsUrl: null,
      steps: [
        "Entra a la configuración de tu correo y busca «Reenvío» (o «Forwarding»).",
        "Agrega el correo de arriba como dirección de reenvío y actívalo.",
        "Si tu proveedor pide confirmar un código, escríbenos: lo confirmamos por ti.",
      ],
    },
  ];
}

/** Estado de la auto-confirmación del reenvío de Gmail. */
export interface ForwardingConfirmation {
  /** true cuando abrimos el enlace de Google y quedó confirmado sin intervención del dueño. */
  confirmed: boolean;
  /** Código de respaldo por si Gmail pide pegarlo a mano (null si aún no llegó). */
  code: string | null;
}

export interface MailboxStatusResponse {
  address: string;
  mailboxStatus: MailboxStatus;
  /** Regla dura (E03-T9 / D-verificación): sin buzón verificado nunca se emite 🟢. */
  canEmitGreen: boolean;
  /** Modo "solo comprobante": el banco del dueño no envía correos de abono (ej. Bre-B). */
  noBankEmail: boolean;
  /** Estado de la auto-confirmación del reenvío de Gmail. */
  forwarding: ForwardingConfirmation;
  /** Guías de conexión por proveedor del correo personal (Opción B). */
  providerGuides: MailboxProviderGuide[];
  /** Referencia: reenvío desde el propio banco, por banco receptor. */
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

  /**
   * Dirección que el comerciante debe usar para reenviar sus correos. En producción se arma
   * con plus-addressing sobre el buzón compartido de CloudMailin (`hash+id@cloudmailin.net`),
   * que es la que de verdad recibe y enruta el correo a este negocio (ver `extractMailboxId`).
   * Sin `INBOUND_EMAIL_ADDRESS` configurado, cae al placeholder de desarrollo.
   */
  private address(inboundMailboxId: string): string {
    const base = env.INBOUND_EMAIL_ADDRESS.trim();
    if (base.includes("@")) {
      const [local, domain] = base.split("@");
      return `${local}+${inboundMailboxId}@${domain}`;
    }
    return `${inboundMailboxId}@${env.INBOUND_EMAIL_DOMAIN}`;
  }

  async getStatus(businessId: string): Promise<MailboxStatusResponse> {
    const business = await this.getBusiness(businessId);
    return {
      address: this.address(business.inboundMailboxId),
      mailboxStatus: business.mailboxStatus,
      // En modo "solo comprobante" el 🟢 por correo es imposible por diseño (no hay cruce).
      canEmitGreen: !business.noBankEmail && business.mailboxStatus === MailboxStatus.VERIFIED,
      noBankEmail: business.noBankEmail,
      forwarding: {
        confirmed: business.fwdConfirmedAt !== null,
        code: business.fwdConfirmCode,
      },
      providerGuides: providerGuides(),
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

  /**
   * Modo "solo comprobante": el dueño declara si su banco/billetera envía o no correos de
   * abono. Al activarlo, el onboarding deja de esperar el correo y explica que los pagos se
   * marcan 🟡 provisional (verificado por OCR + defensas, sin confirmación del banco).
   */
  async setNoBankEmail(businessId: string, value: boolean): Promise<MailboxStatusResponse> {
    await this.getBusiness(businessId);
    await this.prisma.business.update({
      where: { id: businessId },
      data: { noBankEmail: value },
    });
    return this.getStatus(businessId);
  }

  /** E03-T9: helper para el motor de verificación — sin buzón verificado, nunca 🟢. */
  async canEmitGreen(businessId: string): Promise<boolean> {
    const business = await this.getBusiness(businessId);
    return !business.noBankEmail && business.mailboxStatus === MailboxStatus.VERIFIED;
  }
}
