/**
 * Shared types for the Saudi-compliance module.
 * See docs/SAUDI_COMPLIANCE_DESIGN.md for the full plan.
 */

/** Per Nitaqat: platinum > green > yellow > red. */
export type NitaqatCategory = "platinum" | "green" | "yellow" | "red";

export type WpsRunStatus = "draft" | "submitted" | "acknowledged" | "rejected" | "partial";
export type WpsLineStatus = "pending" | "paid" | "failed" | "held" | "rejected";

export type MudadType =
  | "salary"
  | "leave_unpaid"
  | "exit_reentry"
  | "termination"
  | "contract_renewal"
  | "contract_register";
export type MudadStatus = "submitted" | "acknowledged" | "rejected" | "retry";

/**
 * One employee's payroll line as the WPS builder consumes it. The
 * route handler reads this from the approved payroll-run and hands
 * it to `buildWpsFile`.
 */
export interface WpsPayrollEntry {
  employeeId: number;
  /** Iqama for non-Saudis, national ID for Saudis. */
  iqamaOrId: string;
  /** Saudi IBAN — 24 chars starting with SA. */
  iban: string;
  amount: number;
  basicSalary: number;
  housingAllowance: number;
  otherAllowances: number;
  deductions: number;
  remark?: string;
}

export interface WpsRunSummary {
  companyId: number;
  period: string; // YYYY-MM
  bankCode: string;
  vatNumber?: string;
  crNumber?: string;
  /** Pre-collected from `wps_settings.bankIban`. */
  companyIban?: string;
}

export interface WpsBuildResult {
  fileBytes: string;
  totalAmount: number;
  recordCount: number;
}

/** Spec-shaped supported bank format. Today only the generic format
 *  ships; per-bank adapters (NCB, Al Rajhi, Riyad) land in week 4. */
export type WpsFormat = "generic_pipe" | "ncb" | "alrajhi" | "riyad" | "alinma" | "albilad";

export interface SaudizationInput {
  totalEmployees: number;
  saudiEmployees: number;
  /**
   * Nitaqat thresholds vary by sector size + category. The
   * classifier accepts a `sector` hint that selects the right
   * threshold table; the default is the generic small-business
   * thresholds.
   */
  sector?: "default" | "construction" | "retail" | "manufacturing" | "services";
}

export interface SaudizationResult {
  saudizationPercent: number; // 0-100, 2dp
  category: NitaqatCategory;
  /** True when total < 5 — Nitaqat doesn't apply (too few staff). */
  exempt: boolean;
}

export interface IqamaExpiryWatch {
  employeeId: number;
  iqamaExpiry: string; // YYYY-MM-DD
  daysLeft: number;
  /** Whether this is one of the spec'd alert thresholds (90/60/30/14/7/1). */
  isThreshold: boolean;
}
