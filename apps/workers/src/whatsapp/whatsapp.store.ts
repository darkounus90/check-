import type {
  BusinessResolver,
  OcrEnqueuer,
  ResolvedVerdict,
  TemplateKindKey,
  TemplateRotationStore,
  VoucherContextReader,
  VoucherIngestStore,
  WarmupStateSnapshot,
  WarmupStore,
  WaSessionStore,
} from "@check/whatsapp";
import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import type { OcrQueueService } from "../ocr/ocr.queue";
import { OCR_QUEUE } from "./whatsapp.tokens";

/**
 * Adaptadores Prisma de los puertos de `@check/whatsapp` (Épica 7, Grupo A). La lógica
 * de la instancia (E07-T1/T2/T3) vive en el paquete ESM; aquí están las implementaciones
 * concretas contra la BD y la cola OCR.
 */

/** Un comprobante resuelto listo para responder por WhatsApp (usado por el poller E07-T3). */
export interface PendingVerdictNotification {
  voucherId: string;
  remoteJid: string;
  waNumberId: string;
  verdict: ResolvedVerdict;
}

/**
 * E07-T1: persiste/lee el auth-state de Baileys en `WaSession.authState`. El blob JSON
 * (creds+keys serializados con BufferJSON) lo produce/consume `@check/whatsapp`; aquí solo
 * hacemos el upsert por `waNumberId`.
 *
 * E07-T2: resuelve el negocio destino de un número, sube el comprobante (delegado al
 * `StorageService` existente vía el uploader inyectado en el instance), crea el `Voucher`
 * y persiste el mapeo conversación↔voucher (`WaVoucherContext`), y encola el OCR.
 *
 * E07-T3: lee el contexto WhatsApp de un comprobante para responder el veredicto.
 */
