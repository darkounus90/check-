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
  /// Dominio público donde vive la PWA/enrutador de QR (Épica 8). El QR impreso de cada
  /// negocio apunta a `${PUBLIC_APP_URL}/n/{opaqueId}`. Configurable por despliegue (D1).
  PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // ── Observabilidad (Épica 11) ──────────────────────────────
  /// Webhook del canal de alertas del equipo (Slack o Discord). Si falta, las alertas se
  /// loguean en JSON (nunca se pierden) pero no salen a un canal externo. (E11-T2)
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  /// Estilo del webhook: `slack` (campo `text`) o `discord` (campo `content`). (E11-T2)
  ALERT_WEBHOOK_STYLE: z.enum(["slack", "discord"]).default("slack"),

  // ── Hardening / cumplimiento (Épica 12) ────────────────────
  /// Claves de cifrado en reposo (E12-T1/T2). Formato: `v<n>:<base64-32B>` separadas por coma
  /// (mayor versión = activa para cifrar; el resto solo descifra ⇒ rotación sin pérdida).
  /// Opcional: si falta, el cifrado a nivel de aplicación queda desactivado (datos en claro,
  /// solo aceptable en dev). En producción DEBE definirse.
  ENCRYPTION_KEYS: z.string().optional(),
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
