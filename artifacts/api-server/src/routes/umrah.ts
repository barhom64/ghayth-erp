// ─────────────────────────────────────────────────────────────────────────────
// umrah.ts — CORE DOMAIN: lifecycle entities + operational endpoints
//
// Owns: seasons, agents, packages, pilgrims (CRUD + lifecycle + encryption),
//       transport (fleet service consumer), import, daily-status, penalties,
//       violations, agent-invoices, bulk-assign.
//
// Sister file: umrah-entities.ts — COMMERCIAL/FINANCE entities
//   Owns: sub-agents, pricing, groups, nusk-invoices, sales-invoices,
//         payments, statements, commissions, import-batches.
//
// Both mounted at /umrah with requireModule("operations") + requireGuards("financial").
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { createSubsidiaryAccountsForEntity } from "./accounting-engine.js";
import { ensureCostCenterForEntity } from "../lib/costCenterAutoCreate.js";
import { handleRouteError, ValidationError, NotFoundError, ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import {
  emitEvent,
  createAuditLog,
  todayISO,
} from "../lib/businessHelpers.js";
import { sendMessage } from "../lib/messageSender.js";
import { issueNumber } from "../lib/numberingService.js";
import { applyTransition, lifecycleErrorResponse, LifecycleError } from "../lib/lifecycleEngine.js";
import { logger } from "../lib/logger.js";
import { registerEntityParty } from "../lib/partyService.js";
import { resolveSettings } from "../lib/settings.js";
import { encryptField, decryptPilgrimRow, blindIndex, SENSITIVE_PILGRIM_FIELDS, logSensitiveAccess } from "../lib/fieldEncryption.js";
import {
  confirmMutamersImport,
  confirmVouchersImport,
  previewMutamersImport,
  previewVouchersImport,
  normalizeImportRows,
  MUTAMER_HEADER_MAP,
  VOUCHER_HEADER_MAP,
  UMRAH_FIELD_LABELS_AR,
  UMRAH_FIELD_GROUPS,
  UMRAH_FIELD_GROUP_LABELS_AR,
} from "../lib/umrahImportEngine.js";
import { gccExclusionSqlFragment } from "../lib/umrahNationalityRules.js";

// ─────────────────────────────────────────────────────────────────────────────
// SEASON LOCK — rejects writes on closed/archived seasons
// ─────────────────────────────────────────────────────────────────────────────
async function requireOpenSeason(seasonId: number, companyId: number): Promise<void> {
  const [season] = await rawQuery<{ id: number; status: string }>(
    `SELECT id, status FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
    [seasonId, companyId]
  );
  if (!season) throw new ValidationError("الموسم غير موجود", { field: "seasonId" });
  if (season.status !== "open") {
    throw new ConflictError(`الموسم مغلق (${season.status}) — لا يمكن إجراء عمليات عليه`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE STATE MACHINES — Umrah domain
// ─────────────────────────────────────────────────────────────────────────────
const PILGRIM_STATUSES = ["pending", "arrived", "active", "overstayed", "departed", "violated", "cancelled"] as const;
// Arabic labels for the lifecycle states above. Mirrored from the
// client-side canonical dictionary in
// `ghayth-erp/src/lib/umrah-pilgrim-status.ts` so the pilgrims CSV
// export ships "متجاوز" / "ملغى" instead of raw "overstayed" /
// "cancelled". Operators opening the file in Excel see the same word
// they see in the list, the badge, and the bulk-status dropdown.
const PILGRIM_STATUS_LABELS_AR: Record<string, string> = {
  pending:    "لم يصل",
  arrived:    "وصل",
  active:     "نشط",
  overstayed: "متجاوز",
  departed:   "غادر",
  violated:   "مخالف",
  cancelled:  "ملغى",
};
const PILGRIM_TRANSITIONS: Record<string, readonly string[]> = {
  pending:    ["arrived", "cancelled"],
  arrived:    ["active", "departed", "overstayed", "cancelled"],
  active:     ["departed", "overstayed", "violated"],
  overstayed: ["departed", "violated"],
  departed:   [],
  violated:   [],
  cancelled:  [],
};

const SEASON_STATUSES = ["open", "closed", "archived"] as const;
const SEASON_TRANSITIONS: Record<string, readonly string[]> = {
  open:     ["closed"],
  closed:   ["archived"],
  archived: [],
};

const TRANSPORT_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
const TRANSPORT_TRANSITIONS: Record<string, readonly string[]> = {
  scheduled:   ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed:   [],
  cancelled:   [],
};

const AGENT_STATUSES = ["active", "inactive", "suspended", "blocked"] as const;
const AGENT_TRANSITIONS: Record<string, readonly string[]> = {
  active:    ["inactive", "suspended", "blocked"],
  inactive:  ["active"],
  suspended: ["active", "blocked"],
  blocked:   [],
};

const PENALTY_STATUSES = ["pending", "invoiced", "paid", "waived"] as const;
const PENALTY_TRANSITIONS: Record<string, readonly string[]> = {
  pending:  ["invoiced", "waived"],
  invoiced: ["paid", "waived"],
  paid:     [],
  waived:   [],
};

const AGENT_INVOICE_STATUSES = ["draft", "sent", "partially_paid", "paid", "overdue", "cancelled"] as const;
const AGENT_INVOICE_TRANSITIONS: Record<string, readonly string[]> = {
  draft:          ["sent", "cancelled"],
  sent:           ["partially_paid", "paid", "overdue", "cancelled"],
  partially_paid: ["paid", "overdue"],
  overdue:        ["partially_paid", "paid", "cancelled"],
  paid:           [],
  cancelled:      [],
};

const router = Router();

// U-02b M3 of #2080 — gate for the legacy umrah_transport write path.
// Reads the boolean catalog flag added in M2
// (umrahSettingsPoliciesCatalog.ts → financial.legacyTransportWritesDisabled).
// Default value in the catalog is false → unchanged behaviour for every
// company that hasn't explicitly enabled the gate. When a company flips
// the flag to true in `settings`, POST /transport and PATCH /transport/:id
// return 410 + a hint pointing operators at the unified contract endpoint
// (POST /umrah/groups/:id/transport-requests). Other handlers (GET,
// DELETE, manifest, check-in, check-in-bulk) stay live so historic rows
// remain inspectable/closable while the legacy write surface freezes.
async function isLegacyTransportWritesDisabled(companyId: number): Promise<boolean> {
  const raw = await resolveSettings("umrah.financial.legacyTransportWritesDisabled", companyId);
  return raw === true || raw === "true";
}

const createSeasonSchema = z.object({
  title: z.string().min(1, "اسم الموسم مطلوب"),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  endDate: z.string().min(1, "تاريخ النهاية مطلوب"),
  notes: z.string().optional(),
}).refine((d) => d.endDate >= d.startDate, { message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية", path: ["endDate"] });

const createAgentSchema = z.object({
  name: z.string().min(1, "اسم الوكيل مطلوب"),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("صيغة البريد الإلكتروني غير صحيحة").optional().or(z.literal("")),
  country: z.string().optional(),
  profitMargin: z.coerce.number().optional(),
  contractRef: z.string().optional(),
  currency: z.string().optional(),
  notes: z.string().optional(),
});

const createPackageSchema = z.object({
  name: z.string().min(1, "اسم الباقة مطلوب"),
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
  costPrice: z.coerce.number().optional(),
  sellPrice: z.coerce.number().optional(),
  includesTransport: z.boolean().optional(),
  includesHotel: z.boolean().optional(),
  includesMeals: z.boolean().optional(),
  includesZiyarat: z.boolean().optional(),
  duration: z.coerce.number().optional(),
  description: z.string().optional(),
});

const createPilgrimSchema = z.object({
  fullName: z.string().min(1, "الاسم الكامل مطلوب"),
  passportNumber: z.string().min(1, "رقم جواز السفر مطلوب"),
  seasonId: z.coerce.number().optional(),
  agentId: z.coerce.number().optional(),
  // subAgentId / groupId / nuskNumber: parity with the import path.
  // Without these the row lands with NULL FKs and is invisible on
  // group statements + sub-agent rollups (same shape as the
  // /import/mutamers bug — operator created the pilgrim manually,
  // the screen said "saved", but the new pilgrim never appeared on
  // the agent's roster because manual creation couldn't capture the
  // group or sub-agent linkage).
  subAgentId: z.coerce.number().optional(),
  groupId: z.coerce.number().optional(),
  nuskNumber: z.string().trim().optional(),
  packageId: z.coerce.number().optional(),
  visaNumber: z.string().optional(),
  nationality: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  phone: z.string().optional(),
  arrivalDate: z.string().optional(),
  departureDate: z.string().optional(),
  hotelName: z.string().optional(),
  roomNumber: z.string().optional(),
  status: z.enum(["pending", "arrived", "active", "overstayed", "departed", "violated", "cancelled"]).optional(),
  notes: z.string().optional(),
});

const createTransportSchema = z.object({
  seasonId: z.coerce.number().optional(),
  tripDate: z.string(),
  fromLocation: z.string(),
  toLocation: z.string(),
  vehicleId: z.coerce.number().optional(),
  driverId: z.coerce.number().optional(),
  capacity: z.coerce.number().int("السعة يجب أن تكون عددًا صحيحًا").nonnegative("السعة يجب ألا تكون سالبة").optional(),
  pilgrimCount: z.coerce.number().int("عدد المعتمرين يجب أن يكون عددًا صحيحًا").nonnegative("عدد المعتمرين يجب ألا يكون سالبًا").optional(),
  cost: z.coerce.number().optional(),
  notes: z.string().optional(),
});

const patchSeasonSchema = z.object({
  title: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["open", "closed", "archived"]).optional(),
  notes: z.string().optional(),
});

const patchAgentSchema = z.object({
  name: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("صيغة البريد الإلكتروني غير صحيحة").optional().or(z.literal("")),
  country: z.string().optional(),
  profitMargin: z.coerce.number().optional(),
  contractRef: z.string().optional(),
  currency: z.string().optional(),
  status: z.enum(["active", "inactive", "suspended", "blocked"]).optional(),
  notes: z.string().optional(),
});

// BILL-MAIN P3 (#2080) — explicit-confirmation linker payload for
// linking a main umrah agent to an EXISTING financial client. No
// `createNew` branch, no engine activation. Optional free-text
// `reason` (max 500) is recorded on the audit log + event details
// for downstream review.
const linkAgentClientSchema = z.object({
  clientId: z.coerce.number({ required_error: "معرف العميل مطلوب" }),
  reason: z.string().max(500).optional(),
});

const patchPackageSchema = z.object({
  name: z.string().optional(),
  seasonId: z.coerce.number().optional(),
  costPrice: z.coerce.number().optional(),
  sellPrice: z.coerce.number().optional(),
  includesTransport: z.boolean().optional(),
  includesHotel: z.boolean().optional(),
  includesMeals: z.boolean().optional(),
  includesZiyarat: z.boolean().optional(),
  duration: z.coerce.number().optional(),
  description: z.string().optional(),
  // #2718 — قفل تعارض اختياري: النسخة المعروفة للعميل وقت الفتح. لا يكسر
  // النداءات التي لا ترسله (opt-in)؛ إن أُرسل وتغيّر السجل → 409.
  updatedAt: z.string().optional(),
});

// Lets the reassign modal (pilgrim-detail.tsx) ship an empty string
// to mean "unassign", instead of having to remember to send literal
// null from the frontend. Without this, z.coerce.number("") returns 0
// and the FK insert would fail against the non-existent agent id 0.
const nullableFkId = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.coerce.number().nullable(),
);

const patchPilgrimSchema = z.object({
  status: z.enum(["pending", "arrived", "active", "overstayed", "departed", "violated", "cancelled"]).optional(),
  agentId: nullableFkId.optional(),
  subAgentId: nullableFkId.optional(),
  packageId: nullableFkId.optional(),
  fullName: z.string().optional(),
  passportNumber: z.string().optional(),
  visaNumber: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  arrivalDate: z.string().optional().nullable(),
  departureDate: z.string().optional().nullable(),
  actualArrival: z.string().optional().nullable(),
  actualDeparture: z.string().optional().nullable(),
  hotelName: z.string().optional().nullable(),
  roomNumber: z.string().optional().nullable(),
  transportAssigned: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  // Overstay-exemption knobs (migration 242 / PR #1481). When the
  // operator flips overstayExempt=true, the cron skips this pilgrim
  // entirely. Reason is required by the API guard below so a
  // compliance reviewer can see WHY each exemption was granted.
  overstayExempt: z.boolean().optional(),
  overstayExemptReason: z.string().optional().nullable(),
  // Visa application workflow (migration 266). Transitions are
  // validated against `VISA_TRANSITIONS` in the handler below so an
  // operator can't jump from `requested` straight to `delivered` and
  // skip the issuance milestone.
  visaStatus: z.enum([
    "not_requested", "requested", "under_review", "approved",
    "issued", "delivered", "rejected", "cancelled",
  ]).optional(),
  visaRejectionReason: z.string().optional().nullable(),
});

// `columnMapping` lets the wizard's column-mapping step override the
// built-in Arabic header dictionary on a per-import basis. The shape is
// { excelHeader → dbField }; values that don't match a known engine
// field are still accepted (the engine just ignores unknown keys), so
// operators can experiment without back-end validation churn.
const columnMappingSchema = z.record(z.string(), z.string()).optional();

const importPreviewSchema = z.object({
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
  rows: z.array(z.any()).min(1, "بيانات المعاينة غير مكتملة").max(5000, "عدد صفوف المعاينة يتجاوز الحدّ المسموح (5000)"),
  fileType: z.string().optional(),
  columnMapping: columnMappingSchema,
});

const importMutamersSchema = z.object({
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
  rows: z.array(z.any()).min(1, "بيانات الاستيراد غير مكتملة").max(5000, "عدد صفوف الاستيراد يتجاوز الحدّ المسموح (5000)"),
  fileName: z.string().trim().optional(),
  columnMapping: columnMappingSchema,
});

const importVouchersSchema = z.object({
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
  rows: z.array(z.any()).min(1, "بيانات الاستيراد غير مكتملة").max(5000, "عدد صفوف الاستيراد يتجاوز الحدّ المسموح (5000)"),
  fileName: z.string().trim().optional(),
  /** Cash box that will fund the NUSK supplier payment (gap #2). */
  treasuryId: z.coerce.number().int().positive().optional().nullable(),
  /** Override umrah_nusk_cost DR account code (gap #3). */
  purchaseAccountCode: z.string().trim().min(1).optional().nullable(),
  columnMapping: columnMappingSchema,
  /**
   * Explicit override for the wallet-overdraft guardrail. By default
   * the engine refuses an import that would push the NUSK supplier
   * wallet (PR #1464) below zero — matching the operator rule
   * "لا يمكن نشتري تأشيرة الا وفي فلوس في الحساب". Setting
   * allowOverdraft=true bypasses the check for cases where the
   * operator KNOWS a top-up is on its way and wants to record the
   * NUSK invoices anyway. The audit log captures the override so
   * compliance can review.
   */
  allowOverdraft: z.boolean().optional().default(false),
});

const importSchema = z.object({
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
  rows: z.array(z.any()).min(1, "بيانات الاستيراد غير مكتملة").max(5000, "عدد صفوف الاستيراد يتجاوز الحدّ المسموح (5000)"),
  fileType: z.string().optional(),
  fileName: z.string().optional(),
});

const runPenaltyEngineSchema = z.object({
  overstayDays: z.coerce.number().optional(),
  dailyRate: z.coerce.number().optional(),
});

const waivePenaltySchema = z.object({
  reason: z.string().min(1, "سبب الإعفاء مطلوب"),
});

const bulkWaivePenaltiesSchema = z.object({
  penaltyIds: z.array(z.number().int().positive()).min(1, "اختر عقوبة واحدة على الأقل"),
  reason: z.string().min(1, "سبب الإعفاء مطلوب"),
});

const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive("مبلغ الدفع مطلوب"),
  paymentMethod: z.string().optional(),
  reference: z.string().optional(),
});

const generateInvoiceSchema = z.object({
  agentId: z.coerce.number({ required_error: "الوكيل مطلوب" }),
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
});

const patchTransportSchema = z.object({
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
  seasonId: z.coerce.number().optional(),
  tripDate: z.string().optional(),
  fromLocation: z.string().optional(),
  toLocation: z.string().optional(),
  vehicleId: z.coerce.number().optional(),
  driverId: z.coerce.number().optional(),
  capacity: z.coerce.number().int("السعة يجب أن تكون عددًا صحيحًا").nonnegative("السعة يجب ألا تكون سالبة").optional(),
  pilgrimCount: z.coerce.number().int("عدد المعتمرين يجب أن يكون عددًا صحيحًا").nonnegative("عدد المعتمرين يجب ألا يكون سالبًا").optional(),
  cost: z.coerce.number().optional(),
  notes: z.string().optional(),
});

const assignPilgrimsSchema = z.object({
  pilgrimIds: z.array(z.coerce.number()).min(1, "يجب تحديد معتمر واحد على الأقل"),
});

const bulkAssignSchema = z.object({
  pilgrimIds: z.array(z.coerce.number()).min(1, "بيانات التوزيع غير مكتملة"),
  agentId: z.coerce.number({ required_error: "بيانات التوزيع غير مكتملة" }),
});

const createViolationSchema = z.object({
  type: z.string().min(1, "نوع المخالفة مطلوب"),
  referenceType: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  mutamerId: z.coerce.number().optional().nullable(),
  agentId: z.coerce.number().optional().nullable(),
  subAgentId: z.coerce.number().optional().nullable(),
  description: z.string().optional().nullable(),
  penaltyAmount: z.coerce.number().optional(),
  status: z.enum(["detected", "open", "invoiced", "paid", "disputed", "closed"]).optional(),
});

const patchViolationSchema = z.object({
  type: z.string().optional(),
  referenceType: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  mutamerId: z.coerce.number().optional().nullable(),
  agentId: z.coerce.number().optional().nullable(),
  subAgentId: z.coerce.number().optional().nullable(),
  description: z.string().optional().nullable(),
  penaltyAmount: z.coerce.number().optional(),
  status: z.enum(["detected", "open", "invoiced", "paid", "disputed", "closed"]).optional(),
  linkedInvoiceId: z.coerce.number().optional().nullable(),
});

const createPenaltySchema = z.object({
  pilgrimId: z.coerce.number().optional().nullable(),
  agentId: z.coerce.number().optional().nullable(),
  seasonId: z.coerce.number().optional().nullable(),
  type: z.string().optional(),
  // F9-B3b: لا جزاء بمبلغ سالب. المعالج يسمح بـ0 (مسوّدة) ويُرحّل فقط إن >0،
  // والإعفاء تدفّق عكس مستقل — فـ nonnegative يحفظ سلوك الصفر ويرفض السالب فقط.
  amount: z.coerce.number().nonnegative("مبلغ الجزاء لا يكون سالبًا").optional(),
  reason: z.string().optional().nullable(),
  status: z.string().optional(),
});

router.get("/seasons", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM umrah_seasons WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "startDate" DESC LIMIT 100`, [scope.companyId]);
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List seasons error"); }
});

router.get("/seasons/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الموسم غير موجود");

    // Fan out the per-season aggregates. The season-detail page was
    // already reading `revenue` / `registeredPilgrims` from the row,
    // but the route returned only the raw umrah_seasons row — so
    // every operational KPI rendered as 0/-. This fold closes that
    // gap in one roundtrip.
    const [
      statusRows,
      groupsRow,
      financeRow,
      nuskRow,
      visaRow,
      exemptRow,
    ] = await Promise.all([
      rawQuery<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text AS count
           FROM umrah_pilgrims
          WHERE "seasonId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
          GROUP BY status`,
        [id, scope.companyId],
      ),
      rawQuery<{ groupsCount: string; agentsCount: string }>(
        `SELECT
           COUNT(*)::text AS "groupsCount",
           COUNT(DISTINCT "agentId")::text AS "agentsCount"
           FROM umrah_groups
          WHERE "seasonId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      ),
      // Sales invoices in this season — header has a seasonId column
      // (unlike the group-detail case which had to JOIN through items).
      // Exclude cancelled so the revenue line matches what the operator
      // actually books.
      rawQuery<{ count: string; total: string | null; paid: string | null }>(
        `SELECT COUNT(*)::text AS count,
                COALESCE(SUM(total), 0)::text AS total,
                COALESCE(SUM("paidAmount"), 0)::text AS paid
           FROM umrah_sales_invoices
          WHERE "seasonId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
            AND status <> 'cancelled'`,
        [id, scope.companyId],
      ),
      // NUSK invoices reach the season via their linked group (the
      // nusk header has no seasonId column). Subquery against
      // umrah_groups to keep tenant scope.
      rawQuery<{ count: string; netCost: string | null }>(
        `SELECT COUNT(*)::text AS count,
                COALESCE(SUM(ni."netCost"), 0)::text AS "netCost"
           FROM umrah_nusk_invoices ni
          WHERE ni."companyId" = $1 AND ni."deletedAt" IS NULL
            AND ni."nuskStatus" <> 'cancelled'
            AND ni."groupId" IN (
              SELECT id FROM umrah_groups
               WHERE "seasonId" = $2 AND "companyId" = $1 AND "deletedAt" IS NULL
            )`,
        [scope.companyId, id],
      ),
      // Visa-expiring within 7 days — mirrors the list-page banner +
      // the per-group card. Excludes pilgrims who already left.
      // Also excludes GCC nationals — they don't require a visa to
      // enter KSA, so a `visaExpiry` row for them is operator data
      // entry from a different jurisdiction (or a typo); either way,
      // alerting on them is a false positive.
      rawQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM umrah_pilgrims
          WHERE "seasonId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
            AND "visaExpiry" IS NOT NULL
            AND "visaExpiry" <= CURRENT_DATE + INTERVAL '7 days'
            AND status NOT IN ('departed', 'cancelled')
            AND ${gccExclusionSqlFragment(`"nationality"`)}`,
        [id, scope.companyId],
      ),
      rawQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM umrah_pilgrims
          WHERE "seasonId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
            AND "overstayExempt" = true`,
        [id, scope.companyId],
      ),
    ]);

    const statusBreakdown: Record<string, number> = {};
    let pilgrimsCount = 0;
    let overstayCount = 0;
    for (const r of statusRows) {
      const n = Number(r.count);
      statusBreakdown[r.status] = n;
      pilgrimsCount += n;
      if (r.status === "overstayed" || r.status === "overstay_penalized") overstayCount += n;
    }

    const fin = financeRow[0] || { count: "0", total: "0", paid: "0" };
    const nusk = nuskRow[0] || { count: "0", netCost: "0" };
    const groups = groupsRow[0] || { groupsCount: "0", agentsCount: "0" };

    res.json(maskFields(req, {
      ...row,
      // Operational rollup
      pilgrimsCount,
      registeredPilgrims: pilgrimsCount,
      statusBreakdown,
      overstayCount,
      visaExpiringCount: Number(visaRow[0]?.count ?? "0"),
      exemptCount: Number(exemptRow[0]?.count ?? "0"),
      groupsCount: Number(groups.groupsCount ?? "0"),
      agentsCount: Number(groups.agentsCount ?? "0"),
      // Financial rollup
      revenue: Number(fin.total ?? "0"),
      finance: {
        invoiceCount: Number(fin.count),
        invoiceTotal: Number(fin.total ?? "0"),
        invoicePaid: Number(fin.paid ?? "0"),
        invoiceOutstanding: Number(fin.total ?? "0") - Number(fin.paid ?? "0"),
        nuskCount: Number(nusk.count),
        nuskNetCost: Number(nusk.netCost ?? "0"),
        margin: Number(fin.total ?? "0") - Number(nusk.netCost ?? "0"),
      },
    }));
  } catch (err) { handleRouteError(err, res, "Season detail error"); }
});

