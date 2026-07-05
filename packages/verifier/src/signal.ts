import type { DefenseOutcome, DefenseSignal } from "./types.js";

/** Opciones comunes al construir una `DefenseSignal` con los helpers de abajo. */
export interface SignalOptions {
  readonly weight?: number;
  readonly enablesGreen?: boolean;
  readonly detail?: string;
}

function buildSignal(kind: string, outcome: DefenseOutcome, opts: SignalOptions): DefenseSignal {
  return {
    kind,
    outcome,
    weight: outcome === "not_applicable" ? 0 : (opts.weight ?? 1),
    enablesGreen: opts.enablesGreen ?? false,
    ...(opts.detail !== undefined ? { detail: opts.detail } : {}),
  };
}

/** Construye una señal de defensa que pasa (no detecta fraude). */
export function passSignal(kind: string, opts: SignalOptions = {}): DefenseSignal {
  return buildSignal(kind, "pass", opts);
}

/** Construye una señal de defensa que falla (detecta una posible señal de fraude). */
export function failSignal(kind: string, opts: SignalOptions = {}): DefenseSignal {
  return buildSignal(kind, "fail", opts);
}

/**
 * Construye una señal "no aplica": la defensa no pudo evaluarse (ej. dato ilegible)
 * y por diseño **no penaliza** el veredicto (D4).
 */
export function notApplicableSignal(kind: string, opts: SignalOptions = {}): DefenseSignal {
  return buildSignal(kind, "not_applicable", opts);
}
