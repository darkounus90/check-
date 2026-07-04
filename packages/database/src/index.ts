/**
 * Cliente de base de datos compartido (Prisma).
 *
 * Placeholder de la Épica 1 (E01-T5): sin schema real todavía.
 * El schema Prisma, migraciones y RLS llegan en la Épica 2.
 */

/** Marcador de posición del cliente de base de datos. Se reemplaza por PrismaClient en la Épica 2. */
export interface DatabaseClient {
  /** Indica si el cliente está configurado (placeholder). */
  readonly configured: boolean;
}

/** Crea un cliente placeholder. La conexión real se implementa en la Épica 2. */
export function createDatabaseClient(): DatabaseClient {
  return { configured: false };
}
