// financePostingPolicy.ts
//
// Backend enforcement of finance posting invariants (task #1715). The
// frontend filters the account picker by usage, but the source of truth
// is HERE — the backend rejects any conflict even if the operator bypassed
// the UI. No code.startsWith heuristics: decisions read the persisted
// `accountUsage` column.

import { rawQuery } from "./rawdb.js";
import { ValidationError, ForbiddenError } from "./errorHandler.js";
import {
  allowedUsagesForPaymentMethod,
  ACCOUNT_USAGE_LABELS_AR,
  type AccountUsage,
} from "./financeAccountClassifier.js";
import { classifyEnforcement, DIMENSION_COLUMN } from "./gl/ledgerTruth.js";

interface AccountUsageRow {
  code: string;
  accountUsage: string | null;
  name: string;
}

/**
 * Assert that the money source/destination account is legal for the
 * chosen payment method. Throws ValidationError (422) on conflict.
 *
 * - paymentMethod cash → account.accountUsage must be cash_box
 * - bank_transfer → bank
 * - custody → custody
 * - card → card
 * - cheque → bank | cheque
 *
 * Unclassified accounts (accountUsage NULL) are allowed through with no
 * hard block (the gap report nudges the operator to classify them), so
 * this migration-era policy never bricks a tenant whose COA isn't
 * classified yet. Once classified, conflicts are rejected.
 */
export async function assertPaymentSourceAllowed(args: {
  companyId: number;
  accountCode: string;
  paymentMethod: string | null | undefined;
}): Promise<void> {
  const allowed = allowedUsagesForPaymentMethod(args.paymentMethod);
  if (!allowed) return; // unknown/absent method → no constraint
  if (!args.accountCode) return;

  const [row] = await rawQuery<AccountUsageRow>(
    `SELECT code, "accountUsage", name FROM chart_of_accounts
      WHERE "companyId" = $1 AND code = $2 AND "deletedAt" IS NULL
      LIMIT 1`,
    [args.companyId, args.accountCode],
  );
  if (!row) return;                 // account resolution handled elsewhere
  if (!row.accountUsage) return;    // unclassified → soft-allow (gap report)

  if (!allowed.includes(row.accountUsage as AccountUsage)) {
    const wantLabels = allowed.map((u) => ACCOUNT_USAGE_LABELS_AR[u]).join(" أو ");
    const gotLabel = ACCOUNT_USAGE_LABELS_AR[row.accountUsage as AccountUsage] ?? row.accountUsage;
    throw new ValidationError(
      `الحساب «${row.name}» مُصنّف كـ«${gotLabel}» ولا يصلح لطريقة الدفع المختارة (المطلوب: ${wantLabels})`,
      {
        field: "sourceAccountCode",
        fix: `اختر حساباً مصنّفاً كـ«${wantLabels}» يطابق طريقة الدفع، أو غيّر طريقة الدفع`,
        meta: { accountUsage: row.accountUsage, allowedUsages: allowed },
      },
    );
  }
}

/**
 * عقد البُعد (FIN-INTEGRITY-CONTRACT #2233) — يُفرَض عند بابَي الترحيل
 * (businessHelpers.createJournalEntry + gl/posting.postJournalEntry).
 *
 * لكل سطر على حساب من فئة مُبعّدة (وفق DIMENSION_ENFORCEMENT_RULES): إن غاب
 * البُعد المطلوب → **يُرفَض** (mode=enforce) أو **يُسجَّل تحذير** (mode=warn).
 * تدريجي وآمن (ratchet): أول enforce هو وقود المركبة (5510) فقط؛ البقية warn.
 * forward-only — يقع عند الترحيل لا على القيود التاريخية. **دالة نقية** (بلا I/O):
 * يُحلَّل البُعد من كود الحساب، فلا حاجة لقاعدة بيانات — قابلة للاختبار وحدةً.
 */
export interface DimensionContractLine {
  accountCode?: string | null;
  vehicleId?: number | string | null;
  propertyId?: number | string | null;
  projectId?: number | string | null;
  vendorId?: number | string | null;
  clientId?: number | string | null;
}

/**
 * FIN-OPERATIONAL-MANUAL-JOURNAL-GUARD (#2239) — حوكمة القيد اليدوي المرتبط تشغيليًا.
 *
 * المتطلب (تعليق #2239 الإلزامي): القيد اليدوي من النوع المرتبط تشغيليًا يجب أن
 * يدخل مسار اعتماد خاص: سبب إلزامي، ربط إلزامي بالكائن، اعتماد المدير العام أو
 * صلاحية محددة، Audit.
 *
 * `isOperationallyLinkedEntry` دالة نقية (بلا I/O): القيد «مرتبط تشغيليًا» إن
 * حمل أيٌّ من سطوره بُعدًا تشغيليًا (مركبة/عقار/أصل/موظف/سائق/وحدة/عقد) أو كان
 * نوع الكيان المرتبط على الرأس تشغيليًا. قابلة للاختبار وحدةً.
 */
