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
  /// Habilita la instancia WhatsApp (Baileys) en este proceso (Épica 7, Grupo A).
  /// Por defecto apagada: sin un número configurado, los workers corren solo OCR/verificación.
  WHATSAPP_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /// Id del `WaNumber` (fila del schema) que esta instancia representa. Requerido si
  /// `WHATSAPP_ENABLED=true`. Un número/instancia por proceso por ahora (multi-instancia es E07-T7).
  WHATSAPP_WA_NUMBER_ID: z.string().min(1).optional(),
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
