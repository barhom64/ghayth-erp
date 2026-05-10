/**
 * Public surface of the Saudi-compliance module.
 *
 * Today: WPS file builder + ack parser + Nitaqat classifier + Iqama
 * alert selector. Mudad client + per-bank format adapters land in
 * weeks 2-4 (see docs/SAUDI_COMPLIANCE_DESIGN.md).
 */

export type {
  NitaqatCategory,
  WpsRunStatus,
  WpsLineStatus,
  MudadType,
  MudadStatus,
  WpsPayrollEntry,
  WpsRunSummary,
  WpsBuildResult,
  WpsFormat,
  SaudizationInput,
  SaudizationResult,
  IqamaExpiryWatch,
} from "./types.js";

export type { BuildWpsFileInput } from "./wps/builder.js";
export { buildWpsFile, isSaudiIban } from "./wps/builder.js";

export type { ParsedAckLine, ParsedAckFile } from "./wps/parser.js";
export { parseAckFile } from "./wps/parser.js";

// WPS run orchestrator (week 5)
export type {
  CreateWpsRunInput,
  BuildAndPersistInput,
  BuildAndPersistOutcome,
  AckOutcome,
  ApplyAckOutcome,
} from "./wps/run.js";
export {
  assertWpsTransition,
  deriveHeaderStatus,
  createWpsRun,
  buildAndPersist,
  submitWpsRun,
  applyAck,
  IllegalWpsTransitionError,
} from "./wps/run.js";

export { classifyNitaqat } from "./nitaqat.js";

export {
  selectExpiringIqamas,
  IQAMA_ALERT_THRESHOLDS_DAYS,
} from "./iqama-alerts.js";

export type { SnapshotPerCompany, SnapshotRunOutcome } from "./saudization-snapshot.js";
export {
  computeSnapshot,
  isSaudiNationality,
  runSaudizationSnapshot,
  saudizationMonthlySnapshotCron,
} from "./saudization-snapshot.js";

export type { IqamaCronOutcome } from "./iqama-cron.js";
export {
  runIqamaDailyAlerts,
  iqamaDailyAlertCron,
  formatAlertMessage,
} from "./iqama-cron.js";

// Mudad REST client (week 3)
export type { MudadEnvironment } from "./mudad/endpoints.js";
export {
  mudadBaseUrl,
  buildMudadUrl,
  MUDAD_TOKEN_PATH,
  MUDAD_SALARY_PATH,
  MUDAD_LEAVE_UNPAID_PATH,
  MUDAD_EXIT_REENTRY_PATH,
  MUDAD_TERMINATION_PATH,
  MUDAD_STATUS_PATH,
} from "./mudad/endpoints.js";
export type { MudadCredentials, CachedToken } from "./mudad/auth.js";
export {
  getMudadAccessToken,
  requestMudadToken,
  parseTokenResponse,
  bearerHeader,
  clearMudadTokenCache,
} from "./mudad/auth.js";
export type {
  SalarySubmission,
  LeaveUnpaidSubmission,
  TerminationSubmission,
  MudadResponse,
  MudadClientCallOpts,
} from "./mudad/client.js";
export {
  submitSalary,
  submitLeaveUnpaid,
  submitExitReentry,
  submitTermination,
  fetchStatus,
  parseMudadResponse,
  MudadTransportError,
} from "./mudad/client.js";
