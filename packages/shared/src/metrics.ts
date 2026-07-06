/**
 * Métricas básicas de salud (Épica 11, E11-T7).
 *
 * Objetivo: exponer de forma consultable las métricas de las success-metrics del PRD:
 * tiempo a veredicto, tasa de parseo por banco, uptime del canal. Diseño simple en memoria
 * (sin dependencias externas): contadores y un histograma de duraciones con percentiles.
 * El proceso vuelca el snapshot por un endpoint (api/workers) o como log estructurado.
 *
 * No pretende ser Prometheus: es un registro liviano y agregable, consultable en JSON.
 */

/** Snapshot de un histograma de duraciones (ms). */
export interface DurationStats {
  readonly count: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly avgMs: number;
}

/** Snapshot de una tasa de éxito/fallo (p. ej. parseo por banco). */
export interface RateStats {
  readonly total: number;
  readonly ok: number;
  readonly failed: number;
  /** Fracción de éxito 0..1 (0 si `total` es 0). */
  readonly successRate: number;
}

/** Snapshot completo del registro de métricas. */
export interface MetricsSnapshot {
  readonly counters: Record<string, number>;
  readonly durations: Record<string, DurationStats>;
  /** Tasas con desglose por etiqueta (p. ej. `parse` → `bancolombia`/`bbva`). */
  readonly rates: Record<string, Record<string, RateStats>>;
  readonly uptimeSeconds: number;
}

/** Reloj inyectable (epoch ms) para uptime determinista en test. */
export type MetricsClock = () => number;

interface RateBucket {
  ok: number;
  failed: number;
}

/**
 * Registro de métricas en memoria. Thread-safe no aplica (Node single-thread). Un proceso
 * suele tener una sola instancia (`sharedMetrics`), pero es instanciable para test.
 */
export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly durations = new Map<string, number[]>();
  private readonly rates = new Map<string, Map<string, RateBucket>>();
  private readonly startedAtMs: number;
  private readonly clock: MetricsClock;
  /** Cota de muestras por histograma para no crecer sin límite (ventana móvil). */
  private readonly maxSamples: number;

  constructor(options: { clock?: MetricsClock; maxSamples?: number } = {}) {
    this.clock = options.clock ?? (() => Date.now());
    this.maxSamples = options.maxSamples ?? 1000;
    this.startedAtMs = this.clock();
  }

  /** Incrementa un contador nombrado. */
  increment(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  /** Registra una duración (ms) en el histograma nombrado (ventana móvil acotada). */
  recordDuration(name: string, ms: number): void {
    let samples = this.durations.get(name);
    if (!samples) {
      samples = [];
      this.durations.set(name, samples);
    }
    samples.push(ms);
    if (samples.length > this.maxSamples) samples.shift();
  }

  /**
   * Registra un resultado (éxito/fallo) en una tasa etiquetada. Ej.:
   * `recordOutcome("parse", "bancolombia", true)` → tasa de parseo del banco.
   */
  recordOutcome(metric: string, label: string, ok: boolean): void {
    let byLabel = this.rates.get(metric);
    if (!byLabel) {
      byLabel = new Map<string, RateBucket>();
      this.rates.set(metric, byLabel);
    }
    let bucket = byLabel.get(label);
    if (!bucket) {
      bucket = { ok: 0, failed: 0 };
      byLabel.set(label, bucket);
    }
    if (ok) bucket.ok += 1;
    else bucket.failed += 1;
  }

  /** Snapshot inmutable de todas las métricas, consultable en JSON. */
  snapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    for (const [name, value] of this.counters) counters[name] = value;

    const durations: Record<string, DurationStats> = {};
    for (const [name, samples] of this.durations) {
      durations[name] = summarizeDurations(samples);
    }

    const rates: Record<string, Record<string, RateStats>> = {};
    for (const [metric, byLabel] of this.rates) {
      const out: Record<string, RateStats> = {};
      for (const [label, bucket] of byLabel) {
        const total = bucket.ok + bucket.failed;
        out[label] = {
          total,
          ok: bucket.ok,
          failed: bucket.failed,
          successRate: total === 0 ? 0 : bucket.ok / total,
        };
      }
      rates[metric] = out;
    }

    return {
      counters,
      durations,
      rates,
      uptimeSeconds: Math.max(0, Math.round((this.clock() - this.startedAtMs) / 1000)),
    };
  }
}

function summarizeDurations(samples: readonly number[]): DurationStats {
  if (samples.length === 0) {
    return { count: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, avgMs: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, n) => acc + n, 0);
  return {
    count: sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted[sorted.length - 1]!,
    avgMs: Math.round(sum / sorted.length),
  };
}

/** Percentil por nearest-rank sobre un arreglo YA ordenado ascendente. */
function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(q * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index]!;
}

/** Registro de métricas compartido por proceso (default). */
export const sharedMetrics = new MetricsRegistry();
