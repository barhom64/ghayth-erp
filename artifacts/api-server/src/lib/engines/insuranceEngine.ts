// ─── Insurance Engine — محرك التأمين (ممتلكات + طبي) ────────────────────────
// FIN-PROPERTY-MEDICAL-INSURANCE (#2249).
//
// Posting engines for PROPERTY and MEDICAL insurance that REUSE the merged
// prepaid-amortization engine (#2247). There is NO second amortization engine
// and NO monthly recognition loop here — the existing
// prepaidAmortizationEngine.runDueAmortizations recognizes these premiums month
// by month off the SAME prepaid_amortization_schedules table.
//
// A premium has two halves, both handled through existing finance primitives:
//
//   (1) PREMIUM JE (one balanced entry, posted now):
//         DR  <prepaid asset>            premiumAmount   (the prepaid balance)
//         CR  <vendor AP | cash/source>  premiumAmount
//       carrying the policy's dimensions (propertyId/unitId for property;
//       employeeId/departmentId for medical) + vendorId.
//
//   (2) RECOGNITION SCHEDULE (one prepaid_amortization_schedules row, #2247):
//         prepaidAccountCode    = the resolved prepaid account from (1)
//         expenseAccountPurpose = TEXT purpose (resolved monthly, never stored)
//         totalAmount           = premiumAmount
//         start/end + months    = computeMonthlySchedule (the #2247 pure math)
//         dims                  = propertyId (property) / employeeId (medical)
//         sourceType            = `${kind}_insurance`
//       From here the EXISTING engine spreads it: it builds the monthly
//       DR expense / CR prepaid lines via buildAmortizationLines, carrying the
//       same dimensions. No recognition code lives in this file.
//
// Property vs medical are thin variants over ONE shared path — only the dims
// (and the default account purposes) differ.
//
// Every query is company-scoped (tenant isolation). The premium JE is
// idempotent on a stable sourceKey.

import { financialEngine } from "./financialEngine.js";
import { roundTo2 } from "../businessHelpers.js";
// REUSE the #2247 prepaid-amortization engine for ALL schedule math. We do NOT
// re-implement month spreading — computeMonthlySchedule is the single source.
import { computeMonthlySchedule, openPrepaidSchedule } from "./prepaidAmortizationEngine.js";

export type InsuranceKind = "property" | "medical";

/** Insured-entity dimensions carried onto the premium JE + the schedule row. */
export interface InsuranceDims {
  /** Property leg — building/property the policy covers. */
  propertyId?: number;
  /** Property leg — optional specific unit. */
  unitId?: number;
  /** Medical leg — the covered employee. */
  employeeId?: number;
  /** Medical leg — the employee's department (cost attribution). */
  departmentId?: number;
  /** Optional project / cost-centre attribution (either leg). */
  projectId?: number;
  costCenterId?: number;
}

export interface PostInsurancePremiumInput {
  companyId: number;
  branchId?: number;
  createdBy?: number;
  kind: InsuranceKind;
  /** What the policy insures, for the JE narrative + the schedule sourceId. */
  insuredEntityType: string;
  insuredEntityId: number;
  policyNumber?: string;
  vendorId?: number;
  premiumAmount: number;
  /** Coverage window — drives months computed by the #2247 math. */
  startDate: string;
  endDate: string;
  /** Prepaid (asset) side mapping purpose — resolved to a stored code. */
  prepaidAccountPurpose: string;
  /** Expense side — TEXT purpose stored on the schedule, resolved monthly. */
  expenseAccountPurpose: string;
  /** When true, credit a cash/source account instead of vendor AP. */
  paid?: boolean;
  /** Cash/source mapping purpose when paid. Defaults to fleet_cash_source. */
  sourceAccountPurpose?: string;
  /** Per-leg insured-entity dimensions. */
  dims?: InsuranceDims;
  currency?: string;
}

export interface PostInsurancePremiumResult {
  journalId: number;
  scheduleId: number;
  prepaidAccountCode: string;
  months: number;
  monthlyAmount: number;
}

/**
 * Pure helper — months of coverage between start and end. Delegates to the
 * #2247 schedule math so insurance + prepaid share ONE month-count rule.
 */
export function computeInsuranceMonths(start: string | Date, end: string | Date): number {
  return computeMonthlySchedule({ totalAmount: 0, startDate: start, endDate: end }).months;
}

/** A stable, idempotent sourceKey for an insurance premium JE. */
export function insurancePremiumSourceKey(
  kind: InsuranceKind,
  insuredEntityType: string,
  insuredEntityId: number,
  policyNumber?: string,
): string {
  return `${kind}_insurance:${insuredEntityType}:${insuredEntityId}:${policyNumber ?? "default"}`;
}

/**
 * Map a premium's insured-entity dims onto the canonical schedule dimensions.
 * Property → propertyId (+ costCenter/project); medical → employeeId (+ dept
 * via costCenter/project). Pure — exported for the unit contract.
 */
