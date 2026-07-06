import { z } from "zod";

/**
 * Validación tipada de variables de entorno de la API.
 * Falla al arranque con un mensaje claro si una var requerida falta o es inválida.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  /// URL del proyecto Supabase (para verificar JWT vía JWKS, sin secreto).
  SUPABASE_URL: z.string().url(),
  /// Conexión Postgres (Prisma). La lee PrismaClient vía env("DATABASE_URL").
  DATABASE_URL: z.string().min(1),
  /// Secret key de Supabase (Admin API: crear usuarios/cajeros). Nunca se loguea.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /// Dominio del buzón entrante (configurable — D1/D2). Placeholder hasta tener dominio propio.
  INBOUND_EMAIL_DOMAIN: z.string().default("inbound.check.local"),
  /// Secreto compartido para autenticar el webhook de Postmark Inbound (E04-T1).
  POSTMARK_INBOUND_SECRET: z.string().default("dev-inbound-secret"),
  /// Redis para encolar OCR de comprobantes públicos (BullMQ, E09-T4).
  /// Misma instancia que consumen los workers (cola `ocr-processing`).
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
});

export type ApiEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(raíz)"}: ${i.message}`)
      .join("\n");
    throw new Error(`[api] Config de entorno inválida:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