router.post("/seasons", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createSeasonSchema.safeParse(req.body));
    const rows = await rawQuery(
      `INSERT INTO umrah_seasons ("companyId",title,"startDate","endDate",notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [scope.companyId, b.title, b.startDate, b.endDate, b.notes]
    );
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء الموسم");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_seasons", entityId: rows[0].id, after: { title: b.title } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.season.opened", entity: "umrah_seasons", entityId: rows[0].id, after: { title: b.title } }).catch((e) => logger.error(e, "umrah background task failed"));
    // Per-season cost centre — season is a time-bound cost/profit bucket
    // (costs carry umrahSeasonId on their journal lines); auto-provision it so
    // per-season P&L drill-down works from day one, like project/agent.
    // Batch 6 — GUARANTEED (awaited) cost-centre link before the 201, not
    // fire-and-forget: the season must never reach its first posting with a
    // null cost-centre dimension. Idempotent + never throws (logs LINK_GAP).
    await ensureCostCenterForEntity(scope.companyId, "umrah_season", rows[0].id as number, b.title, { actorUserId: scope.userId });
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create season error"); }
});

router.patch("/seasons/:id", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchSeasonSchema.safeParse(req.body));
    // re-validate date ordering against the effective (merged) values:
    // patchSeasonSchema lets startDate/endDate change independently, so a partial
    // update must not place startDate after endDate (createSeasonSchema enforces this).
    if (b.startDate !== undefined || b.endDate !== undefined) {
      const [curDates] = await rawQuery<{ startDate: string; endDate: string }>(
        `SELECT "startDate"::text AS "startDate", "endDate"::text AS "endDate" FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!curDates) throw new NotFoundError("الموسم غير موجود");
      const effStart = b.startDate ?? curDates.startDate;
      const effEnd = b.endDate ?? curDates.endDate;
      if (effEnd < effStart) {
        throw new ValidationError("تاريخ النهاية يجب أن يكون بعد تاريخ البداية", { field: "endDate" });
      }
    }
    let originalStatus: string | undefined;
    if (b.status !== undefined) {
      const [existing] = await rawQuery<Record<string, unknown>>(`SELECT status FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
      if (!existing) throw new NotFoundError("الموسم غير موجود");
      originalStatus = existing.status as string | undefined;
      if (b.status !== existing.status) {
        const allowed = SEASON_TRANSITIONS[existing.status as string] ?? [];
        if (!allowed.includes(b.status)) {
          throw new ConflictError(
            `لا يمكن نقل الموسم من "${existing.status}" إلى "${b.status}"`,
            { field: "status", fix: `الانتقالات المسموحة: ${allowed.length ? allowed.join(", ") : "لا يوجد (حالة نهائية)"}` }
          );
        }
      }
    }
    if (b.status === "closed") {
      const open = await rawQuery(
        `SELECT COUNT(*) as c FROM umrah_pilgrims WHERE "seasonId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND status IN ('arrived','active','overstayed')`,
        [id, scope.companyId]
      );
      if (Number(open[0]?.c) > 0) {
        throw new ValidationError(`لا يمكن إغلاق الموسم — يوجد ${open[0].c} معتمر نشط`, { meta: { blockers: [{ type: "active_pilgrims", count: Number(open[0].c) }] } });
      }
      const unpaid = await rawQuery(
        `SELECT COUNT(*) as c FROM umrah_agent_invoices WHERE "seasonId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND status NOT IN ('paid','cancelled')`,
        [id, scope.companyId]
      );
      if (Number(unpaid[0]?.c) > 0) {
        throw new ValidationError(`لا يمكن إغلاق الموسم — يوجد ${unpaid[0].c} فاتورة غير مسددة`, { meta: { blockers: [{ type: "unpaid_invoices", count: Number(unpaid[0].c) }] } });
      }
    }
    const params: unknown[] = [];
    const sets: string[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.startDate !== undefined) { params.push(b.startDate); sets.push(`"startDate"=$${params.length}`); }
    if (b.endDate !== undefined) { params.push(b.endDate); sets.push(`"endDate"=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    sets.push(`"updatedAt"=NOW()`);
    params.push(id); params.push(scope.companyId);
    let seasonUpdateWhere = `id=$${params.length-1} AND "companyId"=$${params.length}`;
    if (originalStatus !== undefined) { params.push(originalStatus); seasonUpdateWhere += ` AND status=$${params.length}`; }
    const { affectedRows } = await rawExecute(`UPDATE umrah_seasons SET ${sets.join(",")} WHERE ${seasonUpdateWhere}`, params);
    if (!affectedRows) throw new NotFoundError("الموسم غير موجود");
    const [row] = await rawQuery(`SELECT * FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_seasons", entityId: Number(id), after: { status: b.status } }).catch((e) => logger.error(e, "umrah background task failed"));
    if (b.status) {
      emitEvent({ companyId: scope.companyId, userId: scope.userId, action: `umrah.season.${b.status}`, entity: "umrah_seasons", entityId: Number(id), after: { status: b.status } }).catch((e) => logger.error(e, "umrah background task failed"));
    }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update season error"); }
});

router.get("/agents", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // #2713 (تعميم) — سلة المحذوفات: deleted=true يعرض الوكلاء المحذوفين فقط.
    const showDeleted = (req.query as Record<string, string | undefined>).deleted === "true";
    const sql = showDeleted
      ? `SELECT * FROM umrah_agents WHERE "companyId"=$1 AND "deletedAt" IS NOT NULL ORDER BY name LIMIT 500`
      : `SELECT * FROM umrah_agents WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY name LIMIT 500`;
    const rows = await rawQuery(sql, [scope.companyId]);
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List agents error"); }
});

router.get("/agents/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(`SELECT * FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) { throw new NotFoundError("الوكيل غير موجود"); }
    // Operator statement — answers "how many pilgrims has this agent
    // sent? what's their balance?" without a second round-trip. Three
    // aggregate queries (pilgrim counts, status breakdown, finance) run
    // in parallel via Promise.all so adding them doesn't double the
    // latency of the detail fetch.
    const [statsResult, statusBreakdownResult, financeResult] = await Promise.all([
      rawQuery(
        `SELECT COUNT(*)::int AS "pilgrimCount",
                COUNT(*) FILTER (WHERE status='overstayed')::int AS "overstayedCount"
         FROM umrah_pilgrims WHERE "agentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      ),
      rawQuery<{ status: string; c: number }>(
        `SELECT status, COUNT(*)::int AS c
         FROM umrah_pilgrims WHERE "agentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
         GROUP BY status`,
        [id, scope.companyId]
      ),
      rawQuery(
        // 'cancelled' is excluded from totalInvoiced — operators don't
        // include voided invoices in the "owed" number. totalPaid uses
        // status='paid'; partial payments will undercount slightly but
        // the operator overhead of tracking allocations per invoice is
        // larger than the rounding gain — left for a follow-up that
        // joins umrah_payments + umrah_payment_allocations.
        `SELECT COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0)::numeric AS "totalInvoiced",
                COALESCE(SUM(total) FILTER (WHERE status = 'paid'), 0)::numeric         AS "totalPaid"
         FROM umrah_agent_invoices
         WHERE "agentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      ),
    ]);
    const stats = statsResult[0] || { pilgrimCount: 0, overstayedCount: 0 };
    const finance = financeResult[0] as { totalInvoiced: string; totalPaid: string } | undefined;
    const totalInvoiced = Number(finance?.totalInvoiced ?? 0);
    const totalPaid = Number(finance?.totalPaid ?? 0);
    // statusBreakdown shipped as a dict keyed by status so the UI can
    // pluck specific buckets without sorting.
    const statusBreakdown = Object.fromEntries(
      (statusBreakdownResult as Array<{ status: string; c: number }>).map((r) => [r.status, Number(r.c)])
    );
    res.json(maskFields(req, {
      ...row,
      ...stats,
      totalInvoiced,
      totalPaid,
      totalOutstanding: Math.max(0, totalInvoiced - totalPaid),
      statusBreakdown,
    }));
  } catch (err) { handleRouteError(err, res, "Get agent error"); }
});

// Recent invoices for an agent — makes the statement (PR #1438)
// actionable by showing WHICH invoices are unpaid so the operator
// can follow up on a specific ref, not just an abstract balance.
// `limit` is clamped to [1, 100] so the dropdown can't accidentally
// pull the full season.
router.get("/agents/:id/invoices", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    // Existence check up-front so a wrong agent id surfaces a 404
    // instead of "data: []" — operators have hit that ambiguity on
    // other detail endpoints and assumed "nothing invoiced" when
    // really the URL was wrong.
    const [agent] = await rawQuery<{ id: number }>(
      `SELECT id FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId]
    );
    if (!agent) throw new NotFoundError("الوكيل غير موجود");
    const rows = await rawQuery(
      `SELECT id, ref, type, "pilgrimCount", total, status, "dueDate", "createdAt"
         FROM umrah_agent_invoices
        WHERE "agentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
        ORDER BY "createdAt" DESC
        LIMIT $3`,
      [id, scope.companyId, limit]
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "List agent invoices error"); }
});

router.post("/agents", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createAgentSchema.safeParse(req.body));
    const rows = await rawQuery(
      `INSERT INTO umrah_agents ("companyId",name,"contactPerson",phone,email,country,"profitMargin","contractRef",currency,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [scope.companyId, b.name, b.contactPerson, b.phone, b.email, b.country, b.profitMargin || 0, b.contractRef, b.currency || "SAR", b.notes]
    );
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء الوكيل");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_agents", entityId: rows[0].id, after: { name: b.name } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.agent.created", entity: "umrah_agents", entityId: rows[0].id, details: JSON.stringify({ name: b.name, country: b.country }) }).catch((e) => logger.error(e, "umrah background task failed"));
    // Per-agent revenue subsidiary account (#1594) — fire-and-forget; sales for
    // this agent route to its own revenue leaf via resolveRevenueAccount.
    createSubsidiaryAccountsForEntity(scope.companyId, "umrah_agent", rows[0].id as number, b.name, { branchId: scope.branchId, actorUserId: scope.userId }).catch((e) => logger.error(e, "umrah agent subsidiary auto-create failed"));
    // Master-data identity (migration 249) — link the agent to ONE party. Non-fatal.
    registerEntityParty(scope.companyId, "umrah_agents", rows[0].id as number, "agent", {
      displayName: b.name, phone: b.phone ?? null, email: b.email ?? null, kind: "organization",
    }).catch((e) => logger.error(e, "[partyService] umrah_agents registration failed"));
    // Per-agent cost centre — backs /reports/profitability/umrah-agent with a real
    // cost_centers row (the agent already had a subsidiary account + umrahAgentId
    // dimension, but no auto cost centre — the one asymmetry vs vehicle/property).
    // Batch 6 — GUARANTEED (awaited) cost-centre link before the 201, not
    // fire-and-forget: the agent must never reach its first posting with a
    // null cost-centre dimension. Idempotent + never throws (logs LINK_GAP).
    await ensureCostCenterForEntity(scope.companyId, "umrah_agent", rows[0].id as number, b.name, { actorUserId: scope.userId });
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create agent error"); }
});

router.patch("/agents/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchAgentSchema.safeParse(req.body));
    let originalAgentStatus: string | undefined;
    if (b.status !== undefined) {
      const [existing] = await rawQuery<Record<string, unknown>>(`SELECT status FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
      if (!existing) throw new NotFoundError("الوكيل غير موجود");
      originalAgentStatus = existing.status as string | undefined;
      if (b.status !== existing.status) {
        const allowed = AGENT_TRANSITIONS[existing.status as string] ?? [];
        if (!allowed.includes(b.status)) {
          throw new ConflictError(
            `لا يمكن نقل حالة الوكيل من "${existing.status}" إلى "${b.status}"`,
            { field: "status", fix: `الانتقالات المسموحة: ${allowed.length ? allowed.join(", ") : "لا يوجد (حالة نهائية)"}` }
          );
        }
      }
    }
    const params: unknown[] = [];
    const sets: string[] = [];
    for (const key of ["name","contactPerson","phone","email","country","profitMargin","contractRef","currency","status","notes"] as const) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    sets.push(`"updatedAt"=NOW()`);
    params.push(id); params.push(scope.companyId);
    let agentUpdateWhere = `id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`;
    if (originalAgentStatus !== undefined) { params.push(originalAgentStatus); agentUpdateWhere += ` AND status=$${params.length}`; }
    const { affectedRows } = await rawExecute(`UPDATE umrah_agents SET ${sets.join(",")} WHERE ${agentUpdateWhere}`, params);
    if (!affectedRows) throw new NotFoundError("الوكيل غير موجود");
    const [row] = await rawQuery(`SELECT * FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_agents", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.agent.updated", entity: "umrah_agents", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update agent error"); }
});

router.delete("/agents/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(`SELECT id, name FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("الوكيل غير موجود");
    const [inUse] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*)::int AS c FROM umrah_pilgrims WHERE "agentId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (Number(inUse?.c) > 0) {
      throw new ConflictError(`لا يمكن حذف الوكيل — مرتبط بـ ${inUse.c} معتمر`);
    }
    await rawExecute(`UPDATE umrah_agents SET "deletedAt"=NOW(), "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_agents", entityId: id, before: { name: existing.name } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.agent.deleted", entity: "umrah_agents", entityId: id, details: JSON.stringify({ name: existing.name }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete agent error"); }
});

// #2713 (تعميم) — استرجاع وكيل محذوف ناعمًا (سلة المحذوفات). صلاحية تعديل + Audit.
router.post("/agents/:id/restore", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(`UPDATE umrah_agents SET "deletedAt"=NULL, "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NOT NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("لا يوجد وكيل محذوف بهذا المعرّف");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "restore", entity: "umrah_agents", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.agent.restored", entity: "umrah_agents", entityId: id, details: JSON.stringify({ restored: true }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Restore agent error"); }
});

// BILL-MAIN P3 (#2080) — explicit-confirmation linker that ties a main
// umrah agent to an EXISTING financial client. Mirrors the safe shape of
// the sub-agent linker shipped in BILL-LINK Phase 3b: existing-client
// only (no `createNew` branch), single-target (no bulk path), reads the
// before-state for proper audit before/after, and records an optional
// operator-provided `reason`.
//
// What this route does NOT do (explicit Permanent Hard Rails carried
// from #2080 / UMRAH_REMAINING_WORK_ROADMAP.md):
//   • No client creation.
//   • No AR opening (no subsidiary or receivable provisioning here —
//     the existing client's subsidiary chain takes over naturally).
//   • No engine touch — `generateSalesInvoice` still gates exclusively
//     on `subAgent.clientId` until BILL-MAIN P4 (hard-pause, separate
//     authorisation).
//   • No `main_agent_client` activation; the catalog default stays
//     `operational_until_linked`.
//   • No bulk variant. Each call links exactly one agent.
//   • No edit to issued invoices.
router.put("/agents/:id/link-client", authorize({ feature: "umrah", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { clientId, reason } = zodParse(linkAgentClientSchema.safeParse(req.body));

    // 1. Verify the target client exists under this tenant. We do NOT
    //    create it — the route is operator-confirmed linkage of an
    //    EXISTING client.
    const [existingClient] = await rawQuery<{ id: number }>(
      `SELECT id FROM clients WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [clientId, scope.companyId]
    );
    if (!existingClient) throw new NotFoundError("العميل غير موجود أو لا ينتمي لهذه الشركة");

    // 2. Read the agent's current `clientId` BEFORE the UPDATE so the
    //    audit log carries a real before/after pair (often null → newId).
    const [existingAgent] = await rawQuery<{ id: number; clientId: number | null; name: string | null }>(
      `SELECT id, "clientId", name FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existingAgent) throw new NotFoundError("الوكيل غير موجود");
    const beforeClientId = existingAgent.clientId;

    // 3. The link itself. Just `UPDATE umrah_agents SET "clientId"=...`.
    //    No subsidiary_accounts row is created here: the linked
    //    `clients` row already carries its own receivable subsidiary
    //    (provisioned automatically at client creation time by the
    //    finance-side helper, outside this file). AR resolution chains
    //    to that automatically once the engine fallback ships in P4 —
    //    until then this column is just data, no behaviour change.
    await rawExecute(
      `UPDATE umrah_agents SET "clientId"=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [clientId, id, scope.companyId]
    );

    // 4. Read the row back so the response shape mirrors PATCH /agents/:id.
    const [row] = await rawQuery(
      `SELECT * FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );

    // 5. Full audit + event. The `source` flag distinguishes this
    //    explicit-confirmation linker from any future automated path.
    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "update",
      entity: "umrah_agents",
      entityId: id,
      before: { clientId: beforeClientId },
      after: { clientId },
      reason,
    }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "umrah.agent.linked_to_client",
      entity: "umrah_agents",
      entityId: id,
      details: JSON.stringify({
        clientId,
        beforeClientId,
        reason: reason ?? null,
        source: "operator_confirmed_link_agent_client",
      }),
    }).catch((e) => logger.error(e, "umrah background task failed"));

    res.json({ success: true, agentId: id, beforeClientId, ...row });
  } catch (err) { handleRouteError(err, res, "Link agent to client"); }
});

router.get("/packages", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT p.*, s.title as "seasonTitle" FROM umrah_packages p LEFT JOIN umrah_seasons s ON p."seasonId"=s.id AND s."deletedAt" IS NULL WHERE p."companyId"=$1 AND p."deletedAt" IS NULL ORDER BY p.name LIMIT 500`, [scope.companyId]);
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List packages error"); }
});

router.post("/packages", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createPackageSchema.safeParse(req.body));
    if (b.seasonId) await requireOpenSeason(Number(b.seasonId), scope.companyId);
    const rows = await rawQuery(
      `INSERT INTO umrah_packages ("companyId",name,"seasonId","costPrice","sellPrice","includesTransport","includesHotel","includesMeals","includesZiyarat",duration,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [scope.companyId, b.name, b.seasonId, b.costPrice, b.sellPrice, b.includesTransport || false, b.includesHotel || false, b.includesMeals || false, b.includesZiyarat || false, b.duration || 7, b.description]
    );
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء الباقة");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_packages", entityId: rows[0].id, after: { name: b.name } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.package.created", entity: "umrah_packages", entityId: rows[0].id, details: JSON.stringify({ name: b.name, costPrice: b.costPrice, sellPrice: b.sellPrice }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create package error"); }
});

router.get("/packages/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Defence-in-depth on the season JOIN — same pattern landed on
    // groups/:id and sub-agents/:id. Without companyId a stale row
    // could leak a title from another tenant.
    const [row] = await rawQuery(
      `SELECT p.*, s.title AS "seasonTitle"
         FROM umrah_packages p
    LEFT JOIN umrah_seasons s
           ON p."seasonId" = s.id
          AND s."companyId" = p."companyId"
          AND s."deletedAt" IS NULL
        WHERE p.id = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) { throw new NotFoundError("الباقة غير موجودة"); }

    // Aggregates — the page already needs "how many pilgrims on this
    // package" and "what's its revenue/cost picture". One roundtrip
    // via Promise.all so loading the detail page stays snappy on
    // large seasons.
    const [statusRows, marginRow] = await Promise.all([
      rawQuery<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text AS count
           FROM umrah_pilgrims
          WHERE "packageId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
          GROUP BY status`,
        [id, scope.companyId],
      ),
      // Pilgrim count × package sellPrice/costPrice → simple revenue
      // projection. Real revenue lives on invoices but the package
      // itself doesn't know about invoices — projection is the right
      // signal for "is this package priced correctly?".
      rawQuery<{ count: string; sellPrice: string | null; costPrice: string | null }>(
        `SELECT (SELECT COUNT(*)::text FROM umrah_pilgrims
                  WHERE "packageId" = p.id AND "companyId" = p."companyId" AND "deletedAt" IS NULL
                ) AS count,
                p."sellPrice"::text AS "sellPrice",
                p."costPrice"::text AS "costPrice"
           FROM umrah_packages p
          WHERE p.id = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL`,
        [id, scope.companyId],
      ),
    ]);

    const statusBreakdown: Record<string, number> = {};
    let pilgrimCount = 0;
    for (const r of statusRows) {
      const n = Number(r.count);
      statusBreakdown[r.status] = n;
      pilgrimCount += n;
    }

    const sell = Number(marginRow[0]?.sellPrice ?? 0);
    const cost = Number(marginRow[0]?.costPrice ?? 0);

    res.json(maskFields(req, {
      ...row,
      pilgrimCount,
      statusBreakdown,
      projection: {
        sellPerPilgrim: sell,
        costPerPilgrim: cost,
        marginPerPilgrim: sell - cost,
        projectedRevenue: sell * pilgrimCount,
        projectedCost: cost * pilgrimCount,
        projectedMargin: (sell - cost) * pilgrimCount,
      },
    }));
  } catch (err) { handleRouteError(err, res, "Get package error"); }
});

