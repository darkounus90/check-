import {
  PRIVACY_NOTICE_TEXT,
  PRIVACY_NOTICE_VERSION,
  PRIVACY_NOTICE_WHATSAPP,
} from "@check/shared";
import { BadRequestException, Body, Controller, Get, Post } from "@nestjs/common";

import { ConsentService } from "./consent.service";

const CHANNELS = ["pwa", "dashboard", "whatsapp"] as const;
type Channel = (typeof CHANNELS)[number];

/**
 * Aviso de privacidad y registro de consentimiento (Épica 12, E12-T5). Público (sin JWT): la
 * PWA de subida (`/n`) lo consume antes de que el titular envíe su comprobante, y también el
 * dashboard/WhatsApp registran aquí el consentimiento. No expone datos sensibles.
 */
@Controller("consent")
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  /** Copy canónico del aviso + versión vigente (para renderizar en cualquier punto de entrada). */
  @Get("notice")
  notice() {
    return {
      version: PRIVACY_NOTICE_VERSION,
      text: PRIVACY_NOTICE_TEXT,
      whatsappText: PRIVACY_NOTICE_WHATSAPP,
    };
  }

  /**
   * Registra que un titular aceptó el aviso. `subjectRef` identifica al titular en su canal
   * (ip/uuid en PWA, userId en dashboard, JID en WhatsApp). `businessId` opcional (el negocio
   * cuyo punto de entrada mostró el aviso).
   */
  @Post()
  register(
    @Body("channel") channel?: string,
    @Body("subjectRef") subjectRef?: string,
    @Body("businessId") businessId?: string,
    @Body("noticeVersion") noticeVersion?: string,
  ) {
    if (!channel || !CHANNELS.includes(channel as Channel)) {
      throw new BadRequestException(`channel inválido (esperado: ${CHANNELS.join(", ")})`);
    }
    if (!subjectRef?.trim()) {
      throw new BadRequestException("Falta subjectRef (identificador del titular)");
    }
    return this.consent.record({
      channel: channel as Channel,
      subjectRef: subjectRef.trim(),
      businessId: businessId?.trim() || null,
      noticeVersion: noticeVersion?.trim() || undefined,
    });
  }
}
