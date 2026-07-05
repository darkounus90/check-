export { aggregateSignals, runDefenses } from "./aggregate.js";
export { accountMatchDefense } from "./defenses/account-match.js";
export { BANK_EMAIL_MATCH_KIND, emailMatchDefense } from "./defenses/email-match.js";
export { GLOBAL_APPROVALS_KIND, globalApprovalsDefense } from "./defenses/global-approvals.js";
export { IMAGE_FORENSICS_KIND, imageForensicsDefense } from "./defenses/image-forensics.js";
export { STRUCTURAL_KIND, structuralDefense } from "./defenses/structural.js";
export {
  DEFAULT_FAILED_ATTEMPTS_THRESHOLD,
  SUSPICIOUS_PATTERNS_KIND,
  suspiciousPatternsDefense,
} from "./defenses/suspicious-patterns.js";
export { timeWindowDefense } from "./defenses/time-window.js";
export { allDefenses } from "./registry.js";
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