router.patch("/packages/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchPackageSchema.safeParse(req.body));
    const params: unknown[] = [];
    const sets: string[] = [];
    for (const key of ["name","seasonId","costPrice","sellPrice","includesTransport","includesHotel","includesMeals","includesZiyarat","duration","description"] as const) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    sets.push(`"updatedAt"=NOW()`);
    // #2718 — قفل تعارض اختياري: إن أرسل العميل النسخة المعروفة (updatedAt)
    // نفرضها في الشرط؛ اختلافها = عدّل مستخدم آخر السجل بيننا → 409.
    let versionClause = "";
    if (b.updatedAt) { params.push(b.updatedAt); versionClause = ` AND "updatedAt"=$${params.length}`; }
    params.push(id); const idIdx = params.length;
    params.push(scope.companyId); const coIdx = params.length;
    const { affectedRows } = await rawExecute(`UPDATE umrah_packages SET ${sets.join(",")} WHERE id=$${idIdx} AND "companyId"=$${coIdx} AND "deletedAt" IS NULL${versionClause}`, params);
    if (!affectedRows) {
      // فرّق «غير موجود» عن «تعارض نسخة»: أعد الفحص بلا شرط النسخة.
      const [stillThere] = await rawQuery<{ id: number }>(`SELECT id FROM umrah_packages WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
      if (stillThere && b.updatedAt) {
        throw new ConflictError("عُدّلت الباقة من مستخدم آخر منذ فتحك لها. أعد التحميل ثم احفظ.", { fix: "أعد تحميل الصفحة لرؤية آخر نسخة قبل الحفظ" });
      }
      throw new NotFoundError("الباقة غير موجودة");
    }
    const [row] = await rawQuery(`SELECT * FROM umrah_packages WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_packages", entityId: id, after: b }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.package.updated", entity: "umrah_packages", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update package error"); }
});

router.delete("/packages/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const inUse = await rawQuery(
      `SELECT COUNT(*)::int AS c FROM umrah_pilgrims WHERE "packageId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (Number(inUse[0]?.c) > 0) {
      throw new ConflictError(`لا يمكن حذف الباقة — مرتبطة بـ ${inUse[0].c} معتمر`);
    }
    await applyTransition({
      entity: "umrah_packages",
      id: id,
      scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
      action: "umrah.package.deleted",
      toState: "deleted",
    });
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete package error"); }
});

router.get("/pilgrims", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, status, agentId, groupId, nationality, flight, arrivalDate, departureDate, visaExpiringWithin, search, page = "1", limit = "20" } = req.query as Record<string, string | undefined>;
    // #2713 (تعميم) — سلة المحذوفات: deleted=true يعرض المعتمرين المحذوفين فقط.
    const showDeleted = (req.query as Record<string, string | undefined>).deleted === "true";
    let where = showDeleted
      ? `p."companyId"=$1 AND p."deletedAt" IS NOT NULL`
      : `p."companyId"=$1 AND p."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND p."seasonId"=$${params.length}`; }
    if (status) { params.push(status); where += ` AND p.status=$${params.length}`; }
    if (agentId) { params.push(agentId); where += ` AND p."agentId"=$${params.length}`; }
    if (groupId) { params.push(groupId); where += ` AND p."groupId"=$${params.length}`; }
    // Nationality is plaintext and operators routinely filter manifests
    // by country (visa quotas, hotel block bookings). ILIKE — not equality
    // — because the import file may write "SA" or "SAUDI" or "Saudi
    // Arabia" depending on the source.
    if (nationality) { params.push(`%${nationality}%`); where += ` AND p.nationality ILIKE $${params.length}`; }
    // Flight filter — the daily flight-day workflow. Matches either
    // entryFlight OR exitFlight via ILIKE so a single search hits both
    // arrival + departure manifests. Pair with the bulk-status flip
    // (PR #1430) for the canonical pattern: filter flight → select all
    // → mark arrived/departed in one click.
    if (flight) {
      params.push(`%${flight}%`);
      where += ` AND (p."entryFlight" ILIKE $${params.length} OR p."exitFlight" ILIKE $${params.length})`;
    }
    // Exact-date filters — the morning "who's coming in today / leaving
    // today" question. arrivalDate / departureDate are `date` columns,
    // so an equality match against a YYYY-MM-DD string works without
    // cast. Operators pass the Riyadh-local date from the UI (the
    // todayLocal() helper) so they don't accidentally query UTC.
    if (arrivalDate) { params.push(arrivalDate); where += ` AND p."arrivalDate" = $${params.length}`; }
    if (departureDate) { params.push(departureDate); where += ` AND p."departureDate" = $${params.length}`; }
    // Visa-expiring window — surfaces compliance risk before it
    // becomes a KSA overstay fine. Range: [today, today + N days];
    // also excludes already-departed/cancelled rows since their visa
    // status is operationally irrelevant. The UI dashboard banner +
    // chip filter clicks set N=7 by default. Date arithmetic uses
    // CURRENT_DATE so the boundary tracks the server's date — same
    // source todayISO() reads.
    if (visaExpiringWithin) {
      const days = Math.max(1, Math.min(90, Number(visaExpiringWithin) || 7));
      params.push(days);
      // GCC nationals don't need a KSA visa — exclude them from the
      // expiring-alert list (same rule the season-detail KPI uses).
      where += ` AND p."visaExpiry" IS NOT NULL
                 AND p."visaExpiry" >= CURRENT_DATE
                 AND p."visaExpiry" <= CURRENT_DATE + ($${params.length} || ' days')::interval
                 AND p.status NOT IN ('departed','cancelled')
                 AND ${gccExclusionSqlFragment(`p."nationality"`)}`;
    }
    if (search) {
      // Search hits four columns:
      //   - fullName              (plaintext, ILIKE)
      //   - nuskNumber            (plaintext, ILIKE) — the OPERATOR's
      //                            primary identifier; NUSK + MOFA both
      //                            print this on every document
      //   - passportNumber_hash   (encrypted column; lookup via blind index)
      //   - visaNumber_hash       (same)
      // The single search box accepts any of these so operators don't
      // need to pre-decide which field they're searching by.
      const searchHash = blindIndex(String(search));
      params.push(`%${search}%`);
      const likePh = params.length;
      params.push(searchHash);
      const hashPh = params.length;
      where += ` AND (p."fullName" ILIKE $${likePh} OR p."nuskNumber" ILIKE $${likePh} OR p."passportNumber_hash" = $${hashPh} OR p."visaNumber_hash" = $${hashPh})`;
    }
    const pageNum = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (pageNum - 1) * perPage;
    const countQ = await rawQuery(`SELECT COUNT(*) as c FROM umrah_pilgrims p WHERE ${where}`, params);
    params.push(perPage); params.push(offset);
    const rows = await rawQuery(
      `SELECT p.*, a.name as "agentName", pkg.name as "packageName"
       FROM umrah_pilgrims p
       LEFT JOIN umrah_agents a ON p."agentId"=a.id
       LEFT JOIN umrah_packages pkg ON p."packageId"=pkg.id
       WHERE ${where}
       ORDER BY p."createdAt" DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    logSensitiveAccess({ companyId: scope.companyId, userId: scope.userId, action: "list", entity: "umrah_pilgrims", ipAddress: req.ip, userAgent: req.headers["user-agent"], details: { count: rows.length, search: search || null } });
    res.json(maskFields(req, { data: rows.map(decryptPilgrimRow), total: Number(countQ[0]?.c || 0), page: pageNum, pageSize: perPage }));
  } catch (err) { handleRouteError(err, res, "List pilgrims error"); }
});

// CSV export of the FULL filtered set (no pagination). The list page's
// existing exportToCSV() only grabs the current page (~20 rows), which
// is useless for handing manifests to MOFA / hotels / bus drivers. This
// endpoint mirrors the list filters and streams every match.
//
// Defence-in-depth: every JOIN matches BOTH id AND companyId so a
// mistyped FK can't lift another tenant's name onto an exported row
// (same pattern as PR #1425 added to GET /pilgrims/:id).
router.get("/pilgrims/export.csv", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, status, agentId, groupId, nationality, flight, arrivalDate, departureDate, visaExpiringWithin, search } = req.query as Record<string, string | undefined>;
    let where = `p."companyId"=$1 AND p."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND p."seasonId"=$${params.length}`; }
    if (status) { params.push(status); where += ` AND p.status=$${params.length}`; }
    if (agentId) { params.push(agentId); where += ` AND p."agentId"=$${params.length}`; }
    if (groupId) { params.push(groupId); where += ` AND p."groupId"=$${params.length}`; }
    if (nationality) { params.push(`%${nationality}%`); where += ` AND p.nationality ILIKE $${params.length}`; }
    if (flight) {
      params.push(`%${flight}%`);
      where += ` AND (p."entryFlight" ILIKE $${params.length} OR p."exitFlight" ILIKE $${params.length})`;
    }
    if (arrivalDate) { params.push(arrivalDate); where += ` AND p."arrivalDate" = $${params.length}`; }
    if (departureDate) { params.push(departureDate); where += ` AND p."departureDate" = $${params.length}`; }
    // Visa-expiring window — surfaces compliance risk before it
    // becomes a KSA overstay fine. Range: [today, today + N days];
    // also excludes already-departed/cancelled rows since their visa
    // status is operationally irrelevant. The UI dashboard banner +
    // chip filter clicks set N=7 by default. Date arithmetic uses
    // CURRENT_DATE so the boundary tracks the server's date — same
    // source todayISO() reads.
    if (visaExpiringWithin) {
      const days = Math.max(1, Math.min(90, Number(visaExpiringWithin) || 7));
      params.push(days);
      // GCC nationals don't need a KSA visa — exclude them from the
      // expiring-alert list (same rule the season-detail KPI uses).
      where += ` AND p."visaExpiry" IS NOT NULL
                 AND p."visaExpiry" >= CURRENT_DATE
                 AND p."visaExpiry" <= CURRENT_DATE + ($${params.length} || ' days')::interval
                 AND p.status NOT IN ('departed','cancelled')
                 AND ${gccExclusionSqlFragment(`p."nationality"`)}`;
    }
    if (search) {
      const searchHash = blindIndex(String(search));
      params.push(`%${search}%`);
      const likePh = params.length;
      params.push(searchHash);
      const hashPh = params.length;
      where += ` AND (p."fullName" ILIKE $${likePh} OR p."nuskNumber" ILIKE $${likePh} OR p."passportNumber_hash" = $${hashPh} OR p."visaNumber_hash" = $${hashPh})`;
    }

    const rows = await rawQuery(
      `SELECT p.*,
              a.name  as "agentName",
              pkg.name as "packageName",
              s.title  as "seasonTitle",
              g.name  as "groupName",
              sa.name as "subAgentName"
       FROM umrah_pilgrims p
       LEFT JOIN umrah_agents     a   ON p."agentId"=a.id      AND a."companyId"=p."companyId"  AND a."deletedAt" IS NULL
       LEFT JOIN umrah_packages   pkg ON p."packageId"=pkg.id  AND pkg."companyId"=p."companyId" AND pkg."deletedAt" IS NULL
       LEFT JOIN umrah_seasons    s   ON p."seasonId"=s.id     AND s."companyId"=p."companyId"  AND s."deletedAt" IS NULL
       LEFT JOIN umrah_groups     g   ON p."groupId"=g.id      AND g."companyId"=p."companyId"  AND g."deletedAt" IS NULL
       LEFT JOIN umrah_sub_agents sa  ON p."subAgentId"=sa.id  AND sa."companyId"=p."companyId" AND sa."deletedAt" IS NULL
       WHERE ${where}
       ORDER BY p."createdAt" DESC`,
      params
    );

    // Audit trail — exports of identifying info are sensitive.
    logSensitiveAccess({
      companyId: scope.companyId, userId: scope.userId, action: "export_csv",
      entity: "umrah_pilgrims", ipAddress: req.ip, userAgent: req.headers["user-agent"],
      details: { count: rows.length, filters: { seasonId, status, agentId, groupId, flight, arrivalDate, departureDate, search: search || null } },
    });
    // GAP_MATRIX P1 — pilgrims CSV export was in audit_logs (via logSensitiveAccess)
    // but missing from print_jobs. Both lanes required for PDPL compliance.
    rawExecute(
      `INSERT INTO print_jobs ("companyId","branchId","userId","entityType","entityId","format","status")
       VALUES ($1,$2,$3,'report_umrah_pilgrims','0','csv','completed')`,
      [scope.companyId, scope.branchId ?? null, scope.userId]
    ).catch(() => {});

    // RFC 4180 escape — quote when the cell contains the delimiter,
    // a quote, or any newline; double internal quotes.
    const csvEscape = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Manifest columns operators routinely need. Order matches what
    // MOFA / hotel / bus driver handouts use: identity → trip → flight.
    //
    // U-18-P4 — bilingual header policy: Arabic primary with English
    // in parentheses so partner systems that operate in EN (MOFA
    // status APIs, MOI border feed) can still parse the column set
    // without a separate mapping table. Charter §3.2 endorses this
    // direction.
    const headers = [
      ["nuskNumber", "رقم نسك (Nusk No.)"],
      ["fullName", "الاسم (Name)"],
      ["passportNumber", "رقم الجواز (Passport No.)"],
      ["nationality", "الجنسية (Nationality)"],
      ["gender", "الجنس (Gender)"],
      ["phone", "الهاتف (Phone)"],
      ["visaNumber", "رقم التأشيرة (Visa No.)"],
      ["visaExpiry", "صلاحية التأشيرة (Visa Expiry)"],
      ["mofaNumber", "رقم الموفا (MOFA No.)"],
      ["borderNumber", "رقم الحدود (Border No.)"],
      ["status", "الحالة (Status)"],
      ["arrivalDate", "تاريخ الوصول (Arrival Date)"],
      ["departureDate", "تاريخ المغادرة (Departure Date)"],
      ["entryFlight", "رحلة الوصول (Arrival Flight)"],
      ["exitFlight", "رحلة المغادرة (Departure Flight)"],
      ["hotelName", "الفندق (Hotel)"],
      ["roomNumber", "رقم الغرفة (Room No.)"],
      ["seasonTitle", "الموسم (Season)"],
      ["groupName", "المجموعة (Group)"],
      ["agentName", "الوكيل الرئيسي (Main Agent)"],
      ["subAgentName", "الوكيل الفرعي (Sub-Agent)"],
    ] as const;
    const headerRow = headers.map(([, label]) => csvEscape(label)).join(",");
    const decrypted = rows.map(decryptPilgrimRow) as Array<Record<string, unknown>>;
    const dataRows = decrypted.map((r) =>
      headers
        .map(([key]) => {
          // The `status` column ships as the raw lifecycle enum
          // ("pending" / "arrived" / ...) at the DB layer; translate
          // it to the same Arabic word the operator sees in the list.
          const raw = r[key];
          if (key === "status" && typeof raw === "string") {
            return csvEscape(PILGRIM_STATUS_LABELS_AR[raw] ?? raw);
          }
          return csvEscape(raw);
        })
        .join(","),
    );
    // BOM so Excel detects UTF-8 Arabic — without it the file opens as
    // mojibake (same lesson as PR #1420's rejected-rows CSV).
    const BOM = "﻿";
    const csv = BOM + [headerRow, ...dataRows].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="umrah-pilgrims-${todayISO()}.csv"`);
    res.send(csv);
  } catch (err) { handleRouteError(err, res, "Export pilgrims CSV error"); }
});

router.post("/pilgrims", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createPilgrimSchema.safeParse(req.body));

    if (!b.fullName || !String(b.fullName).trim()) {
      throw new ValidationError("اسم المعتمر مطلوب", {
        field: "fullName",
        fix: "أدخل الاسم الكامل للمعتمر كما في جواز السفر",
      });
    }
    if (!b.passportNumber || !String(b.passportNumber).trim()) {
      throw new ValidationError("رقم جواز السفر مطلوب", {
        field: "passportNumber",
        fix: "أدخل رقم جواز السفر",
      });
    }
    if (!b.seasonId) {
      throw new ValidationError("الموسم مطلوب", {
        field: "seasonId",
        fix: "اختر موسم العمرة من القائمة",
      });
    }

    await requireOpenSeason(Number(b.seasonId), scope.companyId);
    if (b.agentId) {
      const [agent] = await rawQuery<{ id: number }>(
        `SELECT id FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(b.agentId), scope.companyId]
      );
      if (!agent) {
        throw new ValidationError(`الوكيل رقم ${b.agentId} غير موجود`, {
          field: "agentId",
          fix: "اختر وكيلاً مسجلاً أو اتركه فارغاً",
        });
      }
    }
    if (b.subAgentId) {
      // Verify sub-agent belongs to the company AND, if an agent was
      // selected, that the sub-agent's parent is that agent. Without
      // this the operator could attach pilgrim → sub-agent of agent
      // B while the pilgrim itself sits under agent A — the rollups
      // would double-count and the agent statement would be wrong.
      const [sub] = await rawQuery<{ id: number; agentId: number | null }>(
        `SELECT id, "agentId" FROM umrah_sub_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(b.subAgentId), scope.companyId]
      );
      if (!sub) {
        throw new ValidationError(`المكتب (الوكيل الفرعي) رقم ${b.subAgentId} غير موجود`, {
          field: "subAgentId",
          fix: "اختر مكتباً مسجلاً أو اتركه فارغاً",
        });
      }
      if (b.agentId && sub.agentId !== null && sub.agentId !== Number(b.agentId)) {
        throw new ValidationError("المكتب المختار لا ينتمي للوكيل المحدد", {
          field: "subAgentId",
          fix: "اختر مكتباً تابعاً للوكيل، أو غيّر الوكيل",
        });
      }
    }
    if (b.groupId) {
      const [group] = await rawQuery<{ id: number; agentId: number | null }>(
        `SELECT id, "agentId" FROM umrah_groups WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(b.groupId), scope.companyId]
      );
      if (!group) {
        throw new ValidationError(`المجموعة رقم ${b.groupId} غير موجودة`, {
          field: "groupId",
          fix: "اختر مجموعة مسجلة أو اتركها فارغة",
        });
      }
      if (b.agentId && group.agentId !== null && group.agentId !== Number(b.agentId)) {
        throw new ValidationError("المجموعة المختارة لا تنتمي للوكيل المحدد", {
          field: "groupId",
          fix: "اختر مجموعة تابعة للوكيل، أو غيّر الوكيل",
        });
      }
    }
    if (b.packageId) {
      const [pkg] = await rawQuery<{ id: number }>(
        `SELECT id FROM umrah_packages WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(b.packageId), scope.companyId]
      );
      if (!pkg) {
        throw new ValidationError(`الباقة رقم ${b.packageId} غير موجودة`, {
          field: "packageId",
          fix: "اختر باقة مسجلة أو اتركها فارغة",
        });
      }
    }

    const passportPlain = String(b.passportNumber).trim();
    const visaPlain = b.visaNumber ? String(b.visaNumber).trim() : null;
    const rows = await rawQuery(
      `INSERT INTO umrah_pilgrims ("companyId","branchId","seasonId","agentId","subAgentId","groupId","nuskNumber","packageId","fullName","passportNumber","passportNumber_hash","visaNumber","visaNumber_hash",nationality,gender,"dateOfBirth",phone,"arrivalDate","departureDate","hotelName","roomNumber",notes,"createdBy","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW()) RETURNING *`,
      [
        scope.companyId,
        scope.branchId || null,
        Number(b.seasonId),
        b.agentId ? Number(b.agentId) : null,
        b.subAgentId ? Number(b.subAgentId) : null,
        b.groupId ? Number(b.groupId) : null,
        b.nuskNumber ? String(b.nuskNumber).trim() : null,
        b.packageId ? Number(b.packageId) : null,
        String(b.fullName).trim(),
        encryptField(passportPlain),
        blindIndex(passportPlain),
        visaPlain ? encryptField(visaPlain) : null,
        visaPlain ? blindIndex(visaPlain) : null,
        b.nationality ?? null,
        b.gender ?? null,
        b.dateOfBirth ?? null,
        b.phone ?? null,
        b.arrivalDate ?? null,
        b.departureDate ?? null,
        b.hotelName ?? null,
        b.roomNumber ?? null,
        b.notes ?? null,
        scope.userId,
      ]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_pilgrims", entityId: rows[0]?.id, after: { fullName: String(b.fullName).trim() } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.pilgrim.created", entity: "umrah_pilgrims", entityId: rows[0]?.id, pilgrimId: Number(rows[0]?.id), packageId: b.packageId ? Number(b.packageId) : 0, passportNo: passportPlain, after: { fullName: String(b.fullName).trim() } }).catch((e) => logger.error(e, "umrah background task failed"));
    // Master-data identity (migration 249) — link the pilgrim to ONE party.
    // nationalId is intentionally NULL here: the passport is encrypted/sensitive
    // and must not be written in plaintext to the registry; dedup falls back to
    // phone. Non-fatal.
    registerEntityParty(scope.companyId, "umrah_pilgrims", Number(rows[0]?.id), "pilgrim", {
      displayName: String(b.fullName).trim(), phone: b.phone ?? null, nationalId: null, kind: "person",
    }).catch((e) => logger.error(e, "[partyService] umrah_pilgrims registration failed"));
    res.status(201).json(decryptPilgrimRow(rows[0]));
  } catch (err) { handleRouteError(err, res, "Create pilgrim error"); }
});

