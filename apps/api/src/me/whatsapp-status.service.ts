import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";

/** Estado de la vinculación de WhatsApp del negocio, para el dashboard. */
export interface WhatsappStatusDto {
  /** `true` si el número ya está vinculado y respondiendo. */
  connected: boolean;
  /** QR de vinculación vigente (string Baileys) para renderizar; `null` si ya está conectado. */
  qr: string | null;
  /** Etiqueta del número asignado (metadato); `null` si el negocio no tiene número. */
  phoneNumber: string | null;
}

@Injectable()
export class WhatsappStatusService {
  constructor(private readonly prisma: PrismaService) {}

  /** Estado del número asignado al negocio (el de mayor prioridad si hay varios). */
  async getStatus(businessId: string): Promise<WhatsappStatusDto> {
    const assignment = await this.prisma.numberPoolAssignment.findFirst({
      where: { businessId },
      orderBy: { priority: "asc" },
      select: { waNumber: { select: { health: true, pairingQr: true, phoneNumber: true } } },
    });
    const wa = assignment?.waNumber;
    if (!wa) return { connected: false, qr: null, phoneNumber: null };
    const connected = wa.health === "CONNECTED";
    return {
      connected,
      qr: connected ? null : wa.pairingQr,
      phoneNumber: wa.phoneNumber,
    };
  }
}
