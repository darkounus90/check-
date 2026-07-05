import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";

/**
 * Puerta de entrada a la base global de números de aprobación (Épica 2, E02-T11, D6):
 * envuelve las funciones SQL crudas `approval_number_exists`/`approval_number_register`
 * (`packages/database/prisma/migrations/1_rls_policies/migration.sql`) para que el
 * gatherer de contexto (`verification.context.ts`) y el procesador
 * (`verification.processor.ts`) no dependan directamente de `prisma.$queryRaw`
 * (facilita inyectar un fake en tests, mismo patrón que `VoucherStore`/`VerificationStore`).
 */
export interface ApprovalNumberGateway {
  /** `true`/`false` según exista o no el número en la red (solo-existencia, D6); nunca
   * revela de qué negocio provino. Puede lanzar si la consulta falla (el llamador decide
   * cómo tratar esa falla — ver `verification.context.ts`). */
  exists(bank: string, approvalNumber: string): Promise<boolean>;
  /** Registra un número como usado (idempotente por el índice único global
   * `(bank, approvalNumber)`). Se invoca únicamente tras persistir un veredicto
   * `VERIFIED` (ver `verification.processor.ts`). */
  register(bank: string, approvalNumber: string, businessId: string): Promise<void>;
}

/** Fila cruda que devuelve `select approval_number_exists(...)`. */
interface ApprovalNumberExistsRow {
  approval_number_exists: boolean;
}

/** Implementación real sobre `PrismaService` (`$queryRaw`, E06-T12). */
@Injectable()
export class PrismaApprovalNumberGateway implements ApprovalNumberGateway {
  constructor(private readonly prisma: PrismaService) {}

  async exists(bank: string, approvalNumber: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<ApprovalNumberExistsRow[]>`
      select approval_number_exists(${bank}, ${approvalNumber}) as approval_number_exists
    `;
    return rows[0]?.approval_number_exists ?? false;
  }

  async register(bank: string, approvalNumber: string, businessId: string): Promise<void> {
    await this.prisma.$queryRaw`
      select approval_number_register(${bank}, ${approvalNumber}, ${businessId})
    `;
  }
}
