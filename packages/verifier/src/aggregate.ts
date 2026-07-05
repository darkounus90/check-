import type { Defense, DefenseInput, DefenseSignal, EvidenceSource, Verdict } from "./types.js";

/**
 * Ejecuta un conjunto de `Defense` sobre el mismo `DefenseInput` y agrega sus señales
 * en un único `Verdict` determinista (E06-T1).
 *
 * Reglas de agregación:
 * - Si **alguna** defensa falla (`outcome === "fail"`), el veredicto es `SUSPICIOUS` (🚨),
 *   sin importar cuántas otras pasen. Cada defensa decide su propio umbral internamente
 *   (D4: ilegible → `not_applicable`, nunca `fail`, para no penalizar por sí sola).
 * - Si ninguna falla y la defensa marcada `enablesGreen` (Defensa 1, E06-T3) pasó,
 *   el veredicto es `VERIFIED` (🟢).
 * - En cualquier otro caso (sin defensa `enablesGreen` configurada, o configurada pero
 *   no pasó todavía — ej. correo aún no llega) el veredicto es `PENDING` (🟡). Esto aplica
 *   la regla dura de la épica: **sin cruce con correo real del banco receptor, nunca 🟢.**
 *
 * El orden de las defensas no afecta el resultado: el agregador es determinista para
 * un mismo conjunto de señales.
 */
export async function runDefenses(
  defenses: readonly Defense[],
  input: DefenseInput,
): Promise<Verdict> {
  const signals = await Promise.all(defenses.map((defense) => defense.evaluate(input)));
  return aggregateSignals(signals);
}

/** Agrega señales ya calculadas en un `Verdict`. Útil para tests que no necesitan `Defense`s. */
export function aggregateSignals(signals: readonly DefenseSignal[]): Verdict {
  const evidenceSources: EvidenceSource[] = signals.map((signal) => ({
    kind: signal.kind,
    passed: signal.outcome !== "fail",
    ...(signal.detail !== undefined ? { detail: signal.detail } : {}),
  }));

  const anyFailed = signals.some((signal) => signal.outcome === "fail");
  const greenSignal = signals.find((signal) => signal.enablesGreen);
  const greenPassed = greenSignal?.outcome === "pass";

  if (anyFailed) {
    return {
      status: "SUSPICIOUS",
      evidenceSources,
      reason: "una o más defensas detectaron una señal de fraude",
    };
  }

  if (greenPassed) {
    return {
      status: "VERIFIED",
      evidenceSources,
      reason: "todas las defensas evaluadas pasaron y la Defensa 1 (correo real) confirmó la operación",
    };
  }

  return {
    status: "PENDING",
    evidenceSources,
    reason: greenSignal
      ? "la Defensa 1 (correo real del banco receptor) aún no confirma la operación"
      : "sin Defensa 1 (correo real del banco receptor) configurada; el veredicto nunca puede ser VERIFIED",
  };
}