@Injectable()
export class WhatsAppStore
  implements
    WaSessionStore,
    BusinessResolver,
    VoucherIngestStore,
    OcrEnqueuer,
    VoucherContextReader,
    TemplateRotationStore,
    WarmupStore
{
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OCR_QUEUE) private readonly ocrQueue: OcrQueueService,
  ) {}

  // ── E07-T1: auth-state ──────────────────────────────────────

  async loadAuthState(waNumberId: string): Promise<unknown | null> {
    const session = await this.prisma.waSession.findUnique({ where: { waNumberId } });
    return session?.authState ?? null;
  }

  async saveAuthState(waNumberId: string, authState: unknown): Promise<void> {
    // `authState` es un objeto JSON-puro (BufferJSON ya aplicado en `@check/whatsapp`).
    const data = authState as object;
    await this.prisma.waSession.upsert({
      where: { waNumberId },
      create: { waNumberId, authState: data },
      update: { authState: data },
    });
  }

  // ── E07-T2: resolución de negocio + ingesta ─────────────────

  /**
   * Resuelve el `businessId` de un número por su `NumberPoolAssignment` de MAYOR prioridad.
   *
   * LIMITACIÓN documentada (N↔M, E07-T8): un número puede estar asignado a varios negocios.
   * Sin una señal de desambiguación por mensaje (qué negocio es el destinatario real), aquí
   * tomamos determinísticamente la asignación de mayor `priority` (empate → la más antigua).
   * La desambiguación multi-tenant real es E07-T8 (Grupo C).
   */
  async resolveBusinessId(waNumberId: string): Promise<string | null> {
    const assignment = await this.prisma.numberPoolAssignment.findFirst({
      where: { waNumberId },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      select: { businessId: true },
    });
    return assignment?.businessId ?? null;
  }

  async createVoucher(businessId: string, storagePath: string): Promise<{ id: string }> {
    return this.prisma.voucher.create({
      data: { businessId, storagePath },
      select: { id: true },
    });
  }

  async saveVoucherContext(
    voucherId: string,
    remoteJid: string,
    waNumberId: string,
  ): Promise<void> {
    await this.prisma.waVoucherContext.create({
      data: { voucherId, remoteJid, waNumberId },
    });
  }

  async enqueueVoucherOcr(voucherId: string): Promise<void> {
    await this.ocrQueue.enqueueVoucherOcr(voucherId);
  }

  // ── E07-T3: contexto para responder el veredicto ────────────

  async getVoucherContext(
    voucherId: string,
  ): Promise<{ remoteJid: string; waNumberId: string } | null> {
    const context = await this.prisma.waVoucherContext.findUnique({
      where: { voucherId },
      select: { remoteJid: true, waNumberId: true },
    });
    return context;
  }

  /**
   * E07-T3 (poller): comprobantes que llegaron por WhatsApp, ya tienen `Transaction`
   * resuelta (VERIFIED/SUSPICIOUS) y aún NO se respondieron (`notifiedAt = null`). Acota el
   * batch para no saturar un ciclo. PENDING no entra: mientras espera se mantiene el 🟡.
   */
  async findPendingVerdictNotifications(
    waNumberId: string,
    limit: number,
  ): Promise<PendingVerdictNotification[]> {
    const rows = await this.prisma.waVoucherContext.findMany({
      where: {
        waNumberId,
        notifiedAt: null,
        voucher: {
          transaction: { verdict: { in: ["VERIFIED", "SUSPICIOUS"] }, resolvedAt: { not: null } },
        },
      },
      take: limit,
      select: {
        voucherId: true,
        remoteJid: true,
        waNumberId: true,
        voucher: { select: { transaction: { select: { verdict: true } } } },
      },
    });

    return rows.flatMap((row) => {
      const verdict = row.voucher.transaction?.verdict;
      if (verdict !== "VERIFIED" && verdict !== "SUSPICIOUS") return [];
      return [{ voucherId: row.voucherId, remoteJid: row.remoteJid, waNumberId: row.waNumberId, verdict }];
    });
  }

  /** Marca un comprobante como ya respondido (idempotencia del poller E07-T3). */
  async markNotified(voucherId: string): Promise<void> {
    await this.prisma.waVoucherContext.update({
      where: { voucherId },
      data: { notifiedAt: new Date() },
    });
  }

  // ── E07-T5: rotación de plantillas (último índice por número/tipo) ──

  async getLastTemplateIndex(waNumberId: string, kind: TemplateKindKey): Promise<number | null> {
    const row = await this.prisma.waNumber.findUnique({
      where: { id: waNumberId },
      select: {
        lastAckTemplateIndex: true,
        lastVerifiedTemplateIndex: true,
        lastSuspiciousTemplateIndex: true,
      },
    });
    if (!row) return null;
    if (kind === "ack") return row.lastAckTemplateIndex;
    if (kind === "verified") return row.lastVerifiedTemplateIndex;
    return row.lastSuspiciousTemplateIndex;
  }

  async setLastTemplateIndex(
    waNumberId: string,
    kind: TemplateKindKey,
    index: number,
  ): Promise<void> {
    const data =
      kind === "ack"
        ? { lastAckTemplateIndex: index }
        : kind === "verified"
          ? { lastVerifiedTemplateIndex: index }
          : { lastSuspiciousTemplateIndex: index };
    await this.prisma.waNumber.update({ where: { id: waNumberId }, data });
  }

  // ── E07-T6: estado de warmeo (fecha de alta + ventana horaria de conteo) ──

  async getWarmupState(waNumberId: string): Promise<WarmupStateSnapshot> {
    const row = await this.prisma.waNumber.findUnique({
      where: { id: waNumberId },
      select: {
        warmupStartedAt: true,
        warmupHourWindowStart: true,
        warmupSentInWindow: true,
      },
    });
    return {
      warmupStartedAtMs: row?.warmupStartedAt?.getTime() ?? null,
      hourWindowStartMs: row?.warmupHourWindowStart?.getTime() ?? null,
      sentInWindow: row?.warmupSentInWindow ?? 0,
    };
  }

  async saveWarmupState(waNumberId: string, state: WarmupStateSnapshot): Promise<void> {
    await this.prisma.waNumber.update({
      where: { id: waNumberId },
      data: {
        warmupHourWindowStart:
          state.hourWindowStartMs == null ? null : new Date(state.hourWindowStartMs),
        warmupSentInWindow: state.sentInWindow,
      },
    });
  }
}
