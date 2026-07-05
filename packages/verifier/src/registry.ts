import { accountMatchDefense } from "./defenses/account-match.js";
import { emailMatchDefense } from "./defenses/email-match.js";
import { globalApprovalsDefense } from "./defenses/global-approvals.js";
import { imageForensicsDefense } from "./defenses/image-forensics.js";
import { structuralDefense } from "./defenses/structural.js";
import { suspiciousPatternsDefense } from "./defenses/suspicious-patterns.js";
import { timeWindowDefense } from "./defenses/time-window.js";
import type { Defense } from "./types.js";

/**
 * Registro de las 7 defensas reales de la Épica 6 (E06-T3..T9), en el orden en que
 * aparecen en el mapa de subtareas del PRD de la épica (`.trellis/tasks/07-03-epic-06-verification-engine/prd.md`).
 *
 * El orden no afecta el veredicto (`aggregate.ts` es determinista sin importar el
 * orden de las señales), pero se mantiene fijo por legibilidad/auditoría.
 *
 * Consumido por el worker de verificación (E06-T12) como:
 * `runDefenses(allDefenses, input)`.
 */
export const allDefenses: readonly Defense[] = [
  emailMatchDefense,
  globalApprovalsDefense,
  accountMatchDefense,
  timeWindowDefense,
  imageForensicsDefense,
  structuralDefense,
  suspiciousPatternsDefense,
];