router.patch("/pilgrims/:id", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const b = zodParse(patchPilgrimSchema.safeParse(req.body));
    const pilgrimId = parseId(req.params.id, "id");

    // Overstay-exemption invariants (PR #1481): setting exempt=true
    // REQUIRES a reason so compliance can audit WHY. Without it the
    // operator could silently skip the cron for arbitrary pilgrims.
    // Setting exempt=false (un-exempting) DOESN'T require a reason —
    // the operator's removing the exemption, not adding one.
    if (b.overstayExempt === true) {
      const reason = (b.overstayExemptReason ?? "").trim();
      if (!reason) {
        throw new ValidationError("سبب الاستثناء مطلوب — لا يمكن استثناء معتمر بدون مبرّر مكتوب", {
          field: "overstayExemptReason",
          fix: "اكتب سبباً واضحاً (مثل: تأخّر مستشفى، اتفاق وكيل، تأخّر طيران)",
        });
      }
    }

    const fieldKeys = ["agentId","subAgentId","packageId","fullName","passportNumber","visaNumber","nationality","gender","dateOfBirth","phone","arrivalDate","departureDate","actualArrival","actualDeparture","hotelName","roomNumber","transportAssigned","notes"] as const;

    const encryptIfSensitive = (key: string, val: any): any => {
      if (!val) return val;
      if (key === "passportNumber" || key === "visaNumber" || key === "mofaNumber" || key === "borderNumber") {
        return encryptField(String(val).trim());
      }
      return val;
    };

    if (b.status !== undefined) {
      const setExtras: Record<string, any> = {};
      for (const key of fieldKeys) {
        if (b[key] !== undefined) {
          setExtras[key] = encryptIfSensitive(key, b[key]);
          if (key === "passportNumber") setExtras["passportNumber_hash"] = blindIndex(String(b[key]).trim());
          if (key === "visaNumber") setExtras["visaNumber_hash"] = blindIndex(String(b[key]).trim());
        }
      }
      const fromStates = Object.entries(PILGRIM_TRANSITIONS)
        .filter(([, targets]) => targets.includes(b.status!))
        .map(([from]) => from);

      const row = await applyTransition({
        entity: "umrah_pilgrims",
        id: pilgrimId,
        scope,
        action: "umrah.pilgrim.status_changed",
        fromStates,
        toState: b.status!,
        setExtras: Object.keys(setExtras).length > 0 ? setExtras : undefined,
        extraWhere: `"deletedAt" IS NULL`,
        after: { newStatus: b.status },
      });
      res.json(decryptPilgrimRow(row));
    } else {
      const params: unknown[] = [];
      const sets: string[] = [];
      for (const key of fieldKeys) {
        if (b[key] !== undefined) {
          params.push(encryptIfSensitive(key, b[key]));
          sets.push(`"${key}"=$${params.length}`);
          if (key === "passportNumber") { params.push(blindIndex(String(b[key]).trim())); sets.push(`"passportNumber_hash"=$${params.length}`); }
          if (key === "visaNumber") { params.push(blindIndex(String(b[key]).trim())); sets.push(`"visaNumber_hash"=$${params.length}`); }
        }
      }
      // Overstay-exemption columns (migration 242). Written together
      // with the standard fields so a single PATCH can flip the flag
      // + update other state in one transaction. We track WHO + WHEN
      // server-side so the audit trail can't be forged via API body.
      if (b.overstayExempt !== undefined) {
        params.push(b.overstayExempt);
        sets.push(`"overstayExempt"=$${params.length}`);
        if (b.overstayExempt) {
          // Exempting → record the operator + timestamp + reason.
          params.push(b.overstayExemptReason!.trim());
          sets.push(`"overstayExemptReason"=$${params.length}`);
          params.push(scope.userId);
          sets.push(`"overstayExemptBy"=$${params.length}`);
          sets.push(`"overstayExemptAt"=NOW()`);
        } else {
          // Un-exempting → clear the metadata so a re-exemption
          // gets a fresh by/at trail instead of inheriting stale
          // values from a prior exemption.
          sets.push(`"overstayExemptReason"=NULL`);
          sets.push(`"overstayExemptBy"=NULL`);
          sets.push(`"overstayExemptAt"=NULL`);
        }
      }
      // Visa application workflow (migration 266). Validate the
      // transition against VISA_TRANSITIONS so an invalid jump is
      // rejected BEFORE the UPDATE — operators get a clear error
      // instead of a silent unchanged state.
      if (b.visaStatus !== undefined) {
        const { canTransition, timestampColumnFor } = await import("../lib/umrahVisaWorkflow.js");
        const [currentRow] = await rawQuery<{ visaStatus: string }>(
          `SELECT "visaStatus" FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
          [pilgrimId, scope.companyId],
        );
        if (!currentRow) throw new NotFoundError("المعتمر غير موجود");
        const currentStatus = currentRow.visaStatus ?? "not_requested";
        if (currentStatus !== b.visaStatus && !canTransition(currentStatus, b.visaStatus)) {
          throw new ValidationError(
            `انتقال غير مسموح من حالة التأشيرة "${currentStatus}" إلى "${b.visaStatus}"`,
            { field: "visaStatus", fix: "اختر حالة انتقال متاحة (راجع آلة الحالة للتأشيرة)" },
          );
        }
        // Reject requires a written reason — compliance can audit WHY.
        if (b.visaStatus === "rejected") {
          const reason = (b.visaRejectionReason ?? "").trim();
          if (!reason) {
            throw new ValidationError("سبب الرفض مطلوب — لا يمكن رفض تأشيرة بدون مبرّر مكتوب", {
              field: "visaRejectionReason",
              fix: "اكتب سبباً واضحاً (مثل: نقص مستند، رفض جهة المخالصات)",
            });
          }
          params.push(reason);
          sets.push(`"visaRejectionReason"=$${params.length}`);
        }
        params.push(b.visaStatus);
        sets.push(`"visaStatus"=$${params.length}`);
        // Capture the milestone timestamp when the state has one.
        const tsCol = timestampColumnFor(b.visaStatus as never);
        if (tsCol) sets.push(`"${tsCol}"=NOW()`);
      }
      if (sets.length === 0) {
        const [row] = await rawQuery(`SELECT * FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [pilgrimId, scope.companyId]);
        if (!row) throw new NotFoundError("المعتمر غير موجود");
        res.json(decryptPilgrimRow(row));
        return;
      }
      sets.push(`"updatedAt"=NOW()`);
      params.push(pilgrimId); params.push(scope.companyId);
      const { affectedRows } = await rawExecute(`UPDATE umrah_pilgrims SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
      if (!affectedRows) throw new NotFoundError("الحاج غير موجود");
      const [row] = await rawQuery(`SELECT * FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [pilgrimId, scope.companyId]);
      if (!row) throw new NotFoundError("المعتمر غير موجود");
      createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_pilgrims", entityId: pilgrimId }).catch((e) => logger.error(e, "umrah background task failed"));
      emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pilgrim.updated", entity: "umrah_pilgrims", entityId: pilgrimId, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah background task failed"));
      res.json(decryptPilgrimRow(row));
    }
  } catch (err) {
    const lr = lifecycleErrorResponse(err);
    if (lr) { res.status(lr.status).json(lr.body); return; }
    handleRouteError(err, res, "Update pilgrim error");
  }
});

router.get("/pilgrims/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // JOINs surface the operator-facing names for every FK on the row.
    // Defence-in-depth: every JOIN also matches "companyId" so a stale
    // / mistyped id can't lift another tenant's name into the response.
    const [row] = await rawQuery(
      `SELECT p.*,
              a.name  as "agentName",
              pkg.name as "packageName",
              s.title  as "seasonTitle",
              g.name  as "groupName",
              sa.name as "subAgentName"
       FROM umrah_pilgrims p
       LEFT JOIN umrah_agents     a   ON p."agentId"=a.id      AND a."companyId"=p."companyId"  AND a."deletedAt" IS NULL
       LEFT JOIN umrah_packages   pkg ON p."packageId"=pkg.id  AND pkg."companyId"=p."companyId" AND pkg."deletedAt" IS NULL
       LEFT JOIN umrah_seasons    s   ON p."seasonId"=s.id     AND s."companyId"=p."companyId"  AND s."deletedAt" IS NULL
       LEFT JOIN umrah_groups     g   ON p."groupId"=g.id      AND g."companyId"=p."companyId"  AND g."deletedAt" IS NULL
       LEFT JOIN umrah_sub_agents sa  ON p."subAgentId"=sa.id  AND sa."companyId"=p."companyId" AND sa."deletedAt" IS NULL
       WHERE p.id=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL`, [id, scope.companyId]
    );
    if (!row) { throw new NotFoundError("المعتمر غير موجود"); }
    logSensitiveAccess({ companyId: scope.companyId, userId: scope.userId, action: "read", entity: "umrah_pilgrims", entityId: id, ipAddress: req.ip, userAgent: req.headers["user-agent"] });
    const penalties = await rawQuery(`SELECT * FROM umrah_penalties WHERE "pilgrimId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500`, [id, scope.companyId]);
    res.json(maskFields(req, { ...decryptPilgrimRow(row), penalties }));
  } catch (err) { handleRouteError(err, res, "Get pilgrim error"); }
});

// Per-pilgrim activity timeline (PR #1484) — closes the operator's
// "بمجر يدخل المعتمر او يتم اصدار تأشيرة لابد يكون فيه تحديد يومي
//  عن بيانات المعتمر دخل خرج" rule. Reads audit_logs scoped to this
// pilgrim, LEFT JOINs users for the operator's name, returns the
// last 100 events newest-first.
//
// Why not just SELECT *? entityId on audit_logs is `text` (legacy
// shape, supports composite ids elsewhere). We cast on the WHERE
// clause and use the index that already covers (entity, entityId).
router.get("/pilgrims/:id/timeline", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Existence check first — a 404 here means the operator typed
    // a bad URL, not "no events yet for this pilgrim".
    const [exists] = await rawQuery<{ id: number }>(
      `SELECT id FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId],
    );
    if (!exists) throw new NotFoundError("المعتمر غير موجود");

    const events = await rawQuery<Record<string, unknown>>(
      `SELECT al.id, al.action, al."userId", al.before, al.after, al."createdAt",
              COALESCE(e.name, u.email) AS "userName"
         FROM audit_logs al
         LEFT JOIN users u
                ON u.id = al."userId"
         LEFT JOIN employees e
                ON e.id = u."employeeId"
        WHERE al.entity = 'umrah_pilgrims'
          AND al."entityId" = $1::text
          AND al."companyId" = $2
        ORDER BY al."createdAt" DESC
        LIMIT 100`,
      [String(id), scope.companyId],
    );

    res.json({ data: events, total: events.length });
  } catch (err) { handleRouteError(err, res, "Get pilgrim timeline error"); }
});

router.delete("/pilgrims/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(`SELECT id, "fullName", status FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("المعتمر غير موجود");
    const nonDeletableStatuses = ["arrived", "active", "overstayed", "violated"];
    if (nonDeletableStatuses.includes(existing.status as string)) {
      throw new ConflictError(`لا يمكن حذف معتمر في حالة "${existing.status}" — يُسمح فقط بحذف المعتمرين في حالة pending أو cancelled`);
    }
    const [invoiced] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*)::int AS c FROM umrah_penalties WHERE "pilgrimId"=$1 AND "companyId"=$2 AND status='invoiced'`, [id, scope.companyId]);
    if (Number(invoiced?.c) > 0) {
      throw new ConflictError("لا يمكن حذف معتمر عليه غرامات مُفوترة");
    }
    await rawExecute(`UPDATE umrah_pilgrims SET "deletedAt"=NOW(), "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_pilgrims", entityId: id, before: { fullName: existing.fullName } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pilgrim.deleted", entity: "umrah_pilgrims", entityId: id, details: JSON.stringify({ fullName: existing.fullName }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete pilgrim error"); }
});

// #2713 (تعميم) — استرجاع معتمر محذوف ناعمًا (سلة المحذوفات). صلاحية تعديل + Audit.
router.post("/pilgrims/:id/restore", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(`UPDATE umrah_pilgrims SET "deletedAt"=NULL, "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NOT NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("لا يوجد معتمر محذوف بهذا المعرّف");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "restore", entity: "umrah_pilgrims", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pilgrim.restored", entity: "umrah_pilgrims", entityId: id, details: JSON.stringify({ restored: true }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Restore pilgrim error"); }
});

router.post("/import/preview", authorize({ feature: "umrah", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { seasonId, rows: importRows, fileType, columnMapping } = zodParse(importPreviewSchema.safeParse(req.body));

    // Delegate to umrahImportEngine so the preview reflects the same
    // dedup keys + warnings the confirm step will use. Pre-PR the route
    // ran an inline legacy query against `umrah_pilgrims.passportNumber_hash`
    // that returned only basic counts — the wizard's agent-linking
    // warnings (`newAgentsToCreate`, `rowsWithoutAgent`) never surfaced
    // because the engine wasn't on the path.
    const importScope = {
      companyId: scope.companyId,
      branchId: scope.branchId ?? 0,
      userId: scope.userId,
      seasonId,
    };
    // Translate Arabic-keyed Excel rows to engine-keyed rows. The
    // wizard parses Excel client-side and ships the original headers
    // unchanged; the engine consumes camelCase fields. Optional
    // `columnMapping` overrides the built-in map per import.
    const normalizedFileType: "mutamers" | "vouchers" = fileType === "vouchers" ? "vouchers" : "mutamers";
    const normalizedRows = normalizeImportRows(importRows, normalizedFileType, columnMapping);
    const diff = normalizedFileType === "vouchers"
      ? await previewVouchersImport(importScope, normalizedRows)
      : await previewMutamersImport(importScope, normalizedRows);

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.import.previewed",
      entity: fileType === "vouchers" ? "umrah_nusk_invoices" : "umrah_pilgrims",
      entityId: 0,
      details: JSON.stringify({
        seasonId, fileType,
        total: diff.totalRows,
        newCount: diff.newRows.length,
        updatedCount: diff.updatedRows.length,
        unchangedCount: diff.skippedCount,
        errorCount: diff.errorRows.length,
        unlinkedSubAgentCount: diff.unlinkedSubAgents.length,
        newAgentsCount: diff.newAgentsToCreate.length,
        rowsWithoutAgent: diff.rowsWithoutAgent,
      }),
    }).catch((e) => logger.error(e, "umrah import preview bg"));

    // Response shape mirrors the wizard's `PreviewSummary` interface so
    // the UI's counters + warning cards work without translation. The
    // `*Records` aliases are kept for backward compat with older callers
    // that snapshotted the previous response shape.
    res.json({
      // Canonical UI names
      total: diff.totalRows,
      newCount: diff.newRows.length,
      updatedCount: diff.updatedRows.length,
      unchangedCount: diff.skippedCount,
      errorCount: diff.errorRows.length,
      // Surfaces the engine's structured rejection metadata
      // (fieldName + sample) so the wizard can render a real diagnostics
      // table + offer a CSV download instead of a row-number-only list.
      // `row` stays 1-based to align with Excel's row numbering when
      // operators cross-reference.
      errors: diff.errorRows.map((e) => ({
        row: e.rowIndex + 1,
        message: e.error,
        fieldName: e.fieldName ?? null,
        sample: e.sample ?? null,
      })),
      unlinkedSubAgents: diff.unlinkedSubAgents,
      newAgentsToCreate: diff.newAgentsToCreate,
      rowsWithoutAgent: diff.rowsWithoutAgent,
      financialImpactCount: diff.financialImpactCount,
      // Back-compat aliases (legacy callers / older clients).
      totalRows: diff.totalRows,
      newRecords: diff.newRows.length,
      duplicateRecords: diff.skippedCount,
      errorRecords: diff.errorRows.length,
      sampleNew: diff.newRows.slice(0, 5),
      sampleDuplicate: diff.updatedRows.slice(0, 5).map((u) => u.row),
      sampleErrors: diff.errorRows.slice(0, 5),
    });
  } catch (err) { handleRouteError(err, res, "Import preview error"); }
});

router.post("/import/mutamers", authorize({ feature: "umrah", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { seasonId, rows: importRows, fileName, columnMapping } = zodParse(importMutamersSchema.safeParse(req.body));
    await requireOpenSeason(seasonId, scope.companyId);
    // Engine path. The pre-fix route called a legacy `doImport`
    // helper that INSERTed every row with `agentId = NULL` (no
    // groupId / subAgentId either), because it never invoked
    // resolveAgent / resolveGroup / resolveSubAgent. Operator
    // reported a 1,363-row import that "succeeded" but produced
    // zero visible pilgrims / zero agents / zero details.
    // `confirmMutamersImport` is the same path /import/preview
    // already uses for the diff, and /import/vouchers uses for
    // vouchers — see umrahImportFkResolutionSmoke.test.ts.
    const importScope = {
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      seasonId,
    };
    const normalizedRows = normalizeImportRows(importRows, "mutamers", columnMapping);
    const result = await confirmMutamersImport(importScope, normalizedRows, fileName ?? "import-mutamers");
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.import.mutamers.completed", entity: "umrah_import_batches",
      entityId: result.batchId ?? 0,
      details: JSON.stringify({ seasonId, rowCount: importRows.length }),
    }).catch((e) => logger.error(e, "umrah import bg"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Import mutamers error"); }
});

router.post("/import/vouchers", authorize({ feature: "umrah", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { seasonId, rows: importRows, fileName, treasuryId, purchaseAccountCode, columnMapping, allowOverdraft } =
      zodParse(importVouchersSchema.safeParse(req.body));
    await requireOpenSeason(seasonId, scope.companyId);
    // Wire vouchers through the dedicated engine so they actually create
    // umrah_nusk_invoices rows + post the AP journal entries. Pre-PR the
    // route was routing voucher files through `doImport`, which only
    // writes to umrah_pilgrims — voucher data was effectively dropped.
    // The cash-box + account-override picks (gaps #2 + #3) flow via the
    // enriched scope so the JE and the invoice row both reference them.
    const importScope = {
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      seasonId,
      treasuryId: treasuryId ?? null,
      purchaseAccountCode: purchaseAccountCode ?? null,
    };
    // Normalize Arabic-keyed Excel rows to engine fields before the
    // confirm step. Without this confirmVouchersImport would see
    // `row.nuskInvoiceNumber === undefined` and bucket every row as an
    // error — the same bug the preview route hit before normalization.
    const normalizedRows = normalizeImportRows(importRows, "vouchers", columnMapping);
    const result = await confirmVouchersImport(importScope, normalizedRows, fileName ?? "import-vouchers", { allowOverdraft });
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Import vouchers error"); }
});



// Legacy passthrough. Originally called a `doImport` helper that
// inserted rows into umrah_pilgrims with `agentId = NULL` (no
// groupId, no subAgentId) because it never resolved the row's FK
// references — the same root cause the /import/mutamers wizard
// route just got fixed for. The wizard never calls this endpoint
// (it picks /import/mutamers or /import/vouchers); a few legacy
// scripted callers still POST raw rows here, so we keep the URL
// alive but route it through the proper engines too:
//   - fileType "vouchers" → confirmVouchersImport
//   - anything else        → confirmMutamersImport
// `umrah_import_logs` is left untouched for back-compat with the
// legacy dashboard query; the new audit row lands in
// `umrah_import_batches` via the engine.
router.post("/import", authorize({ feature: "umrah", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const body = zodParse(importSchema.safeParse(req.body));
    await requireOpenSeason(body.seasonId, scope.companyId);
    const importScope = {
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      seasonId: body.seasonId,
    };
    const normalizedFileType = String(body.fileType ?? "mutamers").toLowerCase();
    const normalizedRows = normalizeImportRows(
      body.rows,
      normalizedFileType === "vouchers" ? "vouchers" : "mutamers",
    );
    const result = normalizedFileType === "vouchers"
      ? await confirmVouchersImport(importScope, normalizedRows, body.fileName ?? "import")
      : await confirmMutamersImport(importScope, normalizedRows, body.fileName ?? "import");
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.import.completed", entity: "umrah_import_batches",
      entityId: result.batchId ?? 0,
      details: JSON.stringify({ seasonId: body.seasonId, fileType: body.fileType, rowCount: body.rows?.length ?? 0 }),
    }).catch((e) => logger.error(e, "umrah import bg"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Import error"); }
});

router.get("/dashboard", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as Record<string, string | undefined>;
    let seasonFilter = "";
    let seasonFilterP = "";
    const params: unknown[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); seasonFilter = ` AND "seasonId"=$${params.length}`; seasonFilterP = ` AND p."seasonId"=$${params.length}`; }
    const [stats, penaltyStats, agentStats, recentArrivals, salesFinancials, nuskFinancials, visaExpiry] = await Promise.all([
      rawQuery(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status='pending') as pending,
          COUNT(*) FILTER (WHERE status='arrived') as arrived,
          COUNT(*) FILTER (WHERE status='active') as active,
          COUNT(*) FILTER (WHERE status='overstayed') as overstayed,
          COUNT(*) FILTER (WHERE status='departed') as departed,
          COUNT(*) FILTER (WHERE status='violated') as violated,
          COUNT(*) FILTER (WHERE status='cancelled') as cancelled,
          COUNT(*) FILTER (WHERE "agentId" IS NULL) as unassigned
        FROM umrah_pilgrims WHERE "companyId"=$1 AND "deletedAt" IS NULL${seasonFilter}
      `, params),
      rawQuery(`
        SELECT
          COUNT(*) as total,
          COALESCE(SUM(amount),0) as "totalAmount",
          COUNT(*) FILTER (WHERE status='pending') as pending
        FROM umrah_penalties WHERE "companyId"=$1${seasonFilter}
      `, params),
      rawQuery(`
        SELECT a.id, a.name, COUNT(p.id) as "pilgrimCount",
          COUNT(p.id) FILTER (WHERE p.status='overstayed') as "overstayedCount"
        FROM umrah_agents a
        LEFT JOIN umrah_pilgrims p ON p."agentId"=a.id AND p."companyId"=$1 AND p."deletedAt" IS NULL${seasonFilterP}
        WHERE a."companyId"=$1 AND a.status='active' AND a."deletedAt" IS NULL
        GROUP BY a.id, a.name ORDER BY "pilgrimCount" DESC LIMIT 10
      `, params),
      rawQuery(`
        SELECT id,"fullName","passportNumber",nationality,"actualArrival",status
        FROM umrah_pilgrims WHERE "companyId"=$1 AND "deletedAt" IS NULL${seasonFilter} AND "actualArrival" IS NOT NULL
        ORDER BY "actualArrival" DESC LIMIT 10
      `, params),
      // Sales-side financial position: receivables from sub-agents.
      // Outstanding = sum(total − paidAmount) for invoices not cancelled.
      // This gives the operator the umrah-specific "what we are owed" number.
      rawQuery(`
        SELECT
          COUNT(*) FILTER (WHERE status != 'cancelled') AS "invoiceCount",
          COALESCE(SUM(total) FILTER (WHERE status != 'cancelled'), 0) AS "invoicedTotal",
          COALESCE(SUM("paidAmount") FILTER (WHERE status != 'cancelled'), 0) AS "collectedTotal",
          COALESCE(SUM(total - COALESCE("paidAmount", 0)) FILTER (WHERE status NOT IN ('cancelled','paid')), 0) AS "outstandingTotal",
          COALESCE(SUM(total - COALESCE("paidAmount", 0)) FILTER (WHERE status NOT IN ('cancelled','paid') AND "dueDate" < CURRENT_DATE), 0) AS "overdueTotal"
        FROM umrah_sales_invoices
        WHERE "companyId"=$1 AND "deletedAt" IS NULL${seasonFilter}
      `, params),
      // Purchase-side financial position: what we owe NUSK. The legacy
      // /finance/payables route nets against allocations; the dashboard
      // shows the gross numbers as an at-a-glance KPI so the operator
      // knows the topline without leaving the page.
      rawQuery(`
        SELECT
          COUNT(*) FILTER (WHERE "nuskStatus" != 'cancelled') AS "invoiceCount",
          COALESCE(SUM("totalAmount") FILTER (WHERE "nuskStatus" != 'cancelled'), 0) AS "totalAmount",
          COALESCE(SUM("refundAmount") FILTER (WHERE "nuskStatus" != 'cancelled'), 0) AS "refundedTotal",
          COALESCE(SUM("totalAmount" - COALESCE("refundAmount", 0)) FILTER (WHERE "nuskStatus" NOT IN ('cancelled','paid','refunded')), 0) AS "outstandingTotal"
        FROM umrah_nusk_invoices
        WHERE "companyId"=$1 AND "deletedAt" IS NULL
      `, [scope.companyId]),
      // Visa expiry alerts — Saudi compliance: pilgrims still inside KSA
      // whose visa expires within the next 30 days. The buckets let the
      // UI render a "critical / warning / soon" traffic light.
      // Filters on pilgrim status to skip departed/cancelled rows that
      // don't need action.
      rawQuery(`
        SELECT
          COUNT(*) FILTER (WHERE "visaExpiry" < CURRENT_DATE) AS "expired",
          COUNT(*) FILTER (WHERE "visaExpiry" >= CURRENT_DATE AND "visaExpiry" < CURRENT_DATE + INTERVAL '7 days') AS "critical",
          COUNT(*) FILTER (WHERE "visaExpiry" >= CURRENT_DATE + INTERVAL '7 days' AND "visaExpiry" < CURRENT_DATE + INTERVAL '30 days') AS "warning"
        FROM umrah_pilgrims
        WHERE "companyId"=$1 AND "deletedAt" IS NULL${seasonFilter}
          AND "visaExpiry" IS NOT NULL
          AND status NOT IN ('departed','cancelled','deceased','visa_rejected')
      `, params),
    ]);
    const sales = (salesFinancials[0] || {}) as Record<string, unknown>;
    const nusk = (nuskFinancials[0] || {}) as Record<string, unknown>;
    const receivable = Number(sales.outstandingTotal ?? 0);
    const payable = Number(nusk.outstandingTotal ?? 0);
    res.json(maskFields(req, {
      pilgrims: stats[0],
      penalties: penaltyStats[0],
      topAgents: agentStats,
      recentArrivals: recentArrivals.map(decryptPilgrimRow),
      // Financial position at a glance. `net` = receivable − payable;
      // positive means the umrah module is net-owed; negative means net-owes.
      financials: {
        sales: salesFinancials[0],
        nusk: nuskFinancials[0],
        net: receivable - payable,
      },
      // Visa-expiry compliance buckets: expired / critical (<7d) /
      // warning (7-30d). UI renders a traffic-light card; cron C31
      // already handles per-pilgrim notifications — this is the
      // operator's at-a-glance summary.
      visaExpiry: visaExpiry[0],
    }));
  } catch (err) { handleRouteError(err, res, "Dashboard error"); }
});

