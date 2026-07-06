import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { NumberHealth, QrResolutionReason } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import {
  type AssignableHealth,
  type PoolAssignmentRow,
  resolveQr,
  waMeUrl,
} from "./qr-router";

/**
 * Respuesta pública del enrutador de QR (E08-T1). Discriminada por `action`:
 * - `whatsapp`: abrir WhatsApp con `waMeUrl`; `reason` indica primario o failover.
 * - `pwa`: todo el pool del negocio está caído → renderizar la PWA de subida (Épica 9).
 * NUNCA expone el `businessId` interno ni el `waNumberId` (D3).
 */
export type QrRouteDto =
  | { action: "whatsapp"; waMeUrl: string; reason: "primary" | "failover" }
  | { action: "pwa" };

/** Mapea el enum Prisma `NumberHealth` a la salud en minúsculas que usa la lógica pura. */
function fromPrismaHealth(health: NumberHealth): AssignableHealth {
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

/**
 * Subconjunto de `PrismaClient` que el enrutador necesita. Permite inyectar un fake en tests
 * (mismo patrón que `PublicStore`). `PrismaService` lo satisface estructuralmente.
 */
export interface QrRouterStore {
  business: {
    findUnique(args: {
      where: { opaqueId: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  numberPoolAssignment: {
    findMany(args: {
      where: { businessId: string };
      select: {
        priority: true;
        createdAt: true;
        waNumber: { select: { id: true; phoneNumber: true; health: true } };
      };
    }): Promise<
      Array<{
        priority: number;
        createdAt: Date;
        waNumber: { id: string; phoneNumber: string; health: NumberHealth };
      }>
    >;
  };
  qrResolutionLog: {
    create(args: {
      data: { businessId: string; waNumberId: string | null; reason: QrResolutionReason };
    }): Promise<{ id: string }>;
  };
}

/**
 * Enrutador de QR (Épica 8): resuelve un escaneo de `/n/{opaqueId}` al mejor número WhatsApp
 * sano del negocio (failover transparente a secundario), o cae a la PWA si todo el pool está
 * caído. La SELECCIÓN vive en `resolveQr` (pura, testeable); aquí solo hacemos I/O: resolver
 * el negocio por opaqueId, leer sus asignaciones con salud, y persistir la traza (E08-T5).
 *
 * PÚBLICO sin JWT: el negocio se resuelve server-side por `opaqueId` (cuid no adivinable) y la
 * respuesta nunca incluye el `businessId` ni el `waNumberId` internos (D3).
 */
@Injectable()
export class QrRouterService {
  private readonly logger = new Logger("qr-router");

  constructor(@Inject(PrismaService) private readonly prisma: QrRouterStore) {}

  async resolveRoute(opaqueId: string): Promise<QrRouteDto> {
    const business = await this.prisma.business.findUnique({
      where: { opaqueId },
      select: { id: true },
    });
    if (!business) throw new NotFoundException("Negocio no encontrado");

    const rows = await this.prisma.numberPoolAssignment.findMany({
      where: { businessId: business.id },
      select: {
        priority: true,
        createdAt: true,
        waNumber: { select: { id: true, phoneNumber: true, health: true } },
      },
    });

    const assignments: PoolAssignmentRow[] = rows.map((r) => ({
      waNumberId: r.waNumber.id,
      priority: r.priority,
      createdAtMs: r.createdAt.getTime(),
    }));
    const healthById = new Map(rows.map((r) => [r.waNumber.id, r.waNumber.health]));
    const phoneById = new Map(rows.map((r) => [r.waNumber.id, r.waNumber.phoneNumber]));

    const resolution = resolveQr(assignments, (id) => {
      const h = healthById.get(id);
      return h ? fromPrismaHealth(h) : undefined;
    });

    // E08-T5: traza consultable por operación. No bloquea la resolución si falla el log.
    const chosenNumberId = resolution.action === "whatsapp" ? resolution.waNumberId : null;
    try {
      await this.prisma.qrResolutionLog.create({
        data: {
          businessId: business.id,
          waNumberId: chosenNumberId,
          reason: resolution.reason as QrResolutionReason,
        },
      });
    } catch (err) {
      // Nunca dejamos que la analítica tumbe el enrutado del cliente. Se loguea sin opaqueId (D3).
      this.logger.warn(`No se pudo registrar la resolución del QR: ${String(err)}`);
    }

    if (resolution.action === "pwa") {
      return { action: "pwa" };
    }

    const phoneNumber = phoneById.get(resolution.waNumberId);
    if (!phoneNumber) {
      // Defensa: el número elegido debería existir en el mapa. Si no, degradamos a PWA.
      return { action: "pwa" };
    }
    return {
      action: "whatsapp",
      waMeUrl: waMeUrl(phoneNumber),
      reason: resolution.reason === "PRIMARY" ? "primary" : "failover",
    };
  }
}
