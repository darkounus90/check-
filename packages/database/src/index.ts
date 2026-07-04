import { PrismaClient } from "@prisma/client";

export type { Prisma } from "@prisma/client";
export { PrismaClient } from "@prisma/client";
export {
  BankEmailStatus,
  IssuerBank,
  MailboxStatus,
  NumberHealth,
  ReceiverBank,
  Role,
  VerdictStatus,
} from "@prisma/client";

let client: PrismaClient | undefined;

/** Devuelve un singleton de PrismaClient (evita múltiples pools en desarrollo). */
export function getPrismaClient(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}