router.post("/run-daily-status", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const today = todayISO();

    const [pendingToArrived, toOverstayed, toDeparted] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT id FROM umrah_pilgrims WHERE "companyId"=$1 AND status='pending' AND "arrivalDate" <= $2 AND ("departureDate" IS NULL OR "departureDate" >= $2) AND "deletedAt" IS NULL`,
        [scope.companyId, today]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT id, status FROM umrah_pilgrims WHERE "companyId"=$1 AND status IN ('arrived','active') AND "departureDate" < $2 AND "actualDeparture" IS NULL AND "deletedAt" IS NULL`,
        [scope.companyId, today]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT id, status FROM umrah_pilgrims WHERE "companyId"=$1 AND status IN ('arrived','active') AND "actualDeparture" IS NOT NULL AND "actualDeparture" <= $2 AND "deletedAt" IS NULL`,
        [scope.companyId, today]
      ),
    ]);

    let arrivedUpdated = 0, overstayedUpdated = 0, departedUpdated = 0;

    for (const p of pendingToArrived) {
      try {
        await applyTransition({
          entity: "umrah_pilgrims", id: p.id as number, scope,
          action: "umrah.pilgrim.arrived",
          fromStates: ["pending"], toState: "arrived",
          setExtras: { actualArrival: today },
          extraWhere: `"deletedAt" IS NULL`,
        });
        arrivedUpdated++;
      } catch (e) { logger.warn(e, "umrah pilgrim arrival state already changed"); }
    }
    for (const p of toOverstayed) {
      try {
        await applyTransition({
          entity: "umrah_pilgrims", id: p.id as number, scope,
          action: "umrah.pilgrim.overstayed",
          fromStates: ["arrived", "active"], toState: "overstayed",
          extraWhere: `"deletedAt" IS NULL`,
        });
        overstayedUpdated++;
      } catch (e) { logger.warn(e, "umrah pilgrim overstayed state already changed"); }
    }
    for (const p of toDeparted) {
      try {
        await applyTransition({
          entity: "umrah_pilgrims", id: p.id as number, scope,
          action: "umrah.pilgrim.departed",
          fromStates: ["arrived", "active"], toState: "departed",
          extraWhere: `"deletedAt" IS NULL`,
        });
        departedUpdated++;
      } catch (e) { logger.warn(e, "umrah pilgrim departed state already changed"); }
    }

    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.daily_status.run", entity: "umrah_pilgrims", entityId: 0, details: JSON.stringify({ date: today, arrivedUpdated, overstayedUpdated, departedUpdated }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ date: today, arrivedUpdated, overstayedUpdated, departedUpdated });
  } catch (err) { handleRouteError(err, res, "Daily status error"); }
});

router.post("/run-penalty-engine", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { overstayDays = 3, dailyRate = 500 } = zodParse(runPenaltyEngineSchema.safeParse(req.body));
    const { generateOverstayPenalties } = await import("../lib/umrahPenaltyEngine.js");
    const result = await generateOverstayPenalties(
      { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      { overstayDays, dailyRate },
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "umrah_penalties", entityId: 0,
      after: {
        checked: result.checked,
        penaltiesCreated: result.penaltiesCreated,
        violationsLinked: result.violationsLinked,
        skippedExempt: result.skippedExempt,
      },
    }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.penalty_engine.run", entity: "umrah_penalties", entityId: 0,
      details: JSON.stringify(result),
    }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Penalty engine error"); }
});

router.get("/penalties", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, status } = req.query as Record<string, string | undefined>;
    let where = `pen."companyId"=$1`;
    const params: unknown[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND pen."seasonId"=$${params.length}`; }
    if (status) { params.push(status); where += ` AND pen.status=$${params.length}`; }
    // Tenant-scoped JOINs — without companyId guards a stale FK could
    // surface a pilgrim / agent name from another tenant. Same pattern
    // landed on /groups/:id (#1485) and /packages/:id (#1496).
    const rows = await rawQuery(
      `SELECT pen.*, p."fullName" as "pilgrimName", p."passportNumber", a.name as "agentName"
         FROM umrah_penalties pen
    LEFT JOIN umrah_pilgrims p
           ON pen."pilgrimId" = p.id
          AND p."companyId"   = pen."companyId"
          AND p."deletedAt"   IS NULL
    LEFT JOIN umrah_agents a
           ON pen."agentId"   = a.id
          AND a."companyId"   = pen."companyId"
          AND a."deletedAt"   IS NULL
        WHERE ${where}
        ORDER BY pen."createdAt" DESC
        LIMIT 500`, params
    );
    res.json(maskFields(req, { data: rows.map(decryptPilgrimRow) }));
  } catch (err) { handleRouteError(err, res, "List penalties error"); }
});

router.get("/penalties/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Tenant-scoped JOINs — same defence-in-depth pattern as the list.
    // Now enriched with season title + created-by name + journal entry
    // ref + invoice ref so the operator can see the full audit trail
    // without opening four separate pages.
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT pen.*,
              p."fullName" AS "pilgrimName",
              p."passportNumber",
              a.name        AS "agentName",
              s.title       AS "seasonTitle",
              COALESCE(emp_c.name, uc.email) AS "createdByName",
              COALESCE(emp_u.name, uu.email) AS "updatedByName",
              je."ref"      AS "journalEntryRef",
              inv.ref       AS "invoiceRef"
         FROM umrah_penalties pen
    LEFT JOIN umrah_pilgrims p
           ON pen."pilgrimId" = p.id
          AND p."companyId"   = pen."companyId"
          AND p."deletedAt"   IS NULL
    LEFT JOIN umrah_agents a
           ON pen."agentId"   = a.id
          AND a."companyId"   = pen."companyId"
          AND a."deletedAt"   IS NULL
    LEFT JOIN umrah_seasons s
           ON pen."seasonId"  = s.id
          AND s."companyId"   = pen."companyId"
          AND s."deletedAt"   IS NULL
    LEFT JOIN users uc
           ON uc.id = pen."createdBy"
    LEFT JOIN employees emp_c
           ON emp_c.id = uc."employeeId"
    LEFT JOIN users uu
           ON uu.id = pen."updatedBy"
    LEFT JOIN employees emp_u
           ON emp_u.id = uu."employeeId"
    LEFT JOIN journal_entries je
           ON je.id = pen."journalEntryId"
          AND je."companyId" = pen."companyId"
          AND je."deletedAt" IS NULL
    LEFT JOIN umrah_agent_invoices inv
           ON inv.id = pen."invoiceId"
          AND inv."companyId" = pen."companyId"
          AND inv."deletedAt" IS NULL
        WHERE pen.id = $1 AND pen."companyId" = $2`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("العقوبة غير موجودة");
    res.json(maskFields(req, decryptPilgrimRow(row)));
  } catch (err) { handleRouteError(err, res, "Penalty detail error"); }
});

router.patch("/penalties/:id/waive", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { reason } = zodParse(waivePenaltySchema.safeParse(req.body));
    const [penalty] = await rawQuery<Record<string, unknown>>(`SELECT pen.*, p."fullName" as "pilgrimName" FROM umrah_penalties pen LEFT JOIN umrah_pilgrims p ON pen."pilgrimId"=p.id WHERE pen.id=$1 AND pen."companyId"=$2`, [id, scope.companyId]);
    if (!penalty) throw new NotFoundError("العقوبة غير موجودة");
    await applyTransition({
      entity: "umrah_penalties",
      id,
      scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
      action: "umrah.penalty.waived",
      fromStates: ["pending", "invoiced"],
      toState: "waived",
      reason,
      setExtras: { waivedBy: scope.userId, waivedAt: { raw: "NOW()" } },
      skipUpdatedAt: true,
    });
    if (Number(penalty.amount) > 0) {
      try {
        const { umrahEngine } = await import("../lib/engines/index.js");
        await umrahEngine.postPenaltyWaiverGL(
          { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
          {
            id, amount: Number(penalty.amount),
            pilgrimName: (penalty.pilgrimName as string | null) || "",
            agentId: penalty.agentId ? Number(penalty.agentId) : undefined,
            seasonId: penalty.seasonId ? Number(penalty.seasonId) : undefined,
          }
        );
      } catch (e) { logger.error(e, "umrah penalty waiver GL posting failed (non-blocking)"); }
    }
    const [row] = await rawQuery(`SELECT * FROM umrah_penalties WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    res.json(row);
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Waive penalty error");
  }
});

// Bulk waive — same lifecycle transition + GL posting as the single
// endpoint, but applied to N penalties under one reason. Failures on
// individual rows don't roll back the whole batch: each is wrapped so
// successCount / skipped[] / errors[] are reported back to the caller.
// (Closes #6 from the umrah internal review.)
router.post("/penalties/waive-bulk", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const body = zodParse(bulkWaivePenaltiesSchema.safeParse(req.body));

    const successIds: number[] = [];
    const skipped: { id: number; reason: string }[] = [];
    const errors: { id: number; error: string }[] = [];
    let totalAmount = 0;

    for (const id of body.penaltyIds) {
      try {
        const [penalty] = await rawQuery<Record<string, unknown>>(
          `SELECT pen.*, p."fullName" as "pilgrimName"
             FROM umrah_penalties pen
        LEFT JOIN umrah_pilgrims p ON pen."pilgrimId" = p.id
            WHERE pen.id = $1 AND pen."companyId" = $2`,
          [id, scope.companyId]
        );
        if (!penalty) { skipped.push({ id, reason: "not_found" }); continue; }
        if (penalty.status === "waived") { skipped.push({ id, reason: "already_waived" }); continue; }
        if (penalty.status === "paid")   { skipped.push({ id, reason: "already_paid" });   continue; }

        await applyTransition({
          entity: "umrah_penalties",
          id,
          scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
          action: "umrah.penalty.waived",
          fromStates: ["pending", "invoiced"],
          toState: "waived",
          reason: `${body.reason} (bulk)`,
          setExtras: { waivedBy: scope.userId, waivedAt: { raw: "NOW()" } },
          skipUpdatedAt: true,
        });

        if (Number(penalty.amount) > 0) {
          try {
            const { umrahEngine } = await import("../lib/engines/index.js");
            await umrahEngine.postPenaltyWaiverGL(
              { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
              {
            id, amount: Number(penalty.amount),
            pilgrimName: (penalty.pilgrimName as string | null) || "",
            agentId: penalty.agentId ? Number(penalty.agentId) : undefined,
            seasonId: penalty.seasonId ? Number(penalty.seasonId) : undefined,
          }
            );
            totalAmount += Number(penalty.amount);
          } catch (e) {
            logger.error(e, `bulk waive GL post failed for penalty ${id} (non-blocking)`);
          }
        }
        successIds.push(id);
      } catch (rowErr: any) {
        const lcErr = lifecycleErrorResponse(rowErr);
        errors.push({ id, error: lcErr ? lcErr.body.message : String(rowErr?.message ?? rowErr) });
      }
    }

    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.penalty.waived_bulk", entity: "umrah_penalties", entityId: 0,
      after: { successCount: successIds.length, totalAmount, reason: body.reason, skipped: skipped.length, errors: errors.length },
      details: JSON.stringify({ successCount: successIds.length, totalAmount, reason: body.reason, skipped: skipped.length, errors: errors.length }),
    }).catch((e) => logger.error(e, "bulk waive bg"));

    res.json({
      successCount: successIds.length,
      successIds,
      totalWaivedAmount: totalAmount,
      skipped,
      errors,
    });
  } catch (err) { handleRouteError(err, res, "Bulk waive penalties"); }
});

