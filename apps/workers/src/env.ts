import { z } from "zod";

/**
 * Validación tipada de variables de entorno de los workers.
 * Falla al arranque con un mensaje claro si una var requerida falta o es inválida.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /// Conexión Postgres (Prisma). La lee PrismaClient vía env("DATABASE_URL").
  DATABASE_URL: z.string().min(1),
  /// Cola de trabajos (BullMQ + Redis). Requerida desde la Épica 5 (E05-T3).
  REDIS_URL: z.string().url(),
  /// URL del proyecto Supabase (Storage: descarga de la imagen del comprobante).
  SUPABASE_URL: z.string().url(),
  /// Secret key de Supabase (Storage Admin API). Nunca se loguea.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type WorkersEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): WorkersEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(raíz)"}: ${i.message}`)
      .join("\n");
    throw new Error(`[workers] Config de entorno inválida:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