export const OPERATIONAL_LINE_DIMENSIONS = [
  "vehicleId",
  "propertyId",
  "assetId",
  "employeeId",
  "driverId",
  "unitId",
  "contractId",
] as const;

// relatedEntityType values that represent an operational object on the header
// (journal_entries."relatedEntityType"). Mirrors cost_centers.relatedEntityType
// usage ('vehicle' / 'employee' / …) — see fleetEngine.ts / finance-cost-centers.ts.
export const OPERATIONAL_RELATED_ENTITY_TYPES = new Set<string>([
  "vehicle",
  "property",
  "asset",
  "employee",
  "driver",
  "unit",
  "contract",
]);

export interface OperationalLinkLine {
  vehicleId?: number | string | null;
  propertyId?: number | string | null;
  assetId?: number | string | null;
  employeeId?: number | string | null;
  driverId?: number | string | null;
  unitId?: number | string | null;
  contractId?: number | string | null;
  [k: string]: unknown;
}

export interface OperationalLinkHeader {
  relatedEntityType?: string | null;
  relatedEntityId?: number | string | null;
}

function dimPresent(val: unknown): boolean {
  return val !== null && val !== undefined && val !== "" && !(typeof val === "number" && Number.isNaN(val));
}

/**
 * Pure predicate: is this entry operationally linked? True when any line carries
 * an operational dimension FK, OR the header's relatedEntityType is operational.
 */
export function isOperationallyLinkedEntry(
  lines: OperationalLinkLine[] | null | undefined,
  header?: OperationalLinkHeader | null,
): boolean {
  if (Array.isArray(lines)) {
    for (const line of lines) {
      if (!line) continue;
      for (const dim of OPERATIONAL_LINE_DIMENSIONS) {
        if (dimPresent(line[dim])) return true;
      }
    }
  }
  if (header && header.relatedEntityType) {
    const t = String(header.relatedEntityType).trim().toLowerCase();
    if (OPERATIONAL_RELATED_ENTITY_TYPES.has(t)) return true;
  }
  return false;
}

/**
 * Pure governance decision for the SPECIAL approval path of an operationally
 * linked manual JE. Throws (ForbiddenError 403) when the caller lacks the
 * elevated GM authority, or (ValidationError 422) when the mandatory approval
 * reason is missing. Non-linked entries (`linked=false`) are a no-op — ordinary
 * manual JEs are unaffected.
 *
 * `elevated` = caller holds GM/owner authority (the route resolves this from
 * scope.isOwner / OWNER_GM_ROLES — level 90 in the RBAC catalog, strictly above
 * the ordinary level-60 approve and the level-70 post gates).
 */
export function assertOperationalManualApprovalAllowed(args: {
  linked: boolean;
  elevated: boolean;
  reason?: string | null;
}): void {
  if (!args.linked) return;
  if (!args.elevated) {
    throw new ForbiddenError(
      "اعتماد القيد اليدوي المرتبط بكائن تشغيلي يتطلب صلاحية المدير العام",
      { field: "approve", fix: "اطلب اعتماد المدير العام (أو صلاحية مكافئة) لهذا القيد" },
    );
  }
  if (!args.reason || !String(args.reason).trim()) {
    throw new ValidationError(
      "سبب اعتماد القيد اليدوي المرتبط بكائن تشغيلي مطلوب",
      { field: "reason", fix: "أدخل سبب الاعتماد لتوثيقه في سجل التدقيق" },
    );
  }
}

export function assertDimensionContract(args: { lines: DimensionContractLine[] }): { warnings: string[] } {
  const warnings: string[] = [];
  for (const line of args.lines) {
    const code = line.accountCode ? String(line.accountCode).trim() : "";
    if (!code) continue;
    const rule = classifyEnforcement(code);
    if (!rule) continue;
    const col = DIMENSION_COLUMN[rule.dimension] as keyof DimensionContractLine;
    const val = line[col];
    const present = val !== null && val !== undefined && val !== "";
    if (present) continue;
    if (rule.mode === "enforce") {
      throw new ValidationError(
        `إعداد التوجيه المحاسبي غير مكتمل: الحساب «${code}» يتطلب ربطه بـ«${rule.label}» قبل الترحيل`,
        {
          field: String(col),
          fix: `اربط السطر بـ«${rule.label}» الصحيح (عبر المسار التشغيلي/السيناريو)، أو استخدم تجاوزًا يدويًا مُصرّحًا`,
          meta: { accountCode: code, requiredDimension: rule.dimension },
        },
      );
    }
    warnings.push(`الحساب «${code}» بلا بُعد «${rule.label}» (تحذير — غير مُنفَّذ بعد لهذا الصنف)`);
  }
  return { warnings };
}