router.post("/agent-invoices/:id/record-payment", authorize({ feature: "umrah", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { amount, paymentMethod, reference } = zodParse(recordPaymentSchema.safeParse(req.body));
    const [invoice] = await rawQuery<Record<string, unknown>>(`SELECT * FROM umrah_agent_invoices WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");
    const paidSoFar = Number(invoice.paidAmount || 0) + Number(amount);
    if (paidSoFar > Number(invoice.total) * 1.001) {
      throw new ValidationError(`المبلغ المدفوع (${paidSoFar}) يتجاوز إجمالي الفاتورة (${invoice.total})`);
    }
    const newStatus = paidSoFar >= Number(invoice.total) ? "paid" : "partially_paid";
    await applyTransition({
      entity: "umrah_agent_invoices",
      id,
      scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
      action: `umrah.agent_invoice.${newStatus}`,
      fromStates: ["sent", "partially_paid", "overdue"],
      toState: newStatus,
      setExtras: { paidAmount: paidSoFar },
      after: { paymentAmount: Number(amount), paymentMethod, reference, paidSoFar },
    });
    const [row] = await rawQuery(`SELECT * FROM umrah_agent_invoices WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    res.json(row);
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Record payment error");
  }
});

router.post("/agent-invoices/generate", authorize({ feature: "umrah", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { agentId, seasonId } = zodParse(generateInvoiceSchema.safeParse(req.body));

    // Idempotency: return existing invoice if one already exists for this agent+season
    const [existingInvoice] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM umrah_agent_invoices WHERE "agentId"=$1 AND "seasonId"=$2 AND "companyId"=$3 AND status <> 'cancelled'`,
      [agentId, seasonId, scope.companyId]
    );
    if (existingInvoice) {
      res.status(200).json(existingInvoice);
      return;
    }

    const pilgrims = await rawQuery(
      `SELECT COUNT(*) as c FROM umrah_pilgrims WHERE "agentId"=$1 AND "seasonId"=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [agentId, seasonId, scope.companyId]
    );
    const pilgrimCount = Number(pilgrims[0]?.c || 0);
    if (pilgrimCount === 0) { throw new ValidationError("لا يوجد معتمرين لهذا الوكيل في هذا الموسم"); }
    const [agent] = await rawQuery(`SELECT * FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [agentId, scope.companyId]);
    if (!agent) { throw new NotFoundError("الوكيل غير موجود"); }
    const penalties = await rawQuery(
      `SELECT COALESCE(SUM(amount),0) as total FROM umrah_penalties WHERE "agentId"=$1 AND "seasonId"=$2 AND "companyId"=$3 AND "deletedAt" IS NULL AND status='pending'`,
      [agentId, seasonId, scope.companyId]
    );
    const penaltiesTotal = Number(penalties[0]?.total || 0);
    const pkgCosts = await rawQuery(
      `SELECT COALESCE(SUM(pkg."sellPrice"),0) as "servicesTotal"
       FROM umrah_pilgrims p
       JOIN umrah_packages pkg ON p."packageId"=pkg.id
       WHERE p."agentId"=$1 AND p."seasonId"=$2 AND p."companyId"=$3 AND p."deletedAt" IS NULL`,
      [agentId, seasonId, scope.companyId]
    );
    const servicesTotal = Number(pkgCosts[0]?.servicesTotal || 0);
    const subtotal = servicesTotal + penaltiesTotal;
    const commission = subtotal * (Number(agent?.profitMargin || 0) / 100);
    const total = subtotal - commission;
    // Numbering center (Issue #1141) — umrah agent invoice ref from
    // central authority. Scheme `umrah.umrah_agent_invoice` is scoped
    // by season + branch, so the seasonId param is mandatory.
    const issuedInv = await issueNumber({
      companyId: scope.companyId,
      branchId: scope.branchId ?? null,
      moduleKey: "umrah",
      entityKey: "umrah_agent_invoice",
      entityTable: "umrah_agent_invoices",
      seasonId,
      actorId: scope.userId,
      metadata: { agentId },
      expectedTiming: "on_draft",
    });
    const ref = issuedInv.number;
    let invoiceRow: any;
    await withTransaction(async (client) => {
      // C1: generated directly as 'sent'. The umrah_agent_invoices state
      // machine (lifecycleEngine) has no 'draft' state and no draft->sent
      // endpoint exists, so a 'draft' invoice could never reach
      // record-payment (fromStates: sent/partially_paid/overdue).
      const insRes = await client.query(
        `INSERT INTO umrah_agent_invoices ("companyId","agentId","seasonId",ref,type,"pilgrimCount","penaltiesTotal","servicesTotal",subtotal,commission,total,status)
         VALUES ($1,$2,$3,$4,'sales',$5,$6,$7,$8,$9,$10,'sent') RETURNING *`,
        [scope.companyId, agentId, seasonId, ref, pilgrimCount, penaltiesTotal, servicesTotal, subtotal, commission, total]
      );
      invoiceRow = insRes.rows[0];
      await client.query(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [invoiceRow.id, issuedInv.assignmentId]
      );
      if (penaltiesTotal > 0) {
        // The SUM that produced `penaltiesTotal` (line 1382) excludes
        // soft-deleted penalties. This UPDATE must match the same set,
        // otherwise a soft-deleted pending penalty would get stamped
        // `status='invoiced'` and `invoiceId=...` even though its
        // amount was never billed — leaving a phantom row that claims
        // to be on the invoice and breaks any later audit reconciliation.
        await client.query(
          `UPDATE umrah_penalties SET status='invoiced', "invoiceId"=$1
            WHERE "agentId"=$2 AND "seasonId"=$3 AND "companyId"=$4
              AND status='pending' AND "deletedAt" IS NULL`,
          [invoiceRow.id, agentId, seasonId, scope.companyId]
        );
      }
    });
    const rows = [invoiceRow];

    let glJournalId: number | null = null;
    try {
      const { umrahEngine } = await import("../lib/engines/index.js");
      // postAgentInvoiceGL returns GLPostingResult ({journalId, sourceKey,
      // alreadyExists}), NOT a raw number — extract .journalId. The prior
      // version passed the whole object to SQL and serialised it as JSON
      // into the "journalEntryId" integer column, which silently failed
      // (or stored garbage) on every successful GL post.
      const glResult = await umrahEngine.postAgentInvoiceGL(
        { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
        { id: rows[0].id, ref, agentName: agent.name, agentId, total, servicesTotal, penaltiesTotal, commission }
      );
      glJournalId = glResult.journalId;

      await rawExecute(
        `UPDATE umrah_agent_invoices SET "journalEntryId"=$1 WHERE id=$2 AND "companyId"=$3`,
        [glJournalId, rows[0].id, scope.companyId]
      ).catch((e) => logger.error(e, "umrah background task failed"));

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "umrah.invoice.gl_posted",
        entity: "umrah_agent_invoices",
        entityId: rows[0].id,
        details: JSON.stringify({ journalId: glJournalId, total, servicesTotal, penaltiesTotal, commission }),
      }).catch((e) => logger.error(e, "umrah background task failed"));
    } catch (glErr) {
      logger.error({ err: glErr, invoiceId: rows[0].id }, "[umrah] GL posting failed for agent invoice");
    }

    // M9 fix: always emit umrah.agent_invoice.created, regardless of GL
    // outcome above. The recovery listener at eventListeners.ts uses this
    // event to detect invoices with missing journalEntryId and re-post.
    // Without this, a GL failure leaves the invoice orphaned (no JE,
    // no signal, no reconciliation path).
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "umrah.agent_invoice.created",
      entity: "umrah_agent_invoices",
      entityId: rows[0].id,
      details: JSON.stringify({
        invoiceId: rows[0].id,
        ref,
        agentId,
        agentName: agent.name,
        total, servicesTotal, penaltiesTotal, commission,
        journalEntryId: glJournalId,
      }),
    }).catch((e) => logger.error(e, "umrah background task failed"));

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_agent_invoices", entityId: rows[0]?.id, after: { agentId, seasonId, total } }).catch((e) => logger.error(e, "umrah background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Generate invoice error"); }
});

router.get("/agent-invoices", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { agentId, seasonId } = req.query as Record<string, string | undefined>;
    let where = `i."companyId"=$1`;
    const params: unknown[] = [scope.companyId];
    if (agentId) { params.push(agentId); where += ` AND i."agentId"=$${params.length}`; }
    if (seasonId) { params.push(seasonId); where += ` AND i."seasonId"=$${params.length}`; }
    const rows = await rawQuery(
      `SELECT i.*, a.name as "agentName", s.title as "seasonTitle"
       FROM umrah_agent_invoices i
       LEFT JOIN umrah_agents a ON i."agentId"=a.id
       LEFT JOIN umrah_seasons s ON i."seasonId"=s.id AND s."deletedAt" IS NULL
       WHERE ${where} AND i."deletedAt" IS NULL ORDER BY i."createdAt" DESC LIMIT 500`, params
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List agent invoices error"); }
});

router.get("/agent-invoices/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT i.*, a.name as "agentName", s.title as "seasonTitle"
       FROM umrah_agent_invoices i
       LEFT JOIN umrah_agents a ON i."agentId"=a.id
       LEFT JOIN umrah_seasons s ON i."seasonId"=s.id AND s."deletedAt" IS NULL
       WHERE i.id=$1 AND i."companyId"=$2 AND i."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الفاتورة غير موجودة");
    const penalties = await rawQuery(
      `SELECT * FROM umrah_penalties WHERE "invoiceId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500`,
      [id, scope.companyId]
    );
    res.json(maskFields(req, { ...row, penalties }));
  } catch (err) { handleRouteError(err, res, "Get invoice error"); }
});

// ─── UMRAH TRANSPORT — Internal Service ─────────────────────────────────
// umrah_transport is a SERVICE CONSUMER of fleet (fleet_vehicles, fleet_drivers).
// It does NOT duplicate fleet management; it records transport assignments
// specific to umrah pilgrim groups. Vehicle/driver validation is delegated
// to fleet tables. Events emitted: umrah.transport.created/status_changed/deleted.
router.get("/transport", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT t.*, v."plateNumber" as "vehiclePlate", d.name as "driverName"
       FROM umrah_transport t
       LEFT JOIN fleet_vehicles v ON v.id = t."vehicleId"
       LEFT JOIN fleet_drivers d ON d.id = t."driverId"
       WHERE t."companyId"=$1 AND t."deletedAt" IS NULL ORDER BY t."tripDate" DESC LIMIT 500`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List transport error"); }
});

router.get("/transport/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Defence in depth on the cross-domain JOINs — fleet_vehicles /
    // fleet_drivers are shared tables; a stale FK from another tenant
    // (or a soft-deleted vehicle/driver) was previously surfacing here.
    // Season JOIN added too so the page can show the season name.
    const [row] = await rawQuery(
      `SELECT t.*,
              v."plateNumber" AS "vehiclePlate",
              v.make          AS "vehicleMake",
              v.model         AS "vehicleModel",
              d.name          AS "driverName",
              d.phone         AS "driverPhone",
              s.title         AS "seasonTitle"
         FROM umrah_transport t
    LEFT JOIN fleet_vehicles v
           ON v.id = t."vehicleId"
          AND v."companyId" = t."companyId"
          AND v."deletedAt" IS NULL
    LEFT JOIN fleet_drivers d
           ON d.id = t."driverId"
          AND d."companyId" = t."companyId"
          AND d."deletedAt" IS NULL
    LEFT JOIN umrah_seasons s
           ON s.id = t."seasonId"
          AND s."companyId" = t."companyId"
          AND s."deletedAt" IS NULL
        WHERE t.id = $1 AND t."companyId" = $2 AND t."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("رحلة النقل غير موجودة");
    // C4 (DT-3): the trip's pilgrims come from the join table — not from
    // every company pilgrim that happens to carry the transportAssigned
    // flag. p."companyId" guard added (defence in depth — the join
    // table is already tenant-scoped but a stale row could still slip
    // through if cleanup ever lags).
    const pilgrims = await rawQuery<Record<string, unknown>>(
      `SELECT p.id, p."fullName", p."passportNumber", p.nationality, p.status
         FROM umrah_transport_pilgrims tp
         JOIN umrah_pilgrims p
           ON p.id = tp."pilgrimId"
          AND p."companyId" = tp."companyId"
          AND p."deletedAt" IS NULL
        WHERE tp."transportId" = $1 AND tp."companyId" = $2
        ORDER BY p."fullName"`,
      [id, scope.companyId]
    );

    // Aggregate: status mix for the trip's pilgrims + utilisation % so
    // the operator sees at a glance "how full is this bus?".
    const statusBreakdown: Record<string, number> = {};
    for (const p of pilgrims) {
      const st = String(p.status ?? "unknown");
      statusBreakdown[st] = (statusBreakdown[st] ?? 0) + 1;
    }
    const cap = Number((row as Record<string, unknown>).capacity ?? 0);
    const seats = pilgrims.length;
    const utilisation = cap > 0 ? Math.round((seats / cap) * 100) : 0;

    res.json(maskFields(req, {
      ...(row as Record<string, unknown>),
      pilgrims,
      statusBreakdown,
      seatsBooked: seats,
      utilisationPct: utilisation,
    }));
  } catch (err) { handleRouteError(err, res, "Get transport error"); }
});

router.delete("/transport/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(`SELECT id, status FROM umrah_transport WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("رحلة النقل غير موجودة");
    if (existing.status === "in_progress") {
      throw new ConflictError("لا يمكن حذف رحلة قيد التنفيذ");
    }
    await rawExecute(`UPDATE umrah_transport SET "deletedAt"=NOW(), "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND status != 'in_progress'`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_transport", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.transport.deleted", entity: "umrah_transport", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete transport error"); }
});

router.post("/transport", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (await isLegacyTransportWritesDisabled(scope.companyId)) {
      res.status(410).json({
        error: "المسار القديم لإنشاء النقل معطّل لهذه الشركة",
        hint: "استخدم العقد الموحّد: POST /umrah/groups/:id/transport-requests",
      });
      return;
    }
    const b = zodParse(createTransportSchema.safeParse(req.body));
    if (b.seasonId) await requireOpenSeason(Number(b.seasonId), scope.companyId);
    if (b.vehicleId) {
      const [vehicle] = await rawQuery<Record<string, unknown>>(
        `SELECT id, status FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.vehicleId, scope.companyId]
      );
      if (!vehicle) throw new ValidationError("المركبة غير موجودة في الأسطول");
      if (vehicle.status === "maintenance") throw new ConflictError("المركبة قيد الصيانة ولا يمكن تخصيصها");
    }
    if (b.driverId) {
      const [driver] = await rawQuery<Record<string, unknown>>(
        `SELECT id, status, "licenseExpiry" FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.driverId, scope.companyId]
      );
      if (!driver) throw new ValidationError("السائق غير موجود في الأسطول");
      if (driver.status === "inactive") throw new ConflictError("السائق غير نشط ولا يمكن تخصيصه");
      if (driver.licenseExpiry && new Date(driver.licenseExpiry as string | Date) < new Date(b.tripDate)) {
        throw new ConflictError("رخصة السائق منتهية الصلاحية في تاريخ الرحلة");
      }
    }
    if (b.pilgrimCount && b.capacity && b.pilgrimCount > b.capacity) {
      throw new ValidationError(`عدد المعتمرين (${b.pilgrimCount}) يتجاوز سعة المركبة (${b.capacity})`);
    }
    const rows = await rawQuery(
      `INSERT INTO umrah_transport ("companyId","seasonId","tripDate","fromLocation","toLocation","vehicleId","driverId",capacity,"pilgrimCount",cost,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [scope.companyId, b.seasonId, b.tripDate, b.fromLocation, b.toLocation, b.vehicleId, b.driverId, b.capacity || 45, b.pilgrimCount || 0, b.cost || 0, b.notes]
    );

    const tripCost = Number(b.cost || 0);
    if (tripCost > 0) {
      try {
        // Resolve the season's branch so the transport expense lands on
        // the right branch instead of the operator's working branch.
        const [season] = await rawQuery<{ branchId?: number | null }>(
          `SELECT "branchId" FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
          [b.seasonId, scope.companyId]
        ).catch(() => [] as { branchId?: number | null }[]);
        const transportBranchId = season?.branchId ?? scope.branchId ?? 0;
        const { umrahEngine } = await import("../lib/engines/index.js");
        await umrahEngine.postTransportExpenseGL(
          { companyId: scope.companyId, branchId: transportBranchId, createdBy: scope.userId },
          { id: rows[0].id, cost: tripCost, fromLocation: b.fromLocation, toLocation: b.toLocation, vehicleId: b.vehicleId || undefined, driverId: b.driverId || undefined, umrahSeasonId: b.seasonId || null }
        );
      } catch (glErr) {
        logger.error(glErr, "Transport GL posting failed:");
      }
    }

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_transport", entityId: rows[0]?.id, after: { fromLocation: b.fromLocation, toLocation: b.toLocation } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.transport.created", entity: "umrah_transport", entityId: rows[0]?.id, details: JSON.stringify({ fromLocation: b.fromLocation, toLocation: b.toLocation, cost: b.cost }) }).catch((e) => logger.error(e, "umrah background task failed"));
    // §10 of #1870 — canonical "transport requested" event for the
    // Service Contract pattern between Umrah and Fleet (§7). Umrah
    // is the consumer here; Fleet listens to fulfil the request.
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.transport.requested", entity: "umrah_transport", entityId: rows[0]?.id, after: { fromLocation: b.fromLocation, toLocation: b.toLocation, cost: b.cost } }).catch((e) => logger.error(e, "umrah background task failed"));

    // Mirror the WhatsApp dispatch path that fleet trip-create uses
    // (#1354 — driver_assigned). umrah_transport is a parallel trip
    // surface that historically left drivers in the dark — they could
    // only know about an umrah trip if they happened to log into the
    // ERP. Drivers on this surface usually don't have ERP accounts at
    // all, so WhatsApp is the only realistic channel.
    if (b.driverId) {
      try {
        const [driverInfo] = await rawQuery<{ phone: string | null; name: string | null }>(
          `SELECT phone, name FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
          [b.driverId, scope.companyId]
        );
        if (driverInfo?.phone) {
          await sendMessage({
            channel: "whatsapp",
            recipient: driverInfo.phone,
            recipientName: driverInfo.name,
            body: `رحلة عمرة جديدة مسندة إليك:\nمن ${b.fromLocation || 'غير محدد'} إلى ${b.toLocation || 'غير محدد'}\nالتاريخ: ${b.tripDate}\nعدد المعتمرين: ${b.pilgrimCount || 0}\nالرجاء الاطلاع على تفاصيل الرحلة في النظام.`,
            companyId: scope.companyId,
            userId: scope.userId,
            relatedType: "umrah_transport",
            relatedId: rows[0].id,
            templateKey: "umrah.transport.driver_assigned",
            eventAction: "umrah.transport.driver_notified",
          });
        }
      } catch (sendErr) {
        logger.error({ err: sendErr, transportId: rows[0].id, driverId: b.driverId }, "[umrah] transport driver WhatsApp dispatch failed");
      }
    }

    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create transport error"); }
});

router.patch("/transport/:id", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    if (await isLegacyTransportWritesDisabled(scope.companyId)) {
      res.status(410).json({
        error: "المسار القديم لتعديل النقل معطّل لهذه الشركة",
        hint: "استخدم العقد الموحّد: POST /umrah/groups/:id/transport-requests",
      });
      return;
    }
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchTransportSchema.safeParse(req.body));
    if (b.vehicleId) {
      const [vehicle] = await rawQuery<Record<string, unknown>>(`SELECT id, status FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [b.vehicleId, scope.companyId]);
      if (!vehicle) throw new ValidationError("المركبة غير موجودة في الأسطول");
      if (vehicle.status === "maintenance") throw new ConflictError("المركبة قيد الصيانة");
    }
    if (b.driverId) {
      const [driver] = await rawQuery<Record<string, unknown>>(`SELECT id, status, "licenseExpiry" FROM fleet_drivers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [b.driverId, scope.companyId]);
      if (!driver) throw new ValidationError("السائق غير موجود في الأسطول");
      if (driver.status === "inactive") throw new ConflictError("السائق غير نشط");
    }

    if (b.status !== undefined) {
      const fieldKeys = ["seasonId","tripDate","fromLocation","toLocation","vehicleId","driverId","capacity","pilgrimCount","cost","notes"] as const;
      const setExtras: Record<string, any> = {};
      for (const key of fieldKeys) { if (b[key] !== undefined) setExtras[key] = b[key]; }
      const fromStates = Object.entries(TRANSPORT_TRANSITIONS)
        .filter(([, targets]) => targets.includes(b.status!))
        .map(([from]) => from);

      const row = await applyTransition({
        entity: "umrah_transport",
        id,
        scope,
        action: "umrah.transport.status_changed",
        fromStates,
        toState: b.status!,
        setExtras: Object.keys(setExtras).length > 0 ? setExtras : undefined,
        skipUpdatedAt: true,
      });
      res.json(row);
    } else {
      const params: unknown[] = [];
      const sets: string[] = [];
      for (const key of ["seasonId","tripDate","fromLocation","toLocation","vehicleId","driverId","capacity","pilgrimCount","cost","notes"] as const) {
        if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
      }
      if (sets.length === 0) {
        const [row] = await rawQuery(`SELECT * FROM umrah_transport WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
        if (!row) throw new NotFoundError("رحلة النقل غير موجودة");
        res.json(row); return;
      }
      params.push(id); params.push(scope.companyId);
      const { affectedRows } = await rawExecute(`UPDATE umrah_transport SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
      if (!affectedRows) throw new NotFoundError("السجل غير موجود");
      const [row] = await rawQuery(`SELECT * FROM umrah_transport WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
      if (!row) throw new NotFoundError("رحلة النقل غير موجودة");
      createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_transport", entityId: id, after: b }).catch((e) => logger.error(e, "umrah background task failed"));
      emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.transport.updated", entity: "umrah_transport", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah background task failed"));
      res.json(row);
    }
  } catch (err) {
    const lr = lifecycleErrorResponse(err);
    if (lr) { res.status(lr.status).json(lr.body); return; }
    handleRouteError(err, res, "Update transport error");
  }
});

router.post("/transport/:id/assign-pilgrims", authorize({ feature: "umrah", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const transportId = parseId(req.params.id, "id");
    const { pilgrimIds } = zodParse(assignPilgrimsSchema.safeParse(req.body));
    const [transport] = await rawQuery<Record<string, unknown>>(`SELECT * FROM umrah_transport WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [transportId, scope.companyId]);
    if (!transport) throw new NotFoundError("رحلة النقل غير موجودة");
    if (transport.status === "completed" || transport.status === "cancelled") {
      throw new ConflictError("لا يمكن إضافة معتمرين لرحلة مكتملة أو ملغاة");
    }
    // C4 (DT-3): capacity + count derive from the join table.
    const [linkedRow] = await rawQuery<{ linked: number }>(
      `SELECT COUNT(*)::int AS linked FROM umrah_transport_pilgrims WHERE "transportId"=$1 AND "companyId"=$2`,
      [transportId, scope.companyId]
    );
    const capacity = Number(transport.capacity) || 45;
    if (Number(linkedRow?.linked ?? 0) + pilgrimIds.length > capacity) {
      throw new ValidationError(`عدد المعتمرين قد يتجاوز سعة المركبة (${capacity})`);
    }
    const placeholders = pilgrimIds.map((_: any, i: number) => `$${i + 2}`).join(",");
    let newCount = Number(linkedRow?.linked ?? 0);
    await withTransaction(async (client) => {
      // Idempotent link rows — re-assigning an already-linked pilgrim is a
      // no-op (UNIQUE transportId,pilgrimId), so the count never drifts.
      for (const pid of pilgrimIds) {
        await client.query(
          `INSERT INTO umrah_transport_pilgrims ("companyId","transportId","pilgrimId")
           VALUES ($1,$2,$3) ON CONFLICT ("transportId","pilgrimId") DO NOTHING`,
          [scope.companyId, transportId, pid]
        );
      }
      // Denormalised flag kept for any reader still using it.
      await client.query(
        `UPDATE umrah_pilgrims SET "transportAssigned"=true, "updatedAt"=NOW() WHERE "companyId"=$1 AND "deletedAt" IS NULL AND id IN (${placeholders})`,
        [scope.companyId, ...pilgrimIds]
      );
      // pilgrimCount is now derived from the join — accurate, dedup-safe.
      const cntRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM umrah_transport_pilgrims WHERE "transportId"=$1`,
        [transportId]
      );
      newCount = Number(cntRes.rows[0]?.c ?? 0);
      await client.query(
        `UPDATE umrah_transport SET "pilgrimCount"=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
        [newCount, transportId, scope.companyId]
      );
    });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_transport", entityId: transportId, after: { assignedPilgrims: pilgrimIds.length, totalCount: newCount } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.transport.pilgrims_assigned", entity: "umrah_transport", entityId: transportId, details: JSON.stringify({ pilgrimIds, count: pilgrimIds.length }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ transportId, assignedCount: pilgrimIds.length, totalPilgrimCount: newCount });
  } catch (err) { handleRouteError(err, res, "Assign pilgrims to transport error"); }
});

// ─── Bus manifest: check-in + seat allocation (migration 267) ──────
// The morning-of dispatcher flow: every pilgrim on the assigned list
// gets checked in as they board the bus. Each row's `checkedInAt` +
// `checkedInBy` carries the audit trail. `noShow` flags pilgrims the
// dispatcher waited for and gave up on — used by downstream reports
// to surface "we left behind pilgrim X".

const manifestRowSchema = z.object({
  pilgrimId: z.coerce.number().int().positive(),
  seatNumber: z.string().max(10).nullable().optional(),
  noShow: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

const manifestBulkSchema = z.object({
  rows: z.array(manifestRowSchema).min(1, "أدخل صفًا واحدًا على الأقل"),
});

router.get("/transport/:id/manifest", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const transportId = parseId(req.params.id, "id");
    const [transport] = await rawQuery<{ id: number }>(
      `SELECT id FROM umrah_transport WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [transportId, scope.companyId],
    );
    if (!transport) throw new NotFoundError("رحلة النقل غير موجودة");
    // Join the manifest rows back to the pilgrim record so the
    // dispatcher sees names + phones + NUSK numbers alongside the
    // seat / check-in status. Ordered by seat first then name so the
    // printed sheet matches the bus layout.
    const rows = await rawQuery(
      `SELECT tp.id            AS "manifestRowId",
              tp."pilgrimId",
              p."fullName",
              p."passportNumber",
              p."nuskNumber",
              p.phone,
              tp."seatNumber",
              tp."checkedInAt",
              tp."checkedInBy",
              tp."noShow",
              tp.notes
         FROM umrah_transport_pilgrims tp
    LEFT JOIN umrah_pilgrims p
           ON p.id = tp."pilgrimId"
          AND p."companyId" = tp."companyId"
          AND p."deletedAt" IS NULL
        WHERE tp."transportId" = $1
          AND tp."companyId"   = $2
        ORDER BY tp."seatNumber" NULLS LAST, p."fullName"`,
      [transportId, scope.companyId],
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "Manifest fetch error"); }
});

