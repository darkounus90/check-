import type { Defense, DefenseInput, DefenseOutcome, DefenseSignal } from "../src/index.ts";

export interface MockDefenseOptions {
  readonly kind: string;
  readonly outcome: DefenseOutcome;
  readonly enablesGreen?: boolean;
  readonly weight?: number;
  readonly detail?: string;
  /** Si `true`, `evaluate` resuelve la señal de forma asíncrona (simula I/O real). */
  readonly async?: boolean;
}

/** Defensa mock para tests: implementa el contrato `Defense` con un resultado fijo. */
export function mockDefense(opts: MockDefenseOptions): Defense {
  const signal: DefenseSignal = {
    kind: opts.kind,
    outcome: opts.outcome,
    weight: opts.weight ?? (opts.outcome === "not_applicable" ? 0 : 1),
    enablesGreen: opts.enablesGreen ?? false,
    ...(opts.detail !== undefined ? { detail: opts.detail } : {}),
  };

  return {
    kind: opts.kind,
    evaluate(_input: DefenseInput): DefenseSignal | Promise<DefenseSignal> {
      return opts.async ? Promise.resolve(signal) : signal;
    },
  };
}
