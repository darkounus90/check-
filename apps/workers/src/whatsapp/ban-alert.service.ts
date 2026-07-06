import { buildNumberBannedAlert } from "@check/shared";
import type { WhatsAppNumberHealth } from "@check/whatsapp";

import type { AlertPort } from "../observability/alert.port";

/** Persiste la salud de un número (lo satisface `WhatsAppStore`). */
export interface HealthPersistPort {
  saveHealth(waNumberId: string, health: WhatsAppNumberHealth): Promise<void>;
}

/** Lee el contexto de un baneo (lo satisface `WhatsAppStore`). */
export interface BanContextPort {
  getBanContext(waNumberId: string): Promise<{
    phoneNumber: string | null;
    affectedBusinesses: number;
    hasReplacement: boolean;
    replacementNumberIds: string[];
  }>;
}

/**
 * Decorador de `HealthStore` que dispara la alerta de baneo (Épica 11, E11-T3).
 *
 * Se interpone entre el `HealthMonitor` (E07-T9) y el store Prisma: en cada `saveHealth`
 * persiste igual que antes, pero además detecta la TRANSICIÓN a `banned` (el estado anterior
 * en memoria no era `banned` y el nuevo sí) y, solo entonces, reúne el contexto (números
 * afectados, reemplazo, necesidad de warmeo) y encola la alerta. Evita alertar en cada tick
 * mientras el número siga baneado. Testeable: `alerts`/`store`/`banContext` inyectables.
 */
export class BanAlertHealthStore {
  private readonly lastHealth = new Map<string, WhatsAppNumberHealth>();

  constructor(
    private readonly store: HealthPersistPort,
    private readonly banContext: BanContextPort,
    private readonly alerts: AlertPort,
  ) {}

  async saveHealth(waNumberId: string, health: WhatsAppNumberHealth): Promise<void> {
    const previous = this.lastHealth.get(waNumberId);
    await this.store.saveHealth(waNumberId, health);
    this.lastHealth.set(waNumberId, health);

    // Solo en la transición hacia `banned` (no en cada tick estando ya baneado).
    if (health === "banned" && previous !== "banned") {
      const ctx = await this.banContext.getBanContext(waNumberId);
      void this.alerts.dispatch(
        buildNumberBannedAlert({
          waNumberId,
          ...(ctx.phoneNumber ? { phoneNumber: ctx.phoneNumber } : {}),
          affectedBusinesses: ctx.affectedBusinesses,
          hasReplacement: ctx.hasReplacement,
          replacementNumberIds: ctx.replacementNumberIds,
        }),
      );
    }
  }
}