router.post("/transport/:id/check-in", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const transportId = parseId(req.params.id, "id");
    const b = zodParse(manifestRowSchema.safeParse(req.body));
    // Trip must exist + be active. Completed/cancelled trips can't
    // accept new check-ins — protect against a stale tab pressing
    // the button after the operator already closed the trip.
    const [trip] = await rawQuery<{ status: string }>(
      `SELECT status FROM umrah_transport WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [transportId, scope.companyId],
    );
    if (!trip) throw new NotFoundError("رحلة النقل غير موجودة");
    if (trip.status === "completed" || trip.status === "cancelled") {
      throw new ConflictError("لا يمكن تسجيل ركوب لرحلة مكتملة أو ملغاة");
    }
    // The pilgrim must already be assigned to this trip via the join
    // table — manifest check-in doesn't auto-assign (assign-pilgrims
    // is a separate authorised step).
    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.noShow === true) {
      sets.push(`"noShow" = TRUE`);
      sets.push(`"checkedInAt" = NULL`);
      sets.push(`"checkedInBy" = NULL`);
    } else {
      sets.push(`"noShow" = FALSE`);
      sets.push(`"checkedInAt" = NOW()`);
      params.push(scope.userId);
      sets.push(`"checkedInBy" = $${params.length}`);
    }
    if (b.seatNumber !== undefined) {
      params.push(b.seatNumber);
      sets.push(`"seatNumber" = $${params.length}`);
    }
    if (b.notes !== undefined) {
      params.push(b.notes);
      sets.push(`"notes" = $${params.length}`);
    }
    params.push(transportId, b.pilgrimId, scope.companyId);
    const { affectedRows } = await rawExecute(
      `UPDATE umrah_transport_pilgrims
          SET ${sets.join(", ")}
        WHERE "transportId" = $${params.length - 2}
          AND "pilgrimId"   = $${params.length - 1}
          AND "companyId"   = $${params.length}`,
      params,
    );
    if (!affectedRows) {
      throw new NotFoundError("المعتمر غير مُسند لهذه الرحلة");
    }
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: b.noShow ? "umrah.transport.no_show" : "umrah.transport.checked_in",
      entity: "umrah_transport", entityId: transportId,
      details: JSON.stringify({ pilgrimId: b.pilgrimId, seatNumber: b.seatNumber ?? null }),
    }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Manifest check-in error"); }
});

router.post("/transport/:id/check-in-bulk", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const transportId = parseId(req.params.id, "id");
    const { rows } = zodParse(manifestBulkSchema.safeParse(req.body));
    const [trip] = await rawQuery<{ status: string }>(
      `SELECT status FROM umrah_transport WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [transportId, scope.companyId],
    );
    if (!trip) throw new NotFoundError("رحلة النقل غير موجودة");
    if (trip.status === "completed" || trip.status === "cancelled") {
      throw new ConflictError("لا يمكن تسجيل ركوب لرحلة مكتملة أو ملغاة");
    }
    let updated = 0;
    let skipped = 0;
    await withTransaction(async (client) => {
      for (const row of rows) {
        const sets: string[] = [];
        const params: unknown[] = [];
        if (row.noShow === true) {
          sets.push(`"noShow" = TRUE`);
          sets.push(`"checkedInAt" = NULL`);
          sets.push(`"checkedInBy" = NULL`);
        } else {
          sets.push(`"noShow" = FALSE`);
          sets.push(`"checkedInAt" = NOW()`);
          params.push(scope.userId);
          sets.push(`"checkedInBy" = $${params.length}`);
        }
        if (row.seatNumber !== undefined) {
          params.push(row.seatNumber);
          sets.push(`"seatNumber" = $${params.length}`);
        }
        if (row.notes !== undefined) {
          params.push(row.notes);
          sets.push(`"notes" = $${params.length}`);
        }
        params.push(transportId, row.pilgrimId, scope.companyId);
        const r = await client.query(
          `UPDATE umrah_transport_pilgrims
              SET ${sets.join(", ")}
            WHERE "transportId" = $${params.length - 2}
              AND "pilgrimId"   = $${params.length - 1}
              AND "companyId"   = $${params.length}`,
          params,
        );
        if ((r.rowCount ?? 0) > 0) updated++;
        else skipped++;
      }
    });
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.transport.bulk_check_in", entity: "umrah_transport", entityId: transportId,
      details: JSON.stringify({ updated, skipped, total: rows.length }),
    }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ updated, skipped, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Manifest bulk check-in error"); }
});

// Surface the built-in Arabic-header dictionaries to the wizard so the
// column-mapping step can pre-fill the operator's choices for known
// NUSK / MOFA layouts. The operator only types when their source uses
// a header the server doesn't already recognise.
router.get("/import/header-maps", authorize({ feature: "umrah", action: "create" }), async (_req, res) => {
  try {
    // Invert each map to { dbField → [arabicHeaders] } so the wizard
    // can render a dropdown of recognised targets per column. The flat
    // forward maps are also included for callers that just want the
    // raw lookup table.
    const invertMap = (m: Record<string, string>): Record<string, string[]> => {
      const out: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(m)) {
        if (!out[v]) out[v] = [];
        out[v].push(k);
      }
      return out;
    };
    // labels: { dbField → canonical Arabic label } so the wizard's
    // column-mapping dropdown shows comprehensible Arabic instead of raw
    // English identifiers (nuskInvoiceNumber, mutamerCount, ...).
    // groups: { dbField → groupKey } and groupLabels: { groupKey → Arabic }
    // — surfaces field categories (pilgrim / agent / finance / ...) so the
    // wizard's column-mapping dropdown can render headings instead of a
    // flat 50-item list. §2 of #1870.
    res.json({
      mutamers: {
        forward: MUTAMER_HEADER_MAP,
        targets: invertMap(MUTAMER_HEADER_MAP),
        labels: UMRAH_FIELD_LABELS_AR,
        groups: UMRAH_FIELD_GROUPS,
        groupLabels: UMRAH_FIELD_GROUP_LABELS_AR,
      },
      vouchers: {
        forward: VOUCHER_HEADER_MAP,
        targets: invertMap(VOUCHER_HEADER_MAP),
        labels: UMRAH_FIELD_LABELS_AR,
        groups: UMRAH_FIELD_GROUPS,
        groupLabels: UMRAH_FIELD_GROUP_LABELS_AR,
      },
    });
  } catch (err) { handleRouteError(err, res, "Import header maps error"); }
});

// ── Smart column-mapping suggestion ──────────────────────────────────
// Feeds the wizard's column-mapping step with a fuzzy-matched
// engine-field suggestion per unknown Excel header. Closes the
// "operator pastes a vendor file with a non-standard header — wizard
// asks them to manually pick every column" friction that the hardcoded
// dictionary + saved presets alone don't cover.
//
// The engine ALSO returns exact matches with confidence=1 so the
// wizard can show a "✓ exact" badge — explicit confirmation beats
// silent auto-mapping for the operator's confidence.

const suggestMappingSchema = z.object({
  headers: z.array(z.string()).min(1, "أعمدة الملف مطلوبة"),
  fileType: z.enum(["mutamers", "vouchers"]),
});

router.post("/import/suggest-mapping", authorize({ feature: "umrah", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { headers, fileType } = zodParse(suggestMappingSchema.safeParse(req.body));
    const { suggestColumnMapping } = await import("../lib/umrahImportEngine.js");
    const suggestions = suggestColumnMapping(headers, fileType);
    // Usage telemetry — which headers operators send + how many the
    // matcher catches at each confidence band. Without this, we can't
    // see which incoming Excel variants are escaping the built-in
    // dictionary (signal for adding them to the dictionary). Mirrors
    // the assistant.ask pattern (#1625): event broadcasts only counts,
    // audit log carries the raw headers (RBAC-gated).
    const hitCount = Object.keys(suggestions ?? {}).length;
    const missCount = Math.max(0, headers.length - hitCount);
    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "umrah.import.suggest_mapping",
      entity: "umrah_import_mapping_presets",
      entityId: scope.userId,
      after: { fileType, headers, hitCount, missCount },
    });
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "umrah.import.suggest_mapping",
      entity: "umrah_import_mapping_presets",
      entityId: scope.userId,
      details: JSON.stringify({ fileType, total: headers.length, hitCount, missCount }),
    }).catch((e) => logger.error(e, "umrah suggest-mapping event emit failed"));
    res.json({ suggestions });
  } catch (err) { handleRouteError(err, res, "Suggest mapping error"); }
});

// ── Column-mapping presets ───────────────────────────────────────────
// Operators re-import the same Excel layout every week from the same
// NUSK/MOFA portal. Saving the mapping per (user, fileType) lets the
// wizard auto-apply the layout on file pick instead of asking the
// operator to re-pick every column. One default per (company, user,
// fileType) — enforced by partial unique index in migration 234.

const presetSchema = z.object({
  name: z.string().trim().min(1, "اسم القالب مطلوب").max(120),
  fileType: z.enum(["mutamers", "vouchers"]),
  mapping: z.record(z.string(), z.string()),
  isDefault: z.boolean().optional().default(false),
});

router.get("/import/presets", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { fileType } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId, scope.userId];
    let extraWhere = "";
    if (fileType === "mutamers" || fileType === "vouchers") {
      params.push(fileType);
      extraWhere = ` AND "fileType" = $${params.length}`;
    }
    const rows = await rawQuery(
      `SELECT id, name, "fileType", mapping, "isDefault", "createdAt", "updatedAt"
         FROM umrah_import_mapping_presets
        WHERE "companyId" = $1 AND "userId" = $2 AND "deletedAt" IS NULL${extraWhere}
        ORDER BY "isDefault" DESC, "updatedAt" DESC
        LIMIT 200`,
      params,
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List import presets error"); }
});

router.post("/import/presets", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, fileType, mapping, isDefault } = zodParse(presetSchema.safeParse(req.body));
    await withTransaction(async (client) => {
      // Enforce single default per (company, user, fileType) — clear
      // any other defaults before flipping this row's flag.
      if (isDefault) {
        await client.query(
          `UPDATE umrah_import_mapping_presets
              SET "isDefault" = false, "updatedAt" = NOW()
            WHERE "companyId" = $1 AND "userId" = $2 AND "fileType" = $3
              AND "deletedAt" IS NULL AND "isDefault" = true`,
          [scope.companyId, scope.userId, fileType],
        );
      }
      // UPSERT on (companyId, userId, fileType, name).
      await client.query(
        `INSERT INTO umrah_import_mapping_presets
           ("companyId", "branchId", "userId", name, "fileType", mapping, "isDefault")
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         ON CONFLICT ("companyId", "userId", "fileType", name) WHERE "deletedAt" IS NULL
         DO UPDATE SET mapping = EXCLUDED.mapping, "isDefault" = EXCLUDED."isDefault", "updatedAt" = NOW()`,
        [scope.companyId, scope.branchId ?? null, scope.userId, name, fileType, JSON.stringify(mapping), isDefault],
      );
    });
    res.status(201).json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Save import preset error"); }
});

router.delete("/import/presets/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await rawExecute(
      `UPDATE umrah_import_mapping_presets
          SET "deletedAt" = NOW(), "updatedAt" = NOW()
        WHERE id = $1 AND "companyId" = $2 AND "userId" = $3 AND "deletedAt" IS NULL`,
      [id, scope.companyId, scope.userId],
    );
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "Delete import preset error"); }
});

router.get("/import-logs", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM umrah_import_logs WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 50`, [scope.companyId]);
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List import logs error"); }
});

router.get("/unassigned", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as Record<string, string | undefined>;
    let where = `"companyId"=$1 AND "agentId" IS NULL AND "deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND "seasonId"=$${params.length}`; }
    const rows = await rawQuery(`SELECT * FROM umrah_pilgrims WHERE ${where} ORDER BY "createdAt" DESC LIMIT 1000`, params);
    res.json(maskFields(req, { data: rows.map(decryptPilgrimRow) }));
  } catch (err) { handleRouteError(err, res, "List unassigned error"); }
});

// Bulk status transition — flight-landing flow.
// A landing pilgrimage flight brings 50+ pilgrims who all need to flip
// pending → arrived in one operator action. Pre-PR the only path was
// PATCH /pilgrims/:id per row, which is 50 round-trips + 50 audit
// rows. This endpoint validates EVERY row's current status against
// PILGRIM_TRANSITIONS before flipping, so an already-departed pilgrim
// in the batch is skipped (not silently regressed).
const bulkStatusSchema = z.object({
  pilgrimIds: z.array(z.coerce.number()).min(1, "يجب تحديد معتمر واحد على الأقل"),
  status: z.enum(PILGRIM_STATUSES),
});

router.post("/pilgrims/status-bulk", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { pilgrimIds, status: toStatus } = zodParse(bulkStatusSchema.safeParse(req.body));

    // Compute the legal from-states for the requested toStatus by
    // inverting the transitions map. If toStatus has no legal source
    // (e.g. operator picked "pending" which nothing transitions INTO),
    // refuse early — otherwise the UPDATE would touch zero rows and
    // the operator would mistake the no-op for success.
    const fromStates = Object.entries(PILGRIM_TRANSITIONS)
      .filter(([, targets]) => targets.includes(toStatus))
      .map(([from]) => from);
    if (fromStates.length === 0) {
      throw new ValidationError(`لا يمكن الانتقال إلى الحالة "${toStatus}" من أي حالة حالية`, {
        field: "status",
        fix: "اختر حالة مسموح بها كهدف (مثل arrived أو departed)",
      });
    }

    // Two-pass count so we can report what actually changed vs what
    // was skipped. The skip count is what the operator actually wants
    // to see — "47 / 50 marked, 3 already departed" surfaces the
    // discrepancy without forcing them to compare counts manually.
    const [{ c: targetedCount }] = await rawQuery<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM umrah_pilgrims
       WHERE "companyId"=$1 AND "deletedAt" IS NULL AND id = ANY($2)`,
      [scope.companyId, pilgrimIds],
    );

    const updated = await rawQuery<{ id: number }>(
      `UPDATE umrah_pilgrims
       SET status=$1, "updatedAt"=NOW()
       WHERE "companyId"=$2
         AND "deletedAt" IS NULL
         AND id = ANY($3)
         AND status = ANY($4)
       RETURNING id`,
      [toStatus, scope.companyId, pilgrimIds, fromStates],
    );
    const updatedCount = updated.length;
    const skippedCount = Math.max(0, Number(targetedCount) - updatedCount);

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "umrah_pilgrims", entityId: 0,
      after: { bulkStatusTo: toStatus, updated: updatedCount, skipped: skippedCount },
    }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.pilgrims.bulk_status_changed", entity: "umrah_pilgrims", entityId: 0,
      details: JSON.stringify({ toStatus, requested: pilgrimIds.length, updated: updatedCount, skipped: skippedCount }),
    }).catch((e) => logger.error(e, "umrah background task failed"));

    res.json({ updated: updatedCount, skipped: skippedCount, toStatus });
  } catch (err) { handleRouteError(err, res, "Bulk status update error"); }
});

router.post("/assign-bulk", authorize({ feature: "umrah", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { pilgrimIds, agentId } = zodParse(bulkAssignSchema.safeParse(req.body));
    const placeholders = pilgrimIds.map((_: any, i: number) => `$${i + 3}`).join(",");
    await rawExecute(
      `UPDATE umrah_pilgrims SET "agentId"=$1, "updatedAt"=NOW() WHERE "companyId"=$2 AND "deletedAt" IS NULL AND status NOT IN ('departed','cancelled') AND id IN (${placeholders})`,
      [agentId, scope.companyId, ...pilgrimIds]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_pilgrims", entityId: 0, after: { assigned: pilgrimIds.length, agentId } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pilgrims.bulk_assigned", entity: "umrah_pilgrims", entityId: 0, details: JSON.stringify({ count: pilgrimIds.length, agentId }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ assigned: pilgrimIds.length, agentId });
  } catch (err) { handleRouteError(err, res, "Bulk assign error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// VIOLATIONS CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get("/violations", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT v.*,
              p."fullName" AS "mutamerName", p."passportNumber",
              a.name AS "agentName",
              sa.name AS "subAgentName"
       FROM umrah_violations v
       LEFT JOIN umrah_pilgrims p ON p.id = v."mutamerId"
       LEFT JOIN umrah_agents a ON a.id = v."agentId"
       LEFT JOIN umrah_sub_agents sa ON sa.id = v."subAgentId"
       WHERE v."companyId"=$1 AND v."deletedAt" IS NULL
       ORDER BY v."detectedAt" DESC LIMIT 500`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows.map(decryptPilgrimRow), total: rows.length }));
  } catch (err) { handleRouteError(err, res, "List violations error"); }
});

router.get("/violations/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT v.*,
              p."fullName" AS "mutamerName", p."passportNumber",
              a.name AS "agentName",
              sa.name AS "subAgentName"
       FROM umrah_violations v
       LEFT JOIN umrah_pilgrims p ON p.id = v."mutamerId"
       LEFT JOIN umrah_agents a ON a.id = v."agentId"
       LEFT JOIN umrah_sub_agents sa ON sa.id = v."subAgentId"
       WHERE v.id=$1 AND v."companyId"=$2 AND v."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المخالفة غير موجودة");
    res.json(maskFields(req, decryptPilgrimRow(row)));
  } catch (err) { handleRouteError(err, res, "Get violation error"); }
});

router.post("/violations", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createViolationSchema.safeParse(req.body));

    // FK consistency. The route accepts mutamerId / agentId /
    // subAgentId independently. Without validation an operator
    // could attach a violation to pilgrim P (under agent A) with
    // agentId=B, and the dashboard filter "violations by agent"
    // would attribute the penalty to the wrong party. The pilgrim
    // is the source of truth — if a mutamerId is supplied, the
    // agent / sub-agent fields must either match the pilgrim's
    // FKs or be omitted (in which case we auto-fill from the
    // pilgrim row so the rollup queries don't have to LEFT JOIN
    // umrah_pilgrims for every filter).
    let agentId = b.agentId ?? null;
    let subAgentId = b.subAgentId ?? null;
    if (b.mutamerId) {
      const [p] = await rawQuery<{ id: number; agentId: number | null; subAgentId: number | null }>(
        `SELECT id, "agentId", "subAgentId" FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(b.mutamerId), scope.companyId]
      );
      if (!p) {
        throw new ValidationError(`المعتمر رقم ${b.mutamerId} غير موجود`, {
          field: "mutamerId",
          fix: "اختر معتمراً مسجلاً أو اتركه فارغاً",
        });
      }
      if (agentId !== null && p.agentId !== null && Number(agentId) !== p.agentId) {
        throw new ValidationError("الوكيل المحدد لا يطابق وكيل المعتمر", {
          field: "agentId",
          fix: "اترك حقل الوكيل فارغاً ليُملأ تلقائياً من المعتمر، أو غيّر المعتمر",
        });
      }
      if (subAgentId !== null && p.subAgentId !== null && Number(subAgentId) !== p.subAgentId) {
        throw new ValidationError("المكتب المحدد لا يطابق مكتب المعتمر", {
          field: "subAgentId",
          fix: "اترك حقل المكتب فارغاً ليُملأ تلقائياً من المعتمر، أو غيّر المعتمر",
        });
      }
      agentId = agentId ?? p.agentId;
      subAgentId = subAgentId ?? p.subAgentId;
    } else if (b.agentId && b.subAgentId) {
      // No pilgrim → still verify the sub-agent belongs to the
      // supplied agent, otherwise the dashboard's per-agent
      // penalty totals will double-count when both filters fire.
      const [sub] = await rawQuery<{ id: number; agentId: number | null }>(
        `SELECT id, "agentId" FROM umrah_sub_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(b.subAgentId), scope.companyId]
      );
      if (sub && sub.agentId !== null && sub.agentId !== Number(b.agentId)) {
        throw new ValidationError("المكتب لا ينتمي للوكيل المحدد", {
          field: "subAgentId",
          fix: "اختر مكتباً تابعاً للوكيل، أو غيّر الوكيل",
        });
      }
    }

    const rows = await rawQuery(
      `INSERT INTO umrah_violations ("companyId","branchId",type,"referenceType","referenceNumber","mutamerId","agentId","subAgentId",description,"penaltyAmount",status,"createdBy","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()) RETURNING *`,
      [scope.companyId, scope.branchId || null, b.type, b.referenceType || null, b.referenceNumber || null, b.mutamerId || null, agentId, subAgentId, b.description || null, b.penaltyAmount || 0, b.status || "open", scope.userId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_violations", entityId: rows[0]?.id, after: { type: b.type, penaltyAmount: b.penaltyAmount } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.violation.created", entity: "umrah_violations", entityId: rows[0]?.id, after: { type: b.type } }).catch((e) => logger.error(e, "umrah background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create violation error"); }
});

