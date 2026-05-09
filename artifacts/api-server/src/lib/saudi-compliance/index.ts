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

export { classifyNitaqat } from "./nitaqat.js";

export {
  selectExpiringIqamas,
  IQAMA_ALERT_THRESHOLDS_DAYS,
} from "./iqama-alerts.js";
