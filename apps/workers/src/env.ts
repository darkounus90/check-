import { z } from "zod";

/**
 * Validación tipada de variables de entorno de los workers.
 * Falla al arranque con un mensaje claro si una var requerida falta o es inválida.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /// Puerto del endpoint HTTP de salud/métricas de los workers (E11-T8), consumible por el
  /// hosting. Los workers no exponen API de negocio; solo health/readiness/metrics.
  HEALTH_PORT: z.coerce.number().int().positive().default(3002),
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
  /// Humanización anti-baneo (E07-T4): horario del negocio. Fuera de esta ventana NO se
  /// responde (se pospone). Horas locales 0–24; offset TZ en minutos (Colombia = -300).
  /// Si no se configuran, la instancia responde 24/7.
  WHATSAPP_BUSINESS_START_HOUR: z.coerce.number().int().min(0).max(23).optional(),
  WHATSAPP_BUSINESS_END_HOUR: z.coerce.number().int().min(1).max(24).optional(),
  WHATSAPP_BUSINESS_UTC_OFFSET_MINUTES: z.coerce.number().int().default(-300),

  // ── Observabilidad (Épica 11) ──────────────────────────────
  /// Webhook del canal de alertas del equipo (Slack o Discord). Si falta, las alertas se
  /// loguean en JSON (nunca se pierden) pero no salen a un canal externo. (E11-T2)
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  /// Estilo del webhook: `slack` (campo `text`) o `discord` (campo `content`). (E11-T2)
  ALERT_WEBHOOK_STYLE: z.enum(["slack", "discord"]).default("slack"),
  /// Umbrales del monitor de colas BullMQ (E11-T5). Backlog / jobs fallidos / edad del job
  /// (ms) sobre los que se dispara alerta de cola atascada. Chequeo cada `QUEUE_MONITOR_INTERVAL_MS`.
  QUEUE_MONITOR_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  QUEUE_MONITOR_MAX_WAITING: z.coerce.number().int().nonnegative().default(100),
  QUEUE_MONITOR_MAX_FAILED: z.coerce.number().int().nonnegative().default(20),
  QUEUE_MONITOR_MAX_OLDEST_MS: z.coerce.number().int().nonnegative().default(300_000),

  // ── Hardening / cumplimiento (Épica 12) ────────────────────
  /// Claves de cifrado en reposo (E12-T1/T2). Formato: `v<n>:<base64-32B>` separadas por coma
  /// (mayor versión = activa para cifrar; el resto solo descifra ⇒ rotación sin pérdida).
  /// Opcional: si falta, el cifrado a nivel de aplicación queda desactivado (solo dev).
  ENCRYPTION_KEYS: z.string().optional(),
  /// Ventanas de retención en días por tipo de dato (E12-T3). Opcionales; caen a los
  /// defaults de `@check/shared` (voucher 365, bankEmail 365, qrResolutionLog 180, waSession 90).
  RETENTION_VOUCHER_DAYS: z.coerce.number().int().positive().optional(),
  RETENTION_BANK_EMAIL_DAYS: z.coerce.number().int().positive().optional(),
  RETENTION_QR_LOG_DAYS: z.coerce.number().int().positive().optional(),
  RETENTION_WA_SESSION_DAYS: z.coerce.number().int().positive().optional(),
  /// Intervalo del job de purga de retención (E12-T3). Default: cada 24h.
  RETENTION_PURGE_INTERVAL_MS: z.coerce.number().int().positive().default(86_400_000),
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
