/**
 * Cola de alertas + despachador a canales del equipo (Épica 11, E11-T2).
 *
 * Objetivo: NINGÚN error operacional se silencia. Un evento de alerta (baneo de número,
 * parser que rompe, cola atascada, excepción no manejada) se encola y se despacha a un
 * canal real configurable por env (webhook de Slack/Discord). El envío se reintenta ante
 * fallo; si tras los reintentos sigue fallando, se registra por el logger estructurado
 * (nunca se traga en silencio).
 *
 * Diseño testeable:
 * - `AlertTransport` es una interfaz inyectable ⇒ los tests usan un transporte mock.
 * - El reloj/`sleep` son inyectables ⇒ backoff determinista en test.
 * - `AlertDispatcher` es agnóstico del transporte concreto: Slack/Discord/email o mock.
 */

import { serializeError, type StructuredLogger } from "./logger.js";

/** Severidad de una alerta (orienta el formato/urgencia en el canal). */
export type AlertSeverity = "info" | "warning" | "critical";

/** Tipos de alerta operacional de la Épica 11 (categoría consultable). */
export type AlertKind =
  | "whatsapp_number_banned"
  | "parser_match_failure"
  | "queue_stuck"
  | "unhandled_error"
  | "readiness_degraded";

/** Un evento de alerta con contexto suficiente para que el equipo actúe. */
export interface AlertEvent {
  readonly kind: AlertKind;
  readonly severity: AlertSeverity;
  /** Título corto y accionable (aparece como primera línea en el canal). */
  readonly title: string;
  /** Contexto estructurado (números, negocios afectados, umbrales, etc.). */
  readonly context?: Record<string, unknown>;
}

/**
 * Transporte de alerta: entrega un evento a un canal concreto. Debe LANZAR si la entrega
 * falla (para que el despachador reintente). No debe tragar errores.
 */
export interface AlertTransport {
  readonly name: string;
  send(event: AlertEvent): Promise<void>;
}

/** Reloj/sleep inyectables para el backoff (deterministas en test). */
export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface AlertDispatcherOptions {
  readonly transport: AlertTransport;
  readonly logger: StructuredLogger;
  /** Máximo de intentos de entrega (incluye el primero). Por defecto 3. */
  readonly maxAttempts?: number;
  /** Backoff base en ms (crece exponencial: base, base*2, base*4…). Por defecto 500. */
  readonly backoffBaseMs?: number;
  readonly sleep?: Sleep;
}

/**
 * Despachador de alertas: encola eventos y los entrega por el transporte con reintento
 * exponencial. La entrega es asíncrona y serializada (una cola en memoria) para no bloquear
 * al productor de la alerta (un worker no debe esperar al webhook).
 *
 * Garantía anti-silencio: si un evento agota los reintentos, se loguea como `error`
 * estructurado con el evento completo. El error nunca desaparece.
 */
export class AlertDispatcher {
  private readonly transport: AlertTransport;
  private readonly logger: StructuredLogger;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly sleep: Sleep;

  private queue: AlertEvent[] = [];
  private draining: Promise<void> | null = null;

  constructor(options: AlertDispatcherOptions) {
    this.transport = options.transport;
    this.logger = options.logger;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.backoffBaseMs = options.backoffBaseMs ?? 500;
    this.sleep = options.sleep ?? realSleep;
  }

  /**
   * Encola un evento y arranca el drenado si no está corriendo. No lanza: el productor
   * (worker/api) nunca debe fallar por un problema de alertas. Devuelve la promesa del
   * drenado en curso para que los tests puedan esperar la entrega (`await dispatch(...)`).
   */
  dispatch(event: AlertEvent): Promise<void> {
    this.queue.push(event);
    if (!this.draining) {
      this.draining = this.drain().finally(() => {
        this.draining = null;
      });
    }
    return this.draining;
  }

