/**
 * Utilidades de health/readiness compartidas (Épica 11, E11-T8).
 *
 * Objetivo: cada app (api/workers) expone un readiness consumible por el hosting que
 * comprueba dependencias reales (DB reachable, Redis reachable, …). Aquí vive la parte
 * agnóstica: correr una lista de `HealthCheck` inyectables con timeout y agregar el estado.
 * Las comprobaciones concretas (Prisma `SELECT 1`, `redis.ping()`) las cablea cada app.
 */

/** Estado agregado de salud. `degraded` = alguna dependencia no-crítica falla. */
export type HealthStatus = "ok" | "degraded" | "down";

/** Resultado de una comprobación individual. */
export interface HealthCheckResult {
  readonly name: string;
  readonly status: "ok" | "down";
  readonly durationMs: number;
  readonly error?: string;
  /** Si `false`, su fallo degrada pero no tumba el readiness global. Por defecto `true`. */
  readonly critical: boolean;
}

/** Una comprobación de dependencia. `probe` debe resolver (ok) o lanzar (down). */
export interface HealthCheck {
  readonly name: string;
  /** Si es crítica, su fallo hace el readiness global `down`. Por defecto `true`. */
  readonly critical?: boolean;
  probe(): Promise<void>;
}

/** Reporte de readiness agregado. */
export interface ReadinessReport {
  readonly status: HealthStatus;
  readonly checks: readonly HealthCheckResult[];
  readonly timestamp: string;
}

export interface RunHealthChecksOptions {
  /** Timeout por comprobación (ms). Por defecto 3000. */
  readonly timeoutMs?: number;
  /** Reloj para timestamp/duración (por defecto `Date.now`). */
  readonly now?: () => number;
}

/**
 * Corre todas las comprobaciones en paralelo con timeout individual y agrega el estado:
 * - `down`   si alguna comprobación CRÍTICA falla,
 * - `degraded` si solo fallan no-críticas,
 * - `ok`     si todas pasan.
 * Nunca lanza: un `probe` que rechaza se traduce en `status: "down"` para esa comprobación.
 */
export async function runHealthChecks(
  checks: readonly HealthCheck[],
  options: RunHealthChecksOptions = {},
): Promise<ReadinessReport> {
  const timeoutMs = options.timeoutMs ?? 3000;
  const now = options.now ?? (() => Date.now());

  const results = await Promise.all(
    checks.map((check) => runOne(check, timeoutMs, now)),
  );

  let status: HealthStatus = "ok";
  for (const result of results) {
    if (result.status === "down") {
      if (result.critical) return aggregate("down", results, now);
      status = "degraded";
    }
  }
  return aggregate(status, results, now);
}

function aggregate(
  status: HealthStatus,
  checks: readonly HealthCheckResult[],
  now: () => number,
): ReadinessReport {
  return { status, checks, timestamp: new Date(now()).toISOString() };
}

async function runOne(
  check: HealthCheck,
  timeoutMs: number,
  now: () => number,
): Promise<HealthCheckResult> {
  const critical = check.critical ?? true;
  const startedAt = now();
  try {
    await withTimeout(check.probe(), timeoutMs, check.name);
    return { name: check.name, status: "ok", durationMs: now() - startedAt, critical };
  } catch (error) {
    return {
      name: check.name,
      status: "down",
      durationMs: now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      critical,
    };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`health check '${name}' timeout tras ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