router.patch("/violations/:id", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchViolationSchema.safeParse(req.body));
    const params: unknown[] = [id, scope.companyId, scope.userId];
    const sets: string[] = ['"updatedAt"=NOW()', `"updatedBy"=$${params.length}`];
    for (const key of ["type","referenceType","referenceNumber","mutamerId","agentId","subAgentId","description","penaltyAmount","status","linkedInvoiceId"] as const) {
      if (b[key] !== undefined) {
        params.push(b[key]);
        const col = /[A-Z]/.test(key) ? `"${key}"` : key;
        sets.push(`${col}=$${params.length}`);
      }
    }
    const [row] = await rawQuery(
      `UPDATE umrah_violations SET ${sets.join(",")} WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError("المخالفة غير موجودة");
    // M6: the update handler wrote no audit row and emitted no event,
    // unlike the sibling delete handler. Mirror it so violation edits
    // are traceable and `umrah.violation.updated` finally has an emitter.
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_violations", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.violation.updated", entity: "umrah_violations", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update violation error"); }
});

router.delete("/violations/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `UPDATE umrah_violations SET "deletedAt"=NOW(), "updatedBy"=$3 WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL RETURNING id`,
      [id, scope.companyId, scope.userId]
    );
    if (!row) throw new NotFoundError("المخالفة غير موجودة");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_violations", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.violation.deleted", entity: "umrah_violations", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete violation error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL PENALTY CREATION
// ─────────────────────────────────────────────────────────────────────────────

router.post("/penalties", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createPenaltySchema.safeParse(req.body));
    if (!b.pilgrimId && !b.agentId) throw new ValidationError("يجب تحديد المعتمر أو الوكيل");
    if (b.pilgrimId) {
      const [p] = await rawQuery<Record<string, unknown>>(`SELECT id FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [b.pilgrimId, scope.companyId]);
      if (!p) throw new NotFoundError("المعتمر غير موجود");
    }
    if (b.agentId) {
      const [a] = await rawQuery<Record<string, unknown>>(`SELECT id FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [b.agentId, scope.companyId]);
      if (!a) throw new NotFoundError("الوكيل غير موجود");
    }
    const rows = await rawQuery(
      `INSERT INTO umrah_penalties ("companyId","pilgrimId","agentId","seasonId",type,amount,notes,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [scope.companyId, b.pilgrimId || null, b.agentId || null, b.seasonId || null, b.type || "manual", b.amount || 0, b.reason || null, b.status || "pending"]
    );
    if (Number(b.amount) > 0) {
      try {
        let pilgrimName = "غير محدد";
        let agentName: string | undefined;
        if (b.pilgrimId) {
          const [p] = await rawQuery<Record<string, unknown>>(`SELECT "fullName" FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2`, [b.pilgrimId, scope.companyId]);
          if (p) pilgrimName = p.fullName as string;
        }
        if (b.agentId) {
          const [a] = await rawQuery<Record<string, unknown>>(`SELECT name FROM umrah_agents WHERE id=$1 AND "companyId"=$2`, [b.agentId, scope.companyId]);
          if (a) agentName = a.name as string | undefined;
        }
        const { umrahEngine } = await import("../lib/engines/index.js");
        await umrahEngine.postPenaltyGL(
          { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
          {
            id: rows[0].id as number, amount: Number(b.amount),
            pilgrimName, agentName, type: b.type || "manual",
            agentId: b.agentId ? Number(b.agentId) : undefined,
            seasonId: b.seasonId ? Number(b.seasonId) : undefined,
          }
        );
      } catch (glErr) {
        logger.error(glErr, "Penalty GL posting failed:");
      }
    }
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_penalties", entityId: rows[0]?.id, after: { amount: b.amount, type: b.type } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.penalty.created", entity: "umrah_penalties", entityId: rows[0]?.id }).catch((e) => logger.error(e, "umrah background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create penalty error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS — per-company configuration that drives umrah↔finance integration
// ─────────────────────────────────────────────────────────────────────────────
// Lives under /umrah (not /settings) so the operator finds it where they
// expect — alongside the rest of the umrah module. Reads/writes a tiny
// projection of the companies row (just the umrah-relevant columns) so
// adding future settings is one zod field + one SET clause.

// Shared nullable-FK preprocessor — "" → null, undefined stays
// undefined so the PATCH handler can distinguish "field omitted"
// (preserve existing value via COALESCE) from "field set to null"
// (explicit clear). Then coerce to number when present.
const nullableFkPreproc = z.preprocess(
  (v) => (v === "" ? null : v),
  z.coerce.number().nullable().optional(),
);

// Penalty knobs are non-negative numbers (or null = "reset to global
// default"). Same preprocess pattern as the FK fields — "" treated as
// null, undefined preserves existing value.
const nullableNumberPreproc = z.preprocess(
  (v) => (v === "" ? null : v),
  z.coerce.number().nonnegative({ message: "القيمة يجب أن تكون ≥ 0" }).nullable().optional(),
);

const umrahSettingsPatchSchema = z.object({
  // When unset, the vendor-statement endpoint skips its umrah branch
  // (gracefully — no broken queries).
  nuskSupplierId: nullableFkPreproc,
  // Service-type → product mapping (migration 241). When all 3 are
  // set, the Phase 3b engine will split each group's lineTotal into
  // visa / services / transport lines. When any is unset, the engine
  // falls back to the single bundled line — no error, just no split.
  umrahVisaProductId: nullableFkPreproc,
  umrahServicesProductId: nullableFkPreproc,
  umrahTransportProductId: nullableFkPreproc,
  // Overstay penalty knobs (PR #1477). Stored as system_settings rows
  // keyed per company. Send null to clear (reverts to the global
  // default from key=… companyId IS NULL).
  umrahOverstayDailyPenalty: nullableNumberPreproc,
  umrahOverstayTierDays: nullableNumberPreproc,
  umrahOverstayTierAmount: nullableNumberPreproc,
  // §8 of #1870 — operator-facing knobs for the §6/§5 finance hygiene
  // PRs. Stored as system_settings rows keyed per company; null clears
  // back to the engine's default.
  //   umrahVatRate    — standard rate the engine multiplies the margin by (0-100).
  //   umrahVatMode    — 'inclusive' (default, KSA margin scheme extracts the VAT)
  //                     or 'exclusive' (legacy add-on-top).
  //   commissionViaHr — 'true' (default) routes commission CR to salary_payable
  //                     so HR's payroll JE clears one payable; 'false' keeps the
  //                     legacy commission_payable account.
  umrahVatRate: nullableNumberPreproc,
  umrahVatMode: z.preprocess(
    (v) => (v === "" ? null : v),
    z.enum(["inclusive", "exclusive"]).nullable().optional(),
  ),
  commissionViaHr: z.preprocess(
    (v) => (v === "" ? null : v),
    z.boolean().nullable().optional(),
  ),
});

router.get("/settings", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    // JOIN suppliers so the UI can show the supplier name without
    // a second fetch. LEFT JOIN — `nuskSupplierId` may be null on a
    // freshly-installed company. The 3 product joins follow the same
    // pattern (migration 241).
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT c."nuskSupplierId",
              s.name  AS "nuskSupplierName",
              NULL::text AS "nuskSupplierCode",
              c."umrahVisaProductId",
              pv.name AS "umrahVisaProductName",
              c."umrahServicesProductId",
              ps.name AS "umrahServicesProductName",
              c."umrahTransportProductId",
              pt.name AS "umrahTransportProductName"
         FROM companies c
         LEFT JOIN suppliers s
                ON s.id = c."nuskSupplierId"
               AND s."companyId" = c.id
               AND s."deletedAt" IS NULL
         LEFT JOIN products pv
                ON pv.id = c."umrahVisaProductId"
               AND pv."companyId" = c.id
         LEFT JOIN products ps
                ON ps.id = c."umrahServicesProductId"
               AND ps."companyId" = c.id
         LEFT JOIN products pt
                ON pt.id = c."umrahTransportProductId"
               AND pt."companyId" = c.id
        WHERE c.id = $1`,
      [scope.companyId],
    );
    // Overstay-penalty settings live in system_settings (not
    // companies) because they're tunable per-company without a
    // migration per knob. PR #1477 added the tiered model
    // (tier_days / tier_amount); this endpoint surfaces the three
    // existing knobs to the UI so the operator can edit them
    // without opening a DB console.
    const penaltyRows = await rawQuery<{ key: string; value: string }>(
      `SELECT key, value FROM system_settings
        WHERE key IN ('umrah.overstay_daily_penalty',
                      'umrah.overstay_tier_days',
                      'umrah.overstay_tier_amount',
                      'umrah_vat_rate',
                      'umrah_vat_mode',
                      'commission_via_hr')
          AND ( ("companyId" IS NULL AND "branchId" IS NULL)
                OR ("companyId" = $1 AND "branchId" IS NULL) )
        ORDER BY "companyId" NULLS FIRST`,
      [scope.companyId],
    );
    // Same NULLS-FIRST precedence the cron uses (PR #1477) — the
    // company-scoped value overwrites the global default in the
    // dict assignment loop.
    const penaltyByKey: Record<string, number | null> = {
      "umrah.overstay_daily_penalty": null,
      "umrah.overstay_tier_days": null,
      "umrah.overstay_tier_amount": null,
    };
    // §8 of #1870 — the 3 finance-hygiene knobs. VAT rate is numeric,
    // mode is a string enum, commission_via_hr is a boolean string.
    // The engine defaults stay in effect if the setting is unread.
    let umrahVatRate: number | null = null;
    let umrahVatMode: string | null = null;
    let commissionViaHr: boolean | null = null;
    for (const r of penaltyRows) {
      if (r.key === "umrah_vat_rate") {
        const v = Number(r.value);
        umrahVatRate = Number.isFinite(v) ? v : null;
        continue;
      }
      if (r.key === "umrah_vat_mode") {
        umrahVatMode = r.value === "exclusive" ? "exclusive" : "inclusive";
        continue;
      }
      if (r.key === "commission_via_hr") {
        commissionViaHr = r.value !== "false";
        continue;
      }
      const v = Number(r.value);
      penaltyByKey[r.key] = Number.isFinite(v) ? v : null;
    }

    res.json({
      ...(row ?? {
        nuskSupplierId: null, nuskSupplierName: null, nuskSupplierCode: null,
        umrahVisaProductId: null, umrahVisaProductName: null,
        umrahServicesProductId: null, umrahServicesProductName: null,
        umrahTransportProductId: null, umrahTransportProductName: null,
      }),
      umrahOverstayDailyPenalty: penaltyByKey["umrah.overstay_daily_penalty"],
      umrahOverstayTierDays: penaltyByKey["umrah.overstay_tier_days"],
      umrahOverstayTierAmount: penaltyByKey["umrah.overstay_tier_amount"],
      umrahVatRate,
      umrahVatMode,
      commissionViaHr,
    });
  } catch (err) { handleRouteError(err, res, "Get umrah settings error"); }
});

router.patch("/settings", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const b = zodParse(umrahSettingsPatchSchema.safeParse(req.body));
    // Validate the supplier (if provided) belongs to THIS company —
    // defence in depth so a cross-tenant id can't be silently
    // accepted via API.
    if (b.nuskSupplierId != null) {
      const [supplier] = await rawQuery<{ id: number }>(
        `SELECT id FROM suppliers
          WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
        [b.nuskSupplierId, scope.companyId],
      );
      if (!supplier) {
        throw new ValidationError(`المورد رقم ${b.nuskSupplierId} غير موجود`, {
          field: "nuskSupplierId",
          fix: "اختر مورداً مسجلاً لهذه الشركة أو اتركه فارغاً",
        });
      }
    }
    // Validate each product FK belongs to THIS company — defence in
    // depth identical to the supplier check above. Products list is
    // shared across modules so a cross-tenant id leaking through
    // settings would silently mis-route revenue on future invoices.
    const productChecks: Array<[number | null | undefined, "umrahVisaProductId" | "umrahServicesProductId" | "umrahTransportProductId"]> = [
      [b.umrahVisaProductId, "umrahVisaProductId"],
      [b.umrahServicesProductId, "umrahServicesProductId"],
      [b.umrahTransportProductId, "umrahTransportProductId"],
    ];
    for (const [value, field] of productChecks) {
      if (value == null) continue;
      const [product] = await rawQuery<{ id: number }>(
        `SELECT id FROM products WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
        [value, scope.companyId],
      );
      if (!product) {
        throw new ValidationError(`المنتج رقم ${value} غير موجود`, {
          field,
          fix: "اختر منتجاً مسجلاً لهذه الشركة أو اتركه فارغاً",
        });
      }
    }
    // Dynamic SET clause — proper PATCH semantics. A field absent
    // from the body is PRESERVED (not touched), a field set to null
    // is CLEARED, a field set to a value is UPDATED. SQL COALESCE
    // can't express the "explicit clear" path, so we build the
    // statement based on what zod actually parsed.
    const sets: string[] = [];
    const params: unknown[] = [scope.companyId];
    const fields: Array<["nuskSupplierId" | "umrahVisaProductId" | "umrahServicesProductId" | "umrahTransportProductId", number | null | undefined]> = [
      ["nuskSupplierId", b.nuskSupplierId],
      ["umrahVisaProductId", b.umrahVisaProductId],
      ["umrahServicesProductId", b.umrahServicesProductId],
      ["umrahTransportProductId", b.umrahTransportProductId],
    ];
    const auditAfter: Record<string, number | string | boolean | null> = {};
    for (const [field, value] of fields) {
      if (value === undefined) continue;
      params.push(value);
      sets.push(`"${field}" = $${params.length}`);
      auditAfter[field] = value;
    }
    // The companies FK fields + the system_settings knobs are one logical
    // settings save across two tables — write them atomically so a partial
    // failure can't leave the page half-applied. rawQuery joins the ambient
    // transaction (txStore).
    const settingsFields: Array<[string, number | string | boolean | null | undefined]> = [
      ["umrah.overstay_daily_penalty", b.umrahOverstayDailyPenalty],
      ["umrah.overstay_tier_days",     b.umrahOverstayTierDays],
      ["umrah.overstay_tier_amount",   b.umrahOverstayTierAmount],
      // §8 of #1870 — finance-hygiene knobs operator-configurable from
      // the same /umrah/settings UI page.
      ["umrah_vat_rate",   b.umrahVatRate],
      ["umrah_vat_mode",   b.umrahVatMode],
      ["commission_via_hr", typeof b.commissionViaHr === "boolean" ? (b.commissionViaHr ? "true" : "false") : b.commissionViaHr],
    ];
    const keyToAuditField: Record<string, string> = {
      "umrah.overstay_daily_penalty": "umrahOverstayDailyPenalty",
      "umrah.overstay_tier_days":     "umrahOverstayTierDays",
      "umrah.overstay_tier_amount":   "umrahOverstayTierAmount",
      "umrah_vat_rate":               "umrahVatRate",
      "umrah_vat_mode":               "umrahVatMode",
      "commission_via_hr":            "commissionViaHr",
    };
    await withTransaction(async () => {
      if (sets.length > 0) {
        await rawExecute(
          `UPDATE companies SET ${sets.join(", ")} WHERE id = $1`,
          params,
        );
      }

      // Overstay-penalty knobs + §8 finance-hygiene knobs live in
      // system_settings (not companies). Same omit/null/value semantics
      // as the FK fields above. We UPSERT when the value is non-null,
      // DELETE the company-scoped row when the value is explicitly null
      // — clearing reverts to the global default (key with
      // companyId IS NULL).
      for (const [key, value] of settingsFields) {
        if (value === undefined) continue;
        if (value === null) {
          await rawExecute(
            `DELETE FROM system_settings WHERE key = $1 AND "companyId" = $2 AND "branchId" IS NULL`,
            [key, scope.companyId],
          );
        } else {
          // UPSERT — UPDATE first; INSERT only if no row exists.
          // Matches the pattern in routes/settings.ts so a future
          // shared helper can replace both call sites.
          const result = await rawExecute(
            `UPDATE system_settings SET value=$1, "updatedAt"=NOW() WHERE key=$2 AND "companyId"=$3 AND "branchId" IS NULL`,
            [String(value), key, scope.companyId],
          );
          if (!result.affectedRows) {
            await rawExecute(
              `INSERT INTO system_settings (key, value, "companyId") VALUES ($1, $2, $3)`,
              [key, String(value), scope.companyId],
            );
          }
        }
        auditAfter[keyToAuditField[key]!] = value;
      }
    });

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "umrah.settings.updated", entity: "companies", entityId: scope.companyId,
      after: auditAfter,
    }).catch((e) => logger.error(e, "umrah settings audit failed"));
    res.json({ success: true, ...auditAfter });
  } catch (err) { handleRouteError(err, res, "Update umrah settings error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// NUSK WALLET — derived view over the existing AP system
// ─────────────────────────────────────────────────────────────────────────────
// The "NUSK wallet" the operator thinks about is NOT a new table — it's the
// running balance of the NUSK supplier in the standard AP ledger:
//
//   walletBalance = (deposits TO NUSK)  -  (NUSK invoice obligations net of refunds)
//
//   Positive → operator has prepaid credit with NUSK (can buy more visas)
//   Zero     → fully reconciled
//   Negative → operator owes NUSK (must top up before next invoice)
//
// Computation reuses the same shapes used by the vendor-statement endpoint
// (PR #1453), so the wallet display and the supplier statement converge on
// the same number — no drift, no parallel system.

router.get("/nusk-wallet", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const [companyCfg] = await rawQuery<{ nuskSupplierId: number | null }>(
      `SELECT "nuskSupplierId" FROM companies WHERE id = $1`,
      [scope.companyId],
    );
    const nuskSupplierId = companyCfg?.nuskSupplierId ?? null;
    if (nuskSupplierId == null) {
      // Settings unset — return null balance with a configured: false
      // flag so the UI can render the "configure NUSK first" CTA
      // instead of misleading zeroes.
      res.json({
        configured: false,
        nuskSupplierId: null,
        walletBalance: 0,
        totalDeposits: 0,
        totalObligations: 0,
        totalRefunds: 0,
      });
      return;
    }

    // Deposits TO NUSK — payment-voucher allocations against POs owned by
    // the NUSK supplier. Same JE filters the vendor-statement uses
    // (balancesApplied + not reversed + soft-delete guards) so the
    // numbers reconcile across both reports.
    const [depositsRow] = await rawQuery<{ total: string }>(
      `SELECT COALESCE(SUM(spa.amount), 0) AS total
         FROM supplier_payment_allocations spa
         JOIN journal_entries je ON je.id = spa."journalEntryId"
         JOIN purchase_orders po ON po.id = spa."obligationId"
        WHERE spa."companyId" = $1
          AND spa."deletedAt" IS NULL
          AND spa."obligationType" = 'purchase_order'
          AND po."supplierId" = $2
          AND je."deletedAt" IS NULL
          AND je."balancesApplied" = true
          AND je."reversedById" IS NULL`,
      [scope.companyId, nuskSupplierId],
    );

    // NUSK obligations — net of refunds, excluding cancelled rows. Same
    // shape as the cost-basis fix in PR #1457 so this view's "owed to
    // NUSK" number matches what's used as cost for margin VAT.
    const [obligationsRow] = await rawQuery<{ total: string; refunds: string }>(
      `SELECT COALESCE(SUM("totalAmount"), 0) AS total,
              COALESCE(SUM("refundAmount"), 0) AS refunds
         FROM umrah_nusk_invoices
        WHERE "companyId" = $1
          AND "deletedAt" IS NULL
          AND "nuskStatus" NOT IN ('cancelled')`,
      [scope.companyId],
    );

    const totalDeposits = Number(depositsRow?.total ?? 0);
    const grossObligations = Number(obligationsRow?.total ?? 0);
    const totalRefunds = Number(obligationsRow?.refunds ?? 0);
    const totalObligations = grossObligations - totalRefunds;
    const walletBalance = totalDeposits - totalObligations;

    res.json({
      configured: true,
      nuskSupplierId,
      walletBalance,
      totalDeposits,
      totalObligations,
      totalRefunds,
    });
  } catch (err) { handleRouteError(err, res, "Get NUSK wallet error"); }
});

// Test internal notification — the operator clicks "اختبار" in
// settings and we send a one-off in-app notification to their own
// assignment. Confirms the notification seam is wired without
// forcing a real pilgrim row through the pipeline.
router.post("/notifications/test", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // Find this operator's assignment id — that's where the test
    // notification lands. NULL means the user has no active
    // employee assignment; we surface a clear error instead of
    // silently dropping.
    const [me] = await rawQuery<{ id: number }>(
      `SELECT ea.id FROM employee_assignments ea
        JOIN users u ON u."employeeId" = ea."employeeId"
        WHERE u.id = $1 AND ea."companyId" = $2 AND ea.status = 'active'
        ORDER BY ea.id DESC LIMIT 1`,
      [scope.userId, scope.companyId],
    );
    if (!me) {
      throw new ValidationError("ليس لديك تكليف موظف نشط — لا يمكن استلام إشعار تجريبي", {
        field: "userId",
        fix: "تأكد من ربط حسابك بـemployee_assignment نشط في إعدادات الموارد البشرية",
      });
    }
    const { createNotification } = await import("../lib/businessHelpers.js");
    await createNotification({
      companyId: scope.companyId,
      assignmentId: me.id,
      type: "umrah",
      title: "🔔 إشعار تجريبي من نظام العمرة",
      body: `اختبار نظام الإشعارات الداخلية — التاريخ: ${todayISO()}. إذا وصلتك هذه الرسالة فالنظام جاهز.`,
      priority: "normal",
      refType: "umrah_notifications",
      refId: undefined,
      actionUrl: "/umrah/settings",
    });
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.notifications.test.sent", entity: "notifications", entityId: me.id,
      details: JSON.stringify({ recipientAssignmentId: me.id }),
    }).catch((e) => logger.error(e, "umrah test notify event failed"));
    res.json({ ok: true, recipientAssignmentId: me.id });
  } catch (err) { handleRouteError(err, res, "Test notification error"); }
});

export default router;
