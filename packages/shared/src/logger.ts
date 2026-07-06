/**
 * Logger estructurado compartido (Épica 11, E11-T1).
 *
 * Objetivo: todos los servicios del monorepo pueden emitir logs en formato JSON
 * consultable con contexto de correlación (`businessId`/`transactionId`/`voucherId`, etc.).
 * La adopción es incremental: exponemos el logger y lo usamos en los puntos nuevos de la
 * Épica 11 sin reescribir el logging existente basado en `@nestjs/common` `Logger`.
 *
 * Diseño:
 * - API mínima `info/warn/error/debug(message, meta?)`.
 * - `child(context)` deriva un logger con contexto acumulado (correlación): cada línea
 *   emitida lleva los campos del contexto sin repetirlos en cada llamada.
 * - El "sink" (destino) es inyectable ⇒ testeable sin tocar stdout real. En producción el
 *   default serializa a una sola línea JSON por evento (consultable por herramientas de logs).
 * - El reloj es inyectable ⇒ timestamps deterministas en test.
 */

/** Niveles de severidad soportados, de menor a mayor. */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Campos de correlación/estructura que acompañan a un log. Valores JSON-serializables. */
export type LogContext = Record<string, unknown>;

/** Un evento de log ya resuelto (nivel + mensaje + contexto + timestamp ISO). */
export interface LogRecord {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: string;
  readonly context: LogContext;
}

/** Destino de los eventos de log. El default escribe una línea JSON a stdout/stderr. */
export type LogSink = (record: LogRecord) => void;

/** Reloj inyectable para timestamps deterministas en test. */
export type LogClock = () => Date;

export interface LoggerOptions {
  /** Contexto base heredado por todas las líneas (p. ej. `{ service: "workers" }`). */
  readonly context?: LogContext;
  /** Nivel mínimo a emitir (por defecto `info`). */
  readonly level?: LogLevel;
  /** Destino de los eventos (por defecto `consoleJsonSink`). */
  readonly sink?: LogSink;
  /** Reloj (por defecto `() => new Date()`). */
  readonly clock?: LogClock;
}

/**
 * Sink por defecto: una línea JSON por evento. `error`/`warn` van a stderr, el resto a
 * stdout, para que el hosting los clasifique. Nunca lanza: un fallo serializando se degrada
 * a un JSON mínimo, jamás rompe el flujo que estaba logueando.
 */
export const consoleJsonSink: LogSink = (record) => {
  let line: string;
  try {
    line = JSON.stringify(record);
  } catch {
    line = JSON.stringify({
      level: record.level,
      message: record.message,
      timestamp: record.timestamp,
      context: { serializationError: true },
    });
  }
  if (record.level === "error" || record.level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
};

/** Sink en memoria para tests: acumula los eventos emitidos. */
export function createMemorySink(): { sink: LogSink; records: LogRecord[] } {
  const records: LogRecord[] = [];
  return { sink: (record) => records.push(record), records };
}

/**
 * Logger estructurado con contexto de correlación acumulable.
 *
 * ```ts
 * const log = new StructuredLogger({ context: { service: "workers" } });
 * const jobLog = log.child({ voucherId, businessId });
 * jobLog.info("ocr completado", { durationMs: 1234 });
 * ```
 */
export class StructuredLogger {
  private readonly baseContext: LogContext;
  private readonly minLevel: LogLevel;
  private readonly sink: LogSink;
  private readonly clock: LogClock;

  constructor(options: LoggerOptions = {}) {
    this.baseContext = options.context ?? {};
    this.minLevel = options.level ?? "info";
    this.sink = options.sink ?? consoleJsonSink;
    this.clock = options.clock ?? (() => new Date());
  }

  /** Deriva un logger hijo con contexto adicional (el hijo hereda sink/clock/nivel). */
  child(context: LogContext): StructuredLogger {
    return new StructuredLogger({
      context: { ...this.baseContext, ...context },
      level: this.minLevel,
      sink: this.sink,
      clock: this.clock,
    });
  }

  debug(message: string, meta?: LogContext): void {
    this.emit("debug", message, meta);
  }

  info(message: string, meta?: LogContext): void {
    this.emit("info", message, meta);
  }

  warn(message: string, meta?: LogContext): void {
    this.emit("warn", message, meta);
  }

  /**
   * Log de error. Si se pasa un `Error` como meta (o dentro de `meta.error`), se
   * normaliza a `{ name, message, stack }` para que quede consultable en JSON.
   */
  error(message: string, meta?: LogContext | Error): void {
    this.emit("error", message, normalizeErrorMeta(meta));
  }

  private emit(level: LogLevel, message: string, meta?: LogContext): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const record: LogRecord = {
      level,
      message,
      timestamp: this.clock().toISOString(),
      context: { ...this.baseContext, ...(meta ?? {}) },
    };
    this.sink(record);
  }
}

/** Serializa un `Error` a una forma JSON consultable. */
export function serializeError(error: unknown): LogContext {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function normalizeErrorMeta(meta?: LogContext | Error): LogContext | undefined {
  if (meta === undefined) return undefined;
  if (meta instanceof Error) return { error: serializeError(meta) };
  if ("error" in meta && meta.error instanceof Error) {
    return { ...meta, error: serializeError(meta.error) };
  }
  return meta;
}