  /** Espera a que la cola termine de drenar (útil en tests y en shutdown). */
  async flush(): Promise<void> {
    if (this.draining) await this.draining;
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      await this.deliver(event);
    }
  }

  private async deliver(event: AlertEvent): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        await this.transport.send(event);
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn("alert delivery failed, will retry", {
          kind: event.kind,
          transport: this.transport.name,
          attempt,
          maxAttempts: this.maxAttempts,
          error: serializeError(error),
        });
        if (attempt < this.maxAttempts) {
          await this.sleep(this.backoffBaseMs * 2 ** (attempt - 1));
        }
      }
    }
    // Anti-silencio: agotados los reintentos, el evento y el error quedan en el log
    // estructurado (consultable), nunca se descarta silenciosamente.
    this.logger.error("alert delivery exhausted retries", {
      alert: event,
      transport: this.transport.name,
      attempts: this.maxAttempts,
      error: serializeError(lastError),
    });
  }
}

/**
 * Transporte no-op: descarta el evento pero lo registra por el logger. Se usa cuando no hay
 * webhook configurado (dev/local): las alertas siguen siendo observables en los logs, en vez
 * de desaparecer. NO lanza (no tiene sentido reintentar un no-op).
 */
export class LoggerAlertTransport implements AlertTransport {
  readonly name = "logger";
  constructor(private readonly logger: StructuredLogger) {}

  async send(event: AlertEvent): Promise<void> {
    this.logger.warn(`[ALERTA] ${event.title}`, {
      kind: event.kind,
      severity: event.severity,
      ...(event.context ?? {}),
    });
  }
}

/** Estilo de payload del webhook: Slack o Discord usan campos distintos para el texto. */
export type WebhookStyle = "slack" | "discord";

export interface WebhookTransportOptions {
  readonly url: string;
  /** `slack` (campo `text`) o `discord` (campo `content`). Por defecto `slack`. */
  readonly style?: WebhookStyle;
  /** `fetch` inyectable (por defecto el global). Permite mockear en test sin red. */
  readonly fetchFn?: typeof fetch;
}

/**
 * Transporte real por webhook (Slack o Discord). Formatea el evento a texto legible y
 * hace POST del JSON esperado por cada plataforma. Lanza si la respuesta no es 2xx para
 * que el despachador reintente.
 */
export class WebhookAlertTransport implements AlertTransport {
  readonly name: string;
  private readonly url: string;
  private readonly style: WebhookStyle;
  private readonly fetchFn: typeof fetch;

  constructor(options: WebhookTransportOptions) {
    this.url = options.url;
    this.style = options.style ?? "slack";
    this.name = `webhook:${this.style}`;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async send(event: AlertEvent): Promise<void> {
    const text = formatAlertText(event);
    const body =
      this.style === "discord" ? { content: text } : { text };
    const response = await this.fetchFn(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`webhook ${this.style} respondió ${response.status}`);
    }
  }
}

const SEVERITY_ICON: Record<AlertSeverity, string> = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🚨",
};

/** Formatea un evento de alerta a texto multi-línea legible para un canal de chat. */
export function formatAlertText(event: AlertEvent): string {
  const header = `${SEVERITY_ICON[event.severity]} [${event.severity.toUpperCase()}] ${event.title}`;
  const lines = [header, `tipo: ${event.kind}`];
  if (event.context) {
    for (const [key, value] of Object.entries(event.context)) {
      lines.push(`• ${key}: ${formatValue(value)}`);
    }
  }
  return lines.join("\n");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Construye el transporte de alertas según env. Si hay `ALERT_WEBHOOK_URL`, usa el webhook
 * real (Slack por defecto, Discord si `ALERT_WEBHOOK_STYLE=discord`); si no, cae al
 * transporte que loguea (dev/local) — las alertas nunca se pierden. `fetchFn` es inyectable
 * para test.
 */
export function buildAlertTransportFromEnv(
  config: {
    readonly webhookUrl?: string | undefined;
    readonly webhookStyle?: WebhookStyle | undefined;
  },
  logger: StructuredLogger,
  fetchFn?: typeof fetch,
): AlertTransport {
  if (config.webhookUrl) {
    return new WebhookAlertTransport({
      url: config.webhookUrl,
      ...(config.webhookStyle ? { style: config.webhookStyle } : {}),
      ...(fetchFn ? { fetchFn } : {}),
    });
  }
  return new LoggerAlertTransport(logger);
}
