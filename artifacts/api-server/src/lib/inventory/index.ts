/**
 * Public surface of the advanced-inventory module.
 *
 * Today this is types + the three pure valuation pickers. Lot
 * lifecycle DB helpers, serial allocation, cycle-count workflow,
 * and ABC analysis land in weeks 2-4 (see
 * docs/INVENTORY_ADVANCED_DESIGN.md).
 */

export * from "./types.js";
export {
  pickFifo,
  pickLifo,
  pickAverage,
  computeWeightedAverage,
  pickWithMethod,
} from "./valuation/index.js";
export {
  assertLotTransition,
  nextStatusAfterQc,
  shouldExpire,
  IllegalLotTransitionError,
} from "./lots-fsm.js";
export type { ReceiveLotInput, ExpireScanOutcome } from "./lots.js";
export {
  receiveLot,
  qcApprove,
  qcReject,
  recallLot,
  expireDueLots,
  lotExpiryScanCron,
} from "./lots.js";

export type {
  VarianceInput,
  VarianceLine,
  ScheduleCycleCountInput,
} from "./cycle-count.js";
export {
  computeVarianceLines,
  summariseVariance,
  nextCycleCountStatus,
  assertApprovalEligible,
  IllegalCycleCountTransitionError,
  scheduleCycleCount,
  recordCount,
  submitForReview,
  approveCycleCount,
} from "./cycle-count.js";

export type { AbcInput, AbcLine, AbcThresholds, AbcRunOutcome } from "./abc-analysis.js";
export {
  classifyAbc,
  runAbcAnalysis,
  abcMonthlyClassificationCron,
  DEFAULT_ABC_THRESHOLDS,
} from "./abc-analysis.js";

// Cycle-count variance → journal entry wiring
export type {
  CycleCountLineForJournal,
  CycleCountTotals,
  CycleCountAccounts,
  PostCycleCountOpts,
  PostCycleCountOutcome,
} from "./post-cycle-count-journal.js";
export {
  aggregateCycleCount,
  buildCycleCountEntryInput,
  postCycleCountVarianceJournal,
} from "./post-cycle-count-journal.js";

// Pre-expiry warning cron (Task #277)
export type { ExpiryWarningOutcome } from "./expiry-warning.js";
export {
  pickAlertThreshold,
  runExpiryWarnings,
  lotExpiryWarningCron,
} from "./expiry-warning.js";

// ABC-driven cycle-count plan generator (Task #277)
export type { GeneratePlanInput, GeneratePlanOutcome } from "./cycle-count-plan.js";
export { generateCycleCountPlan } from "./cycle-count-plan.js";

// Lot lifecycle write-off → journal entry wiring
export type {
  LotWriteoffStatus,
  LotWriteoffAccounts,
  PostLotWriteoffOpts,
  PostLotWriteoffOutcome,
} from "./post-lot-writeoff-journal.js";
export {
  buildLotWriteoffEntryInput,
  postLotWriteoffJournal,
} from "./post-lot-writeoff-journal.js";