export function scheduleDimsFor(
  kind: InsuranceKind,
  dims: InsuranceDims | undefined,
): {
  vehicleId: number | null;
  propertyId: number | null;
  employeeId: number | null;
  projectId: number | null;
  costCenterId: number | null;
} {
  const d = dims ?? {};
  return {
    vehicleId: null,
    propertyId: kind === "property" ? (d.propertyId ?? null) : null,
    employeeId: kind === "medical" ? (d.employeeId ?? null) : null,
    projectId: d.projectId ?? null,
    costCenterId: d.costCenterId ?? null,
  };
}

/**
 * Shared insurance posting path for BOTH property + medical.
 *   (a) post the balanced premium JE (DR prepaid / CR vendor-AP-or-source),
 *       carrying the insured-entity dims + vendorId,
 *   (b) open a prepaid_amortization_schedule (#2247) so the existing engine
 *       recognizes it monthly with the right dimensions.
 * Returns the JE id + the opened schedule id. No monthly loop here.
 */
export async function postInsurancePremium(
  input: PostInsurancePremiumInput,
): Promise<PostInsurancePremiumResult> {
  const {
    companyId,
    kind,
    insuredEntityType,
    insuredEntityId,
    premiumAmount,
    startDate,
    endDate,
    prepaidAccountPurpose,
    expenseAccountPurpose,
  } = input;

  const branchId = input.branchId ?? 0;
  const createdBy = input.createdBy ?? 0;
  const amount = roundTo2(Number(premiumAmount));
  const dims = input.dims ?? {};

  // ── (a) resolve both sides + post the premium JE ────────────────────────────
  // Prepaid (asset) side — DR. Resolved to a stored, postable account code; this
  // SAME code is then stored on the schedule's prepaidAccountCode.
  const prepaidAccountCode = await financialEngine.resolveAccountCode(
    companyId,
    prepaidAccountPurpose,
    "debit",
  );

  // Credit side: vendor AP when unpaid (premium owed), or a cash/source account
  // when paid up front.
  const creditPurpose = input.paid
    ? (input.sourceAccountPurpose ?? "fleet_cash_source")
    : "purchase_vendor_ap";
  const creditAccountCode = await financialEngine.resolveAccountCode(
    companyId,
    creditPurpose,
    "credit",
    input.paid ? "1111" : "2111",
  );

  const dim = {
    propertyId: kind === "property" ? dims.propertyId : undefined,
    unitId: kind === "property" ? dims.unitId : undefined,
    employeeId: kind === "medical" ? dims.employeeId : undefined,
    departmentId: kind === "medical" ? dims.departmentId : undefined,
    projectId: dims.projectId,
    costCenterId: dims.costCenterId,
    vendorId: input.paid ? undefined : input.vendorId,
  };

  const label =
    kind === "property" ? "تأمين ممتلكات" : "تأمين طبي";
  const policyTag = input.policyNumber ? ` — بوليصة ${input.policyNumber}` : "";

  const posted = await financialEngine.postJournalEntry({
    companyId,
    branchId,
    createdBy,
    ref: `INS-${kind.toUpperCase()}-${insuredEntityId}${input.policyNumber ? `-${input.policyNumber}` : ""}`,
    description: `قسط ${label}${policyTag} — ${insuredEntityType} #${insuredEntityId}`,
    type: "general",
    sourceType: "insurance_premium",
    sourceId: insuredEntityId,
    sourceKey: insurancePremiumSourceKey(kind, insuredEntityType, insuredEntityId, input.policyNumber),
    lines: [
      { accountCode: prepaidAccountCode, debit: amount, credit: 0, description: `قسط ${label}`, ...dim },
      { accountCode: creditAccountCode, debit: 0, credit: amount, description: `قسط ${label}`, ...dim },
    ],
  });

  // ── (b) open the recognition schedule (REUSE #2247 + ج-٧ المُساعد المشترك) ──
  const sched = scheduleDimsFor(kind, dims);
  const { scheduleId, months, monthlyAmount } = await openPrepaidSchedule({
    companyId,
    branchId: input.branchId ?? null,
    sourceType: `${kind}_insurance`,
    sourceId: insuredEntityId,
    prepaidAccountCode,
    expenseAccountPurpose,
    totalAmount: amount,
    startDate,
    endDate,
    dims: {
      vehicleId: sched.vehicleId,
      propertyId: sched.propertyId,
      employeeId: sched.employeeId,
      projectId: sched.projectId,
      costCenterId: sched.costCenterId,
    },
    currency: input.currency,
  });

  return {
    journalId: posted.journalId,
    scheduleId,
    prepaidAccountCode,
    months,
    monthlyAmount,
  };
}

/** Thin property variant — dims carry propertyId/unitId. */
export function postPropertyInsurancePremium(
  input: Omit<PostInsurancePremiumInput, "kind">,
): Promise<PostInsurancePremiumResult> {
  return postInsurancePremium({ ...input, kind: "property" });
}

/** Thin medical variant — dims carry employeeId/departmentId. */
export function postMedicalInsurancePremium(
  input: Omit<PostInsurancePremiumInput, "kind">,
): Promise<PostInsurancePremiumResult> {
  return postInsurancePremium({ ...input, kind: "medical" });
}
