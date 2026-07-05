export { aggregateSignals, runDefenses } from "./aggregate.js";
export type { SignalOptions } from "./signal.js";
export { failSignal, notApplicableSignal, passSignal } from "./signal.js";
export type {
  PendingVerificationState,
  PendingWindow,
  RetryEvaluation,
} from "./state-machine.js";
export {
  isPendingWindowExpired,
  resolvePendingVerdict,
  retryPendingVerification,
} from "./state-machine.js";
export type {
  BusinessDefenseConfig,
  Defense,
  DefenseContext,
  DefenseInput,
  DefenseOutcome,
  DefenseSignal,
  EvidenceSource,
  Verdict,
  VerdictStatus,
} from "./types.js";
