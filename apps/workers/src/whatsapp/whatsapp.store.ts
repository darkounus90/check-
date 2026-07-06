import { NumberHealth } from "@check/database";
import type {
  BusinessResolver,
  HealthStore,
  OcrEnqueuer,
  PoolAssignment,
  ResolvedVerdict,
  TemplateKindKey,
  TemplateRotationStore,
  VoucherContextReader,
  VoucherIngestStore,
  WarmupStateSnapshot,
  WarmupStore,
  WaSessionStore,
  WhatsAppNumberHealth,
} from "@check/whatsapp";
import { Inject, Injectable } from "@nestjs/common";

import { CryptoService } from "../crypto/crypto.service";
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
    WarmupStore,
    HealthStore
{
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OCR_QUEUE) private readonly ocrQueue: OcrQueueService,
    @Inject(CryptoService) private readonly crypto: CryptoService,
  ) {}

  // ── E07-T1: auth-state (cifrado en reposo, E12-T1) ──────────

  async loadAuthState(waNumberId: string): Promise<unknown | null> {
    const session = await this.prisma.waSession.findUnique({ where: { waNumberId } });
    if (!session?.authState) return null;
    // E12-T1: descifra el auth-state; un blob en claro heredado pasa tal cual.
    return this.crypto.decryptJson(session.authState);
  }

  async saveAuthState(waNumberId: string, authState: unknown): Promise<void> {
    // `authState` es un objeto JSON-puro (BufferJSON ya aplicado en `@check/whatsapp`).
    // E12-T1: se cifra antes de persistir (sin la clave, la sesión no es legible).
    const data = this.crypto.encryptJson(authState) as object;
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

  /**
   * E07-T7 (poller multi-instancia): igual que `findPendingVerdictNotifications` pero para
   * TODOS los números gestionados por el pool (no uno solo). Cada notificación lleva su
   * `waNumberId` para que el pool la enrute a la instancia dueña.
   */
  async findPendingVerdictNotificationsForNumbers(
    waNumberIds: readonly string[],
    limit: number,
  ): Promise<PendingVerdictNotification[]> {
    if (waNumberIds.length === 0) return [];
    const rows = await this.prisma.waVoucherContext.findMany({
      where: {
        waNumberId: { in: [...waNumberIds] },
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

  // ── E07-T7: números a levantar en el pool ───────────────────

  /**
   * Ids de los `WaNumber` que el orquestador (E07-T7) debe levantar al arrancar: los que ya
   * pasaron el warmeo (health != WARMING) y no están baneados. Un número baneado no se levanta
   * (la Épica 8 no le enrutaría igualmente); uno en warmeo aún no entra al pool (E07-T6).
   */
  async listPoolableNumberIds(): Promise<string[]> {
    const rows = await this.prisma.waNumber.findMany({
      where: { health: { notIn: [NumberHealth.WARMING, NumberHealth.BANNED] } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  // ── E07-T8: asignación multi-tenant número↔negocios ─────────

  /**
   * Todas las asignaciones número↔negocio (`NumberPoolAssignment`) para resolver el mapeo
   * multi-tenant (E07-T8) con las funciones puras de `@check/whatsapp`. Devuelve la forma que
   * espera `PoolAssignment` (prioridad + alta en epoch ms).
   */
  async listAssignments(): Promise<PoolAssignment[]> {
    const rows = await this.prisma.numberPoolAssignment.findMany({
      select: { waNumberId: true, businessId: true, priority: true, createdAt: true },
    });
    return rows.map((r) => ({
      waNumberId: r.waNumberId,
      businessId: r.businessId,
      priority: r.priority,
      createdAtMs: r.createdAt.getTime(),
    }));
  }

  // ── E07-T9: persistencia del estado de salud por número ─────

  async saveHealth(waNumberId: string, health: WhatsAppNumberHealth): Promise<void> {
    await this.prisma.waNumber.update({
      where: { id: waNumberId },
      data: { health: toPrismaHealth(health) },
    });
  }

  /**
   * E07-T9 (consulta): salud actual de todos los números del pool, para la Épica 8 (selección
   * de número sano). Espejo persistido de lo que el `HealthMonitor` vuelca cada 60s.
   */
  async getPoolHealth(): Promise<Array<{ waNumberId: string; health: WhatsAppNumberHealth }>> {
    const rows = await this.prisma.waNumber.findMany({ select: { id: true, health: true } });
    return rows.map((r) => ({ waNumberId: r.id, health: fromPrismaHealth(r.health) }));
  }

  // ── E11-T3: contexto para la alerta de baneo ────────────────

  /**
   * Contexto de un baneo (Épica 11, E11-T3): qué número, cuántos negocios dependían de él,
   * y si hay al menos un número SANO (no baneado/en warmeo) que sirva a esos negocios como
   * reemplazo. Todo con datos ya persistidos, sin tocar Baileys.
   */
  async getBanContext(waNumberId: string): Promise<{
    phoneNumber: string | null;
    affectedBusinesses: number;
    hasReplacement: boolean;
    replacementNumberIds: string[];
  }> {
    const number = await this.prisma.waNumber.findUnique({
      where: { id: waNumberId },
      select: { phoneNumber: true },
    });

    // Negocios que dependían de este número.
    const assignments = await this.prisma.numberPoolAssignment.findMany({
      where: { waNumberId },
      select: { businessId: true },
    });
    const affectedBusinessIds = [...new Set(assignments.map((a) => a.businessId))];

    // Otros números sanos asignados a esos mismos negocios (reemplazo posible sin warmeo).
    const replacements =
      affectedBusinessIds.length === 0
        ? []
        : await this.prisma.numberPoolAssignment.findMany({
            where: {
              businessId: { in: affectedBusinessIds },
              waNumberId: { not: waNumberId },
              waNumber: { health: { notIn: [NumberHealth.BANNED, NumberHealth.WARMING] } },
            },
            select: { waNumberId: true },
          });
    const replacementNumberIds = [...new Set(replacements.map((r) => r.waNumberId))];

    return {
      phoneNumber: number?.phoneNumber ?? null,
      affectedBusinesses: affectedBusinessIds.length,
      hasReplacement: replacementNumberIds.length > 0,
      replacementNumberIds,
    };
  }
}

/** Mapea el estado de salud del dominio (`@check/whatsapp`) al enum Prisma `NumberHealth`. */
function toPrismaHealth(health: WhatsAppNumberHealth): NumberHealth {
  switch (health) {
    case "connected":
      return NumberHealth.CONNECTED;
    case "degraded":
      return NumberHealth.DEGRADED;
    case "banned":
      return NumberHealth.BANNED;
    case "warming":
      return NumberHealth.WARMING;
  }
}

/** Mapea el enum Prisma `NumberHealth` de vuelta al estado de salud del dominio. */
function fromPrismaHealth(health: NumberHealth): WhatsAppNumberHealth {
  switch (health) {
    case NumberHealth.CONNECTED:
      return "connected";
    case NumberHealth.DEGRADED:
      return "degraded";
    case NumberHealth.BANNED:
      return "banned";
    case NumberHealth.WARMING:
      return "warming";
  }
}
