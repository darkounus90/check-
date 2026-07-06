import { buildConsentRecord, type ConsentInput } from "@check/shared";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";

/**
 * Registro de consentimiento y aviso de privacidad (Épica 12, E12-T5). Persiste en
 * `privacy_consents` que un titular vio/aceptó el aviso en un punto de entrada. El copy y la
 * versión canónica viven en `@check/shared` (`PRIVACY_NOTICE_*`).
 */
@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra un consentimiento y devuelve el registro normalizado. */
  async record(input: ConsentInput) {
    const rec = buildConsentRecord(input);
    const created = await this.prisma.privacyConsent.create({
      data: {
        businessId: rec.businessId,
        channel: rec.channel,
        subjectRef: rec.subjectRef,
        noticeVersion: rec.noticeVersion,
        metadata: rec.metadata as object,
        acceptedAt: new Date(rec.acceptedAt),
      },
      select: { id: true, channel: true, noticeVersion: true, acceptedAt: true },
    });
    return created;
  }
}
