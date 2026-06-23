import { Router } from "express";
import { z } from "zod";
import { zCoerceBoolean } from "../lib/zodCoerce.js";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware, type RequestScope } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { checkFinancialPeriodOpen, emitEvent, createAuditLog, todayISO, toDateISO } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters, type ScopeFilters } from "../lib/scopedQuery.js";
import { requestIdempotencyToken, markIdempotencyReplay, isDryRun } from "../lib/requestIdempotency.js";

import { pushToDLQ } from "../lib/eventBus.js";
import { logger } from "../lib/logger.js";
import {
  classifyAccountUsage,
  isValidUsage,
  isValidChildrenPolicy,
  DEFAULT_CHILDREN_USAGE_POLICY,
  type AccountUsage,
  type ChildrenUsagePolicy,
} from "../lib/financeAccountClassifier.js";
import {
  inferCodeWidth,
  suggestNextChildCode,
  suggestNextRootCode,
} from "../lib/financeAccountNumbering.js";

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
const ACCOUNT_NATURES = ["debit", "credit"] as const;

const createAccountSchema = z.object({
  code: z.string().min(1, "رمز الحساب مطلوب"),
  name: z.string().min(1, "اسم الحساب مطلوب"),
  type: z.string().refine((v) => (ACCOUNT_TYPES as readonly string[]).includes(v), { message: "نوع الحساب غير صالح" }).optional().default("asset"),
  parentCode: z.string().optional().nullable(),
  nameEn: z.string().optional().nullable(),
  nature: z.string().refine((v) => (ACCOUNT_NATURES as readonly string[]).includes(v), { message: "طبيعة الحساب غير صالحة" }).optional().default("debit"),
  allowPosting: z.boolean().optional().default(true),
  isAnalytical: z.boolean().optional().default(false),
  // Account-usage classification (#1715). What the account IS
  // operationally (cash_box / bank / custody / …) on top of the
  // accounting type. Optional — resolved via parent-inheritance +
  // auto-classifier when omitted.
  accountUsage: z.string().optional().nullable(),
  childrenUsagePolicy: z.string().optional().nullable(),
  // Hybrid COA: null/omitted = shared company account; a branch id makes
  // this a branch-specific sub-account under the shared tree.
  branchId: z.coerce.number().int().positive().optional().nullable(),
});

const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().refine((v) => (ACCOUNT_TYPES as readonly string[]).includes(v), { message: "نوع الحساب غير صالح" }).optional(),
  parentCode: z.string().optional().nullable(),
  // #1715 (owner: «وحد نماذج الحسابات») — the edit form is now the SAME form as
  // create, so the PATCH accepts the same editable metadata. `code` stays
  // immutable and branch SCOPE is create-only (not movable here).
  nameEn: z.string().optional().nullable(),
  nature: z.string().refine((v) => (ACCOUNT_NATURES as readonly string[]).includes(v), { message: "طبيعة الحساب غير صالحة" }).optional(),
  accountUsage: z.string().optional().nullable(),
  childrenUsagePolicy: z.string().optional().nullable(),
  allowPosting: z.boolean().optional(),
  isAnalytical: z.boolean().optional(),
});

const journalLineSchema = z.object({
  accountCode: z.string().min(1, "رمز الحساب مطلوب"),
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
  description: z.string().optional().default(""),
  costCenter: z.string().optional(),
  // Dimensional allocation (#1090 line-level allocation — phase P0/P1
  // brought dimensions to invoice + PO lines; this lets manual
  // journal entries carry the same dimensions so trial-balance and
  // per-entity profitability reports remain consistent across all
  // journal sources).
  costCenterId: z.coerce.number().int().positive().optional(),
  activityType: z.string().optional(),
  projectId: z.coerce.number().int().positive().optional(),
  vehicleId: z.coerce.number().int().positive().optional(),
  propertyId: z.coerce.number().int().positive().optional(),
  unitId: z.coerce.number().int().positive().optional(),
  assetId: z.coerce.number().int().positive().optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  driverId: z.coerce.number().int().positive().optional(),
  contractId: z.coerce.number().int().positive().optional(),
  clientId: z.coerce.number().int().positive().optional(),
  vendorId: z.coerce.number().int().positive().optional(),
  umrahSeasonId: z.coerce.number().int().positive().optional(),
  umrahAgentId: z.coerce.number().int().positive().optional(),
  manualOverrideReason: z.string().optional(),
});

const createJournalSchema = z.object({
  ref: z.string().optional(),
  description: z.string().optional().default(""),
  date: z.string().optional(),
  lines: z.array(journalLineSchema).min(1, "بنود القيد مطلوبة"),
});

export const accountsRouter = Router();
accountsRouter.use(authMiddleware);

interface ChartOfAccountsBriefRow {
  id: number;
  code: string;
  name: string;
  type: string;
  parentCode: string | null;
  status: string;
}

interface ChartOfAccountsRow extends ChartOfAccountsBriefRow {
  companyId: number;
  nameEn: string | null;
  nature: string;
  allowPosting: boolean;
  isAnalytical: boolean;
  parentId: number | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface JournalCountRow { cnt: string | number }
interface IdRow { id: number }

interface JournalEntryWithLinesRow {
  id: number;
  companyId: number;
  branchId: number | null;
  ref: string;
  description: string;
  status: string;
  createdAt: string;
  createdBy: number | null;
  deletedAt: string | null;
  lines: unknown;
}

interface AccountLedgerHeadRow {
  name: string;
  type: string;
  code: string;
}

interface LedgerEntryRow {
  id: number;
  ref: string;
  description: string;
  date: string;
  debit: number | string | null;
  credit: number | string | null;
}

interface FinanceStatsRow {
  totalRevenue: number | string;
  paidThisMonth: number | string;
  pendingAmount: number | string;
  overdueAmount: number | string;
}

interface InvoiceSummaryRow {
  count: number | string;
  total: number | string;
  paid: number | string;
  outstanding: number | string;
}

interface ExpenseSummaryRow {
  count: number | string;
  total: number | string;
}

/**
 * SUB-1 guard: validate a proposed parent for a chart-of-accounts account.
 * Walks the parent's ancestry with a depth-bounded recursive CTE and rejects:
 *   - a parent that does not exist,
 *   - a cycle (the child appearing among its own would-be ancestors — this
 *     also catches an account set as its own parent),
 *   - a parent whose `type` differs from the account's type.
 * The depth bound keeps a pre-existing corrupt cycle in the data from
 * looping the recursion.
 */
async function assertValidAccountParent(
  companyId: number,
  childCode: string,
  childType: string,
  parentCode: string,
): Promise<void> {
  const ancestry = await rawQuery<{ code: string; type: string }>(
    `WITH RECURSIVE ancestry AS (
       SELECT ca.code, ca."parentCode", ca.type, 1 AS depth
         FROM chart_of_accounts ca
        WHERE ca."companyId" = $1 AND ca.code = $2 AND ca."deletedAt" IS NULL
       UNION ALL
       SELECT c.code, c."parentCode", c.type, a.depth + 1
         FROM chart_of_accounts c
         JOIN ancestry a ON c.code = a."parentCode"
        WHERE c."companyId" = $1 AND c."deletedAt" IS NULL AND a.depth < 64
     )
     SELECT code, type FROM ancestry ORDER BY depth`,
    [companyId, parentCode],
  );
  if (ancestry.length === 0) {
    throw new ValidationError(`الحساب الأب "${parentCode}" غير موجود`, {
      field: "parentCode",
      fix: "اختر رمز حساب أب موجوداً ضمن دليل الحسابات",
    });
  }
  if (ancestry.some((a) => a.code === childCode)) {
    throw new ConflictError(
      `لا يمكن جعل "${parentCode}" أباً للحساب "${childCode}" — ينشئ ذلك حلقة في شجرة الحسابات`,
      { field: "parentCode", fix: "اختر حساباً أب ليس فرعاً من هذا الحساب" },
    );
  }
  const parentType = ancestry[0]!.type;
  if (parentType !== childType) {
    throw new ValidationError(
      `نوع الحساب الأب (${parentType}) لا يطابق نوع الحساب (${childType})`,
      { field: "parentCode", fix: "يجب أن يكون الحساب الأب من نفس نوع الحساب الفرعي" },
    );
  }
}

/**
 * Hybrid per-branch chart of accounts scoping.
 *
 * The COA is a *company-level* tree (one set of codes per company). Each
 * branch may add its own sub-accounts under that shared tree. So:
 *   - Company codes (branchId IS NULL) are ALWAYS visible.
 *   - Picking a specific branch additionally surfaces that branch's own
 *     sub-accounts (branchId = picked) and hides other branches' ones.
 *   - No branch picked (company / overview) → the whole company tree,
 *     de-duplicated.
 *
 * It also fixes the duplicate-codes report: when the header picker sits on
 * "all companies" the request carries no companyIds, and the generic
 * buildScopedWhere would union every allowed company — so code 1000 shows
 * up once per company. COA is per-company, so we default to the active
 * company (scope.companyId) unless the caller explicitly filtered.
 */
function buildCoaScope(
  scope: RequestScope,
  filters: ScopeFilters,
  alias = "",
): { where: string; params: unknown[] } {
  const col = (c: string) => (alias ? `${alias}."${c}"` : `"${c}"`);
  const companyIds = filters.companyIds?.length
    ? filters.companyIds.filter((id) => scope.allowedCompanies.includes(id))
    : [scope.companyId];
  const params: unknown[] = [companyIds.length ? companyIds : [scope.companyId]];
  let where = `${col("companyId")} = ANY($1)`;
  const branchIds = filters.branchIds?.length
    ? filters.branchIds.filter((id) => scope.allowedBranches.includes(id))
    : [];
  if (branchIds.length) {
    params.push(branchIds);
    where += ` AND (${col("branchId")} IS NULL OR ${col("branchId")} = ANY($${params.length}))`;
  }
  return { where, params };
}

accountsRouter.get("/chart-of-accounts", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildCoaScope(scope, filters);
    const accounts = await rawQuery<ChartOfAccountsBriefRow>(
      `SELECT id, code, name, type, "parentCode", status, "branchId", "accountUsage", "childrenUsagePolicy"
       FROM chart_of_accounts
       WHERE ${where} AND "deletedAt" IS NULL
       ORDER BY code ASC`,
      params
    );
    res.json(maskFields(req, accounts));
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// GET /finance/accounts/next-code — suggest the next free account code
// (#1715, Comment #6). With ?parentCode= returns the next child slot under
// that parent (level/step aware: 1000→1100, 1100→1110, 1110→1111); without it
// returns the next root, optionally seeded by ?type=. Authoritative server-
// side numbering so every caller (UI, import, API) agrees. Read-only.
accountsRouter.get("/accounts/next-code", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { parentCode, type } = req.query as Record<string, string | undefined>;
    const all = await rawQuery<{ code: string; level: number; parentCode: string | null }>(
      `SELECT code, level, "parentCode" FROM chart_of_accounts
        WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId],
    );
    const allCodes = new Set(all.map((a) => a.code));
    const codeWidth = inferCodeWidth(all.map((a) => a.code));
    if (parentCode) {
      const parent = all.find((a) => a.code === parentCode);
      if (!parent) {
        res.status(404).json({ error: "الحساب الأب غير موجود" });
        return;
      }
      const childCodes = all.filter((a) => a.parentCode === parentCode).map((a) => a.code);
      const r = suggestNextChildCode({ parentCode, parentLevel: parent.level, codeWidth, childCodes, allCodes });
      res.json({ code: r.code, reason: r.reason ?? null, parentCode, level: parent.level + 1 });
      return;
    }
    const rootCodes = all.filter((a) => !a.parentCode || a.level === 1).map((a) => a.code);
    const r = suggestNextRootCode({ codeWidth, rootCodes, allCodes, type: type ?? null });
    res.json({ code: r.code, reason: r.reason ?? null, parentCode: null, level: 1 });
  } catch (err) {
    handleRouteError(err, res, "Next account code error:");
  }
});

// GET /finance/accounts/usage-gaps — accounts the auto-classifier could
// not classify (accountUsage IS NULL). Drives the «classify before you
// post» governance workflow (#1715). Postable, asset/liability accounts
// without a usage are the highest priority since they may be selected as
// payment sources.
accountsRouter.get("/accounts/usage-gaps", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, code, name, type, "allowPosting", "branchId"
         FROM chart_of_accounts
        WHERE "companyId" = $1 AND "deletedAt" IS NULL
          AND "accountUsage" IS NULL
        ORDER BY ("allowPosting" = true) DESC, type, code
        LIMIT 1000`,
      [scope.companyId],
    );
    const byType: Record<string, number> = {};
    for (const r of rows) {
      const t = String(r.type ?? "other");
      byType[t] = (byType[t] ?? 0) + 1;
    }
    res.json(maskFields(req, { data: rows, total: rows.length, byType }));
  } catch (err) {
    handleRouteError(err, res, "Usage-gaps report error:");
  }
});

// POST /finance/accounts/classify-usage — backfill `accountUsage` on existing
// accounts from their code/name/type via classifyAccountUsage (#1715 §10
// "تصنيف الحسابات الحالية آلياً"). Only fills NULLs, never overwrites a
// usage an operator already set, so it is safe to re-run. Accounts the
// classifier can't confidently place stay NULL and remain in the usage-gaps
// report for manual classification.
accountsRouter.post("/accounts/classify-usage", authorize({ feature: "finance.accounts", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<{ id: number; code: string | null; name: string | null; type: string | null }>(
      `SELECT id, code, name, type
         FROM chart_of_accounts
        WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "accountUsage" IS NULL`,
      [scope.companyId],
    );
    const updates: { id: number; usage: string }[] = [];
    for (const r of rows) {
      const usage = classifyAccountUsage({ code: r.code, name: r.name, type: r.type });
      if (usage) updates.push({ id: r.id, usage });
    }
    if (updates.length > 0) {
      await withTransaction(async (client) => {
        for (const u of updates) {
          await client.query(
            `UPDATE chart_of_accounts SET "accountUsage" = $1, "updatedAt" = NOW()
               WHERE id = $2 AND "companyId" = $3 AND "accountUsage" IS NULL`,
            [u.usage, u.id, scope.companyId],
          );
        }
      });
      createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId ?? undefined,
        userId: scope.activeAssignmentId ?? 0,
        action: "classify_usage",
        entity: "chart_of_accounts",
        entityId: 0,
        after: { scanned: rows.length, classified: updates.length },
      }).catch((e) => logger.error(e, "classify-usage audit failed"));
    }
    res.json({
      scanned: rows.length,
      classified: updates.length,
      remaining: rows.length - updates.length,
    });
  } catch (err) {
    handleRouteError(err, res, "Classify-usage backfill error:");
  }
});

accountsRouter.get("/accounts", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildCoaScope(scope, filters, "c");
    const { search, type: accountType, postingOnly } = req.query as { search?: string; type?: string; postingOnly?: string };

    let extraWhere = "";
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      extraWhere += ` AND (name ILIKE $${params.length} OR code ILIKE $${params.length})`;
    }
    if (accountType && accountType.trim()) {
      params.push(accountType.trim());
      extraWhere += ` AND type = $${params.length}`;
    }
    if (postingOnly === "true") {
      extraWhere += ` AND "allowPosting" = true`;
    }

    // Was N+1: scalar self-join lookup per child to resolve parentId
    // from parentCode. With LIMIT 5000 that's up to 5000 extra hits
    // against chart_of_accounts.
    //
    // The c."parentId" column is populated by POST /accounts itself
    // (see UPDATE chart_of_accounts SET "parentId" = (SELECT p.id ...)
    // a few handlers below) — so the lookup-by-parentCode was just a
    // safety net for rows where parentId drifted away from the FK.
    // Project c."parentId" directly; the tree-builder on the client
    // (pages/finance/accounts.tsx) treats a NULL parentId as "no
    // parent", which matches the legacy fallback when the lookup
    // returned no row anyway.
    const rows = await rawQuery(
      `SELECT c.* FROM chart_of_accounts c WHERE ${where} AND c."deletedAt" IS NULL${extraWhere} ORDER BY c.code LIMIT 5000`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "accounts list query failed");
  }
});

accountsRouter.post("/accounts", authorize({ feature: "finance.accounts", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const b = zodParse(createAccountSchema.safeParse(req.body ?? {}));
    // Hybrid COA: branchId null = a shared company account; a branchId
    // makes this a branch-specific sub-account that hangs under the shared
    // company tree. Enforce the model invariants so branch accounts can't
    // drift outside the shared tree or onto a foreign company's branch.
    const branchId: number | null = b.branchId ?? null;
    if (branchId !== null) {
      if (!scope.allowedBranches.includes(branchId)) {
        throw new ValidationError("الفرع المحدد خارج نطاق صلاحياتك", {
          field: "branchId",
          fix: "اختر فرعاً ضمن صلاحياتك أو اترك الحساب مشتركاً على مستوى الشركة",
        });
      }
      // The branch must belong to THIS company — a privileged multi-company
      // user could otherwise graft a company-A account onto a company-B branch.
      const [branchRow] = await rawQuery<{ id: number }>(
        `SELECT id FROM branches WHERE id = $1 AND "companyId" = $2`,
        [branchId, scope.companyId],
      );
      if (!branchRow) {
        throw new ValidationError("الفرع لا يتبع الشركة الحالية", {
          field: "branchId",
          fix: "اختر فرعاً تابعاً للشركة الحالية",
        });
      }
      // A branch sub-account must sit under a shared (company-level) parent.
      if (!b.parentCode) {
        throw new ValidationError("الحساب الخاص بالفرع يجب أن يكون فرعياً تحت حساب أب مشترك", {
          field: "parentCode",
          fix: "اختر حساباً أباً مشتركاً على مستوى الشركة",
        });
      }
      const [parentRow] = await rawQuery<{ branchId: number | null }>(
        `SELECT "branchId" FROM chart_of_accounts WHERE code = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [b.parentCode, scope.companyId],
      );
      if (parentRow && parentRow.branchId !== null) {
        throw new ValidationError("يجب أن يكون الحساب الأب مشتركاً على مستوى الشركة", {
          field: "parentCode",
          fix: "اختر حساباً أباً غير مرتبط بفرع",
        });
      }
    }
    if (b.parentCode) {
      await assertValidAccountParent(scope.companyId, b.code, b.type, b.parentCode);
    }

    // ── accountUsage resolution with parent inheritance (#1715) ──────────
    // Load the parent's usage + childrenUsagePolicy to decide how this
    // child is classified. The policy on the PARENT governs the CHILD:
    //   inherit_locked  → child MUST equal parent usage (override rejected)
    //   inherit_default → child = body usage ?? parent usage
    //   manual_required → child must supply usage explicitly
    //   mixed_allowed   → child uses body usage as-is (may be null)
    // When no parent or still unresolved, fall back to the auto-classifier.
    let resolvedUsage: AccountUsage | null = isValidUsage(b.accountUsage) ? b.accountUsage : null;
    let parentPolicy: ChildrenUsagePolicy | null = null;
    if (b.parentCode) {
      const [parent] = await rawQuery<{ accountUsage: string | null; childrenUsagePolicy: string | null }>(
        `SELECT "accountUsage", "childrenUsagePolicy" FROM chart_of_accounts
          WHERE code = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
        [b.parentCode, scope.companyId],
      );
      const parentUsage = isValidUsage(parent?.accountUsage) ? parent!.accountUsage as AccountUsage : null;
      parentPolicy = isValidChildrenPolicy(parent?.childrenUsagePolicy)
        ? parent!.childrenUsagePolicy as ChildrenUsagePolicy
        : DEFAULT_CHILDREN_USAGE_POLICY;
      if (parentPolicy === "inherit_locked") {
        if (resolvedUsage && parentUsage && resolvedUsage !== parentUsage) {
          throw new ValidationError(
            "تصنيف الحساب الأب مقفل — لا يُسمح بتجاوز تصنيف الأبناء",
            { field: "accountUsage", fix: `استخدم نفس تصنيف الأب أو غيّر سياسة الأب` },
          );
        }
        resolvedUsage = parentUsage;
      } else if (parentPolicy === "inherit_default") {
        resolvedUsage = resolvedUsage ?? parentUsage;
      } else if (parentPolicy === "manual_required") {
        if (!resolvedUsage) {
          throw new ValidationError(
            "سياسة الحساب الأب تتطلب تحديد تصنيف الحساب يدوياً",
            { field: "accountUsage", fix: "اختر تصنيف استخدام الحساب (صندوق/بنك/عهدة/…)" },
          );
        }
      }
      // mixed_allowed: leave resolvedUsage as the body value (may be null).
    }
    if (!resolvedUsage) {
      resolvedUsage = classifyAccountUsage({ code: b.code, type: b.type, name: b.name });
    }
    const childrenPolicy: ChildrenUsagePolicy = isValidChildrenPolicy(b.childrenUsagePolicy)
      ? b.childrenUsagePolicy
      : DEFAULT_CHILDREN_USAGE_POLICY;

    const [row] = await rawQuery<ChartOfAccountsRow>(
      `INSERT INTO chart_of_accounts ("companyId", "branchId", code, name, type, "parentCode", "nameEn", nature, "allowPosting", "isAnalytical", "accountUsage", "childrenUsagePolicy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT ("companyId", code) DO NOTHING
       RETURNING *`,
      [scope.companyId, branchId, b.code, b.name, b.type, b.parentCode ?? null, b.nameEn ?? null, b.nature, b.allowPosting, b.isAnalytical, resolvedUsage, childrenPolicy]
    );
    if (!row) throw new ConflictError("رمز الحساب مستخدم مسبقاً", { field: "code", fix: "استخدم رمزاً مختلفاً للحساب" });

    // Compute parentId from parentCode
    if (b.parentCode) {
      await rawExecute(
        `UPDATE chart_of_accounts SET "parentId" = (
          SELECT p.id FROM chart_of_accounts p WHERE p.code = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL
        ) WHERE id = $3`,
        [b.parentCode, scope.companyId, row.id]
      );
      // COA-1: a parent account must not stay postable once it has children
      // — otherwise any roll-up report that sums parent + descendant
      // accounts double-counts the parent's own postings. Flip
      // allowPosting=false on first child add. Idempotent: the
      // AND "allowPosting" = true clause makes subsequent child adds on the
      // same parent no-ops.
      await rawExecute(
        `UPDATE chart_of_accounts SET "allowPosting" = false
         WHERE "companyId" = $1 AND code = $2 AND "allowPosting" = true AND "deletedAt" IS NULL`,
        [scope.companyId, b.parentCode]
      );
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "account.created",
      entity: "chart_of_accounts",
      entityId: row.id,
      details: JSON.stringify({ code: b.code, name: b.name, type: b.type }),
    }).catch((err) => pushToDLQ("event", { action: "account.created", entityId: row.id }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "chart_of_accounts",
      entityId: row.id,
      after: { code: b.code, name: b.name, type: b.type },
    }).catch((err) => logger.error(err, "[audit] account.created:"));

    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create account error:");
  }
});

accountsRouter.patch("/accounts/:id", authorize({ feature: "finance.accounts", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const b = zodParse(updateAccountSchema.safeParse(req.body ?? {}));

    // SUB-1: when the parent link or the account type changes, re-validate
    // the effective parent — it must exist, not create a cycle, and share
    // the account's type.
    if (b.parentCode !== undefined || b.type !== undefined) {
      const [existing] = await rawQuery<{ code: string; type: string; parentCode: string | null }>(
        `SELECT code, type, "parentCode" FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!existing) throw new NotFoundError("الحساب غير موجود");

      // COA-4: changing an account's `type` retroactively re-classifies every
      // posting already booked to it — any financial statement built on
      // `type` would silently change. Refuse a type change once the account
      // carries journal lines (mirrors the DELETE handler's usage guard);
      // correct via a new correctly-typed account + a reversing entry.
      if (b.type !== undefined && b.type !== existing.type) {
        const [typeUsage] = await rawQuery<JournalCountRow>(
          `SELECT COUNT(*) AS cnt FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl."journalId"
           WHERE jl."accountCode" = $1 AND jl."deletedAt" IS NULL AND je."companyId" = $2 AND je."deletedAt" IS NULL`,
          [existing.code, scope.companyId],
        );
        if (Number(typeUsage?.cnt ?? 0) > 0) {
          throw new ConflictError(
            `لا يمكن تغيير نوع الحساب "${existing.code}" — مرتبط به ${typeUsage.cnt} سطر في القيود المحاسبية`,
            {
              field: "type",
              fix: "النوع جزء من التصنيف المحاسبي؛ أنشئ حساباً جديداً بالنوع الصحيح وأجرِ ترحيلاً تصحيحياً",
              meta: { journalLinesCount: Number(typeUsage.cnt) },
            },
          );
        }
      }

      const effectiveType = b.type ?? existing.type;
      const effectiveParentCode = b.parentCode !== undefined ? b.parentCode : existing.parentCode;
      if (effectiveParentCode) {
        await assertValidAccountParent(scope.companyId, existing.code, effectiveType, effectiveParentCode);
      }
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    const addField = (col: string, val: unknown) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("name", b.name);
    addField("type", b.type);
    addField("parentCode", b.parentCode);
    addField("nameEn", b.nameEn);
    addField("nature", b.nature);
    addField("accountUsage", b.accountUsage);
    addField("childrenUsagePolicy", b.childrenUsagePolicy);
    addField("allowPosting", b.allowPosting);
    addField("isAnalytical", b.isAnalytical);
    if (fields.length === 0) {
      throw new ValidationError("لا توجد بيانات للتحديث", {
        field: "body",
        fix: "أرسل حقلاً واحداً على الأقل لتحديثه",
      });
    }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<ChartOfAccountsRow>(`UPDATE chart_of_accounts SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL RETURNING *`, params);
    if (rows.length === 0) throw new NotFoundError("الحساب غير موجود");

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "account.updated",
      entity: "chart_of_accounts",
      entityId: id,
      details: JSON.stringify({ fields: Object.keys(b) }),
    }).catch((err) => pushToDLQ("event", { action: "account.updated", entityId: id }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "update",
      entity: "chart_of_accounts",
      entityId: id,
      after: { fields: Object.keys(b) },
    }).catch((err) => logger.error(err, "[audit] account.updated:"));

    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update account error:"); }
});

accountsRouter.delete("/accounts/:id", authorize({ feature: "finance.accounts", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const accountId = parseId(req.params.id, "id");

    const [existing] = await rawQuery<{ id: number; code: string; name: string }>(
      `SELECT id, code, name FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [accountId, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الحساب غير موجود");

    // Referential integrity: refuse delete when journal lines reference this account code.
    const [journalUsage] = await rawQuery<JournalCountRow>(
      `SELECT COUNT(*) AS cnt FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId"
       WHERE jl."accountCode" = $1 AND jl."deletedAt" IS NULL AND je."companyId" = $2 AND je."deletedAt" IS NULL`,
      [existing.code, scope.companyId]
    );
    if (Number(journalUsage?.cnt ?? 0) > 0) {
      throw new ConflictError(
        `لا يمكن حذف الحساب — يوجد ${journalUsage.cnt} سطر في القيود المحاسبية مرتبط بهذا الحساب`,
        {
          field: "accountId",
          fix: "ارحّل/احذف القيود المرتبطة قبل حذف الحساب أو قم بأرشفته فقط",
          meta: { journalLinesCount: Number(journalUsage.cnt) },
        },
      );
    }

    const rows = await rawQuery<IdRow>(
      `UPDATE chart_of_accounts SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [accountId, scope.companyId]
    );
    if (rows.length === 0) throw new NotFoundError("الحساب غير موجود");

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "account.deleted",
      entity: "chart_of_accounts",
      entityId: accountId,
      details: JSON.stringify({ code: existing.code, name: existing.name }),
    }).catch((err) => pushToDLQ("event", { action: "account.deleted", entityId: accountId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "delete",
      entity: "chart_of_accounts",
      entityId: accountId,
      after: { code: existing.code, name: existing.name, hardDelete: true },
    }).catch((err) => logger.error(err, "[audit] account.deleted:"));

    res.json({ message: "تم حذف الحساب" });
  } catch (err) { handleRouteError(err, res, "Delete account error:"); }
});

accountsRouter.get("/journal", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'je."companyId"', branchColumn: 'je."branchId"' });
    const rows = await rawQuery<JournalEntryWithLinesRow>(
      `SELECT je.*, json_agg(jl.*) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE ${where} AND je."deletedAt" IS NULL
       GROUP BY je.id
       ORDER BY je."createdAt" DESC LIMIT 100`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "journal list query failed");
  }
});

accountsRouter.post("/journal", authorize({ feature: "finance.accounts", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { ref, description, lines, date: journalBodyDate } = zodParse(createJournalSchema.safeParse(req.body ?? {}));
    const journalDate = journalBodyDate
      ? toDateISO(journalBodyDate)
      : todayISO();
    const journalPeriodCheck = await checkFinancialPeriodOpen(scope.companyId, journalDate);
    if (!journalPeriodCheck.open) {
      throw new ConflictError(
        `لا يمكن إنشاء قيد في فترة مالية مُقفلة: ${journalPeriodCheck.periodName ?? ""}`,
        {
          field: "date",
          fix: "اختر تاريخاً ضمن فترة مالية مفتوحة، أو اطلب من المدير المالي إعادة فتح الفترة",
          meta: { periodName: journalPeriodCheck.periodName },
        },
      );
    }
    const { financialEngine } = await import("../lib/engines/index.js");
    const idempotencyToken = requestIdempotencyToken(req);
    const journalRef = ref ?? `JE-${idempotencyToken}`;

    if (isDryRun(req)) {
      const totalDebit = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
      const totalCredit = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
      res.json({
        dryRun: true,
        ref: journalRef,
        description: description ?? "",
        postingDate: journalDate,
        lines,
        totals: { totalDebit, totalCredit },
      });
      return;
    }

    const { journalId, alreadyExists } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: journalRef,
      description: description ?? "",
      sourceType: "manual_journal",
      sourceId: 0,
      sourceKey: `finance:manual_je:${journalRef}:${idempotencyToken}`,
      lines,
      postingDate: journalDate,
    });
    markIdempotencyReplay(req, res, alreadyExists);

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "journal.created",
      entity: "journal_entries",
      entityId: journalId,
      details: JSON.stringify({ ref, lineCount: lines.length }),
    }).catch((err) => pushToDLQ("event", { action: "journal.created", entityId: journalId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "journal_entries",
      entityId: journalId,
      after: { ref, lineCount: lines.length, date: journalDate },
    }).catch((err) => logger.error(err, "[audit] journal.created:"));

    const [createdJournal] = await rawQuery<JournalEntryWithLinesRow>(
      `SELECT je.*, json_agg(json_build_object('accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit, 'description', jl.description)) AS lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl."journalId" = je.id AND jl."deletedAt" IS NULL
       WHERE je.id = $1 AND je."companyId" = $2 AND je."deletedAt" IS NULL
       GROUP BY je.id`,
      [journalId, scope.companyId]
    );
    res.status(201).json({ ...(createdJournal || { id: journalId }), idempotentReplay: alreadyExists });
  } catch (err) {
    handleRouteError(err, res, "Create journal error:");
  }
});

// NOTE: This `POST /journal` (feature=finance.accounts) and the one in
// finance-journal.ts (feature=finance.journal) are intentionally parallel
// endpoints — they share an HTTP path but have different RBAC features so a
// user with one permission cannot post via the other. Both now route
// through financialEngine.postJournalEntry, so there is no duplicated
// booking logic — only the RBAC wrapping differs. Do NOT consolidate them
// without first auditing every frontend caller, because changing the
// authorize() feature will silently revoke access for some operator roles.

accountsRouter.get("/ledger/:accountCode", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { accountCode } = req.params;
    const { startDate, endDate } = req.query as Record<string, string | undefined>;

    let dateFilter = "";
    const params: unknown[] = [scope.companyId, accountCode];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }

    const [accountRow] = await rawQuery<AccountLedgerHeadRow>(
      `SELECT name, type, code FROM chart_of_accounts WHERE code = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [accountCode, scope.companyId]
    );

    const rows = await rawQuery<LedgerEntryRow>(
      `SELECT je.id, je.ref, je.description, je."createdAt" AS date,
              jl.debit, jl.credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = $2 AND jl."deletedAt" IS NULL
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je."balancesApplied" = true ${dateFilter}
       ORDER BY je."createdAt" ASC LIMIT 5000`,
      params
    );

    let runningBalance = 0;
    const movements = rows.map((r) => {
      runningBalance += Number(r.debit) - Number(r.credit);
      return { ...r, runningBalance };
    });

    const totalDebit = rows.reduce((s: number, r) => s + Number(r.debit), 0);
    const totalCredit = rows.reduce((s: number, r) => s + Number(r.credit), 0);

    res.json(maskFields(req, {
      account: { code: accountCode, name: accountRow?.name, type: accountRow?.type },
      entries: movements,
      summary: { totalDebit, totalCredit, balance: totalDebit - totalCredit, count: movements.length }
    }));
  } catch (err) {
    handleRouteError(err, res, "Ledger error:");
  }
});

accountsRouter.get("/stats", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [inv] = await rawQuery<FinanceStatsRow>(
      `SELECT COALESCE(SUM(total),0) AS "totalRevenue",
              COALESCE(SUM("paidAmount") FILTER(WHERE "paidAt" >= date_trunc('month', CURRENT_DATE)),0) AS "paidThisMonth",
              COALESCE(SUM(total - "paidAmount") FILTER(WHERE status IN ('sent','partial')),0) AS "pendingAmount",
              COALESCE(SUM(total - "paidAmount") FILTER(WHERE status = 'overdue'),0) AS "overdueAmount"
       FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    res.json(maskFields(req, inv || { totalRevenue: 0, paidThisMonth: 0, pendingAmount: 0, overdueAmount: 0 }));
  } catch (err) { handleRouteError(err, res, "finance stats error"); }
});

accountsRouter.get("/summary", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [inv] = await rawQuery<InvoiceSummaryRow>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total,
              COALESCE(SUM("paidAmount"),0) AS paid,
              COALESCE(SUM(total - "paidAmount") FILTER(WHERE status IN ('sent','partial','overdue')),0) AS outstanding
       FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    const [exp] = await rawQuery<ExpenseSummaryRow>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(jl.debit),0) AS total
       FROM journal_entries je JOIN journal_lines jl ON jl."journalId" = je.id AND jl."deletedAt" IS NULL
       WHERE je."companyId" = $1 AND jl."accountCode" LIKE '5%' AND je."deletedAt" IS NULL AND je."balancesApplied" = true`,
      [scope.companyId]
    );
    res.json(maskFields(req, {
      invoicesCount: Number(inv?.count ?? 0),
      totalRevenue: Number(inv?.total ?? 0),
      totalPaid: Number(inv?.paid ?? 0),
      outstanding: Number(inv?.outstanding ?? 0),
      expensesCount: Number(exp?.count ?? 0),
      totalExpenses: Number(exp?.total ?? 0),
    }));
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TAX CODES — Migration 205.
//
// CRUD for the per-company tax-code registry that drives invoice
// math + ZATCA categorisation. Default Saudi codes (VAT15, VAT0,
// EXEMPT, OOS, RCM15) are seeded by migration 205; tenants can edit
// names/accounts/inclusive defaults or add new codes (e.g. a future
// VAT5 if rates change).
//
// Scoped to feature='finance.accounts' — same RBAC role as chart-of-
// accounts admin.
// ─────────────────────────────────────────────────────────────────────────────

const TAX_TYPES = ["standard", "zero", "exempt", "out_of_scope", "reverse_charge"] as const;

const upsertTaxCodeSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  nameEn: z.string().max(100).optional().nullable(),
  rate: z.coerce.number().min(0).max(100),
  taxType: z.enum(TAX_TYPES),
  accountId: z.coerce.number().optional().nullable(),
  inputAccountId: z.coerce.number().optional().nullable(),
  isInclusiveDefault: zCoerceBoolean().optional().default(false),
  zatcaCategoryCode: z.string().max(10).optional().nullable(),
  zatcaExemptionReason: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  isActive: zCoerceBoolean().optional().default(true),
});

accountsRouter.get("/tax-codes", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { taxType, isActive } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let where = `"companyId" = $1 AND "deletedAt" IS NULL`;
    if (taxType) {
      params.push(taxType);
      where += ` AND "taxType" = $${params.length}`;
    }
    if (isActive === "true" || isActive === "false") {
      params.push(isActive === "true");
      where += ` AND "isActive" = $${params.length}`;
    }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM tax_codes WHERE ${where} ORDER BY "taxType", rate DESC, code ASC LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "List tax codes error:");
  }
});

accountsRouter.get("/tax-codes/:id", authorize({ feature: "finance.accounts", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM tax_codes WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("رمز الضريبة غير موجود");
    res.json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "Get tax code error:");
  }
});

accountsRouter.post("/tax-codes", authorize({ feature: "finance.accounts", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const p = zodParse(upsertTaxCodeSchema.safeParse(req.body));
    const insRes = await rawExecute(
      `INSERT INTO tax_codes (
         "companyId", code, name, "nameEn", rate, "taxType",
         "accountId", "inputAccountId", "isInclusiveDefault",
         "zatcaCategoryCode", "zatcaExemptionReason",
         description, "isActive"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        scope.companyId, p.code, p.name, p.nameEn ?? null, p.rate, p.taxType,
        p.accountId ?? null, p.inputAccountId ?? null, p.isInclusiveDefault ?? false,
        p.zatcaCategoryCode ?? null, p.zatcaExemptionReason ?? null,
        p.description ?? null, p.isActive ?? true,
      ]
    );
    const newId = insRes.insertId;
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM tax_codes WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [newId, scope.companyId]);

    // The tax-codes module caches per (companyId, code) — invalidate
    // so subsequent calls see the new row immediately.
    const { clearTaxCodeCache } = await import("../lib/taxCodes.js");
    clearTaxCodeCache(scope.companyId);

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "tax_codes", entityId: Number(newId),
      after: { code: p.code, name: p.name, rate: p.rate, taxType: p.taxType },
    }).catch((e) => logger.error(e, "tax code audit failed"));

    res.status(201).json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "Create tax code error:");
  }
});

accountsRouter.patch("/tax-codes/:id", authorize({ feature: "finance.accounts", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const p = zodParse(upsertTaxCodeSchema.partial().safeParse(req.body));

    const fields: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
      values.push(val);
      fields.push(`"${col}" = $${values.length}`);
    };
    if (p.code !== undefined) push("code", p.code);
    if (p.name !== undefined) push("name", p.name);
    if (p.nameEn !== undefined) push("nameEn", p.nameEn ?? null);
    if (p.rate !== undefined) push("rate", p.rate);
    if (p.taxType !== undefined) push("taxType", p.taxType);
    if (p.accountId !== undefined) push("accountId", p.accountId ?? null);
    if (p.inputAccountId !== undefined) push("inputAccountId", p.inputAccountId ?? null);
    if (p.isInclusiveDefault !== undefined) push("isInclusiveDefault", p.isInclusiveDefault);
    if (p.zatcaCategoryCode !== undefined) push("zatcaCategoryCode", p.zatcaCategoryCode ?? null);
    if (p.zatcaExemptionReason !== undefined) push("zatcaExemptionReason", p.zatcaExemptionReason ?? null);
    if (p.description !== undefined) push("description", p.description ?? null);
    if (p.isActive !== undefined) push("isActive", p.isActive);
    if (fields.length === 0) throw new ValidationError("لا تغييرات لتطبيقها");
    fields.push(`"updatedAt" = NOW()`);

    values.push(id, scope.companyId);
    const updRes = await rawExecute(
      `UPDATE tax_codes SET ${fields.join(", ")}
        WHERE id = $${values.length - 1} AND "companyId" = $${values.length} AND "deletedAt" IS NULL`,
      values
    );
    if (updRes.affectedRows === 0) throw new NotFoundError("رمز الضريبة غير موجود");

    const { clearTaxCodeCache } = await import("../lib/taxCodes.js");
    clearTaxCodeCache(scope.companyId);

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM tax_codes WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "tax_codes", entityId: id, after: row,
    }).catch((e) => logger.error(e, "tax code audit failed"));
    res.json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "Update tax code error:");
  }
});

accountsRouter.delete("/tax-codes/:id", authorize({ feature: "finance.accounts", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Soft delete only — preserves audit / historical line references.
    const updRes = await rawExecute(
      `UPDATE tax_codes SET "deletedAt" = NOW(), "isActive" = false
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (updRes.affectedRows === 0) throw new NotFoundError("رمز الضريبة غير موجود");
    const { clearTaxCodeCache } = await import("../lib/taxCodes.js");
    clearTaxCodeCache(scope.companyId);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "delete", entity: "tax_codes", entityId: id,
    }).catch((e) => logger.error(e, "tax code audit failed"));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "Delete tax code error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WHT CATEGORIES — Migration 208 (Saudi Withholding Tax).
//
// Per-company registry of WHT rates. Each row maps a ZATCA category
// (royalties / technical_services / management_fees / etc.) to a
// rate + a payable account. The defaults are seeded for every
// company by migration 208; tenants edit them when treaty (DTAA)
// rates apply or to point at their own GL accounts.
// ─────────────────────────────────────────────────────────────────────────────

const WHT_APPLIES_TO = [
  "royalties", "technical_services", "management_fees",
  "dividends", "interest", "rent_movable",
  "telecommunications", "air_tickets", "freight",
  "insurance_premium", "other",
] as const;

const upsertWhtCategorySchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  nameEn: z.string().max(100).optional().nullable(),
  rate: z.coerce.number().min(0).max(100),
  appliesTo: z.enum(WHT_APPLIES_TO),
  payableAccountId: z.coerce.number().optional().nullable(),
  description: z.string().optional().nullable(),
  isActive: zCoerceBoolean().optional().default(true),
});

accountsRouter.get("/wht-categories", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { appliesTo, isActive } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let where = `"companyId" = $1 AND "deletedAt" IS NULL`;
    if (appliesTo) { params.push(appliesTo); where += ` AND "appliesTo" = $${params.length}`; }
    if (isActive === "true" || isActive === "false") {
      params.push(isActive === "true");
      where += ` AND "isActive" = $${params.length}`;
    }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM wht_categories WHERE ${where} ORDER BY "appliesTo", rate DESC, code LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "List WHT categories error:");
  }
});

accountsRouter.get("/wht-categories/:id", authorize({ feature: "finance.accounts", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM wht_categories WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("فئة الاستقطاع غير موجودة");
    res.json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "Get WHT category error:");
  }
});

accountsRouter.post("/wht-categories", authorize({ feature: "finance.accounts", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const p = zodParse(upsertWhtCategorySchema.safeParse(req.body));
    const insRes = await rawExecute(
      `INSERT INTO wht_categories (
         "companyId", code, name, "nameEn", rate, "appliesTo",
         "payableAccountId", description, "isActive"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [scope.companyId, p.code, p.name, p.nameEn ?? null, p.rate, p.appliesTo,
       p.payableAccountId ?? null, p.description ?? null, p.isActive ?? true]
    );
    const newId = insRes.insertId;
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM wht_categories WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [newId, scope.companyId]);

    const { clearWhtCache } = await import("../lib/withholdingTax.js");
    clearWhtCache(scope.companyId);

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "wht_categories", entityId: Number(newId),
      after: { code: p.code, rate: p.rate, appliesTo: p.appliesTo },
    }).catch((e) => logger.error(e, "WHT category audit failed"));

    res.status(201).json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "Create WHT category error:");
  }
});

accountsRouter.patch("/wht-categories/:id", authorize({ feature: "finance.accounts", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const p = zodParse(upsertWhtCategorySchema.partial().safeParse(req.body));

    const fields: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
      values.push(val); fields.push(`"${col}" = $${values.length}`);
    };
    if (p.code !== undefined) push("code", p.code);
    if (p.name !== undefined) push("name", p.name);
    if (p.nameEn !== undefined) push("nameEn", p.nameEn ?? null);
    if (p.rate !== undefined) push("rate", p.rate);
    if (p.appliesTo !== undefined) push("appliesTo", p.appliesTo);
    if (p.payableAccountId !== undefined) push("payableAccountId", p.payableAccountId ?? null);
    if (p.description !== undefined) push("description", p.description ?? null);
    if (p.isActive !== undefined) push("isActive", p.isActive);
    if (fields.length === 0) throw new ValidationError("لا تغييرات لتطبيقها");
    fields.push(`"updatedAt" = NOW()`);

    values.push(id, scope.companyId);
    const updRes = await rawExecute(
      `UPDATE wht_categories SET ${fields.join(", ")}
        WHERE id = $${values.length - 1} AND "companyId" = $${values.length} AND "deletedAt" IS NULL`,
      values
    );
    if (updRes.affectedRows === 0) throw new NotFoundError("فئة الاستقطاع غير موجودة");

    const { clearWhtCache } = await import("../lib/withholdingTax.js");
    clearWhtCache(scope.companyId);

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM wht_categories WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "wht_categories", entityId: id, after: row,
    }).catch((e) => logger.error(e, "WHT category audit failed"));
    res.json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "Update WHT category error:");
  }
});

accountsRouter.delete("/wht-categories/:id", authorize({ feature: "finance.accounts", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const updRes = await rawExecute(
      `UPDATE wht_categories SET "deletedAt" = NOW(), "isActive" = false
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (updRes.affectedRows === 0) throw new NotFoundError("فئة الاستقطاع غير موجودة");
    const { clearWhtCache } = await import("../lib/withholdingTax.js");
    clearWhtCache(scope.companyId);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "delete", entity: "wht_categories", entityId: id,
    }).catch((e) => logger.error(e, "WHT category audit failed"));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "Delete WHT category error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTING ALLOCATION RULES — Finance Line-Level Allocation Phase 6.
//
// REST CRUD over accounting_allocation_rules (migration 203). Drives the
// resolver (lib/accountingAllocation.ts) — a row written here turns into
// per-line account selection on the next invoice / GRN approval.
//
// Scoped to feature 'finance.accounts' since rule authoring is the
// chart-of-accounts admin's concern (same RBAC role).
// ─────────────────────────────────────────────────────────────────────────────

const ALLOCATION_DOCUMENT_TYPES = [
  "invoice", "credit_memo", "debit_memo",
  "purchase_order", "purchase_request", "grn", "supplier_invoice",
  "expense", "payment", "receipt", "journal_entry",
] as const;

const ALLOCATION_COST_CENTRE_STRATEGIES = [
  "from_vehicle", "from_property", "from_unit", "from_project",
  "from_employee", "from_contract", "from_umrah_agent", "from_umrah_season",
  "explicit", "none",
] as const;

const upsertRuleSchema = z.object({
  name: z.string().min(1, "اسم القاعدة مطلوب"),
  documentType: z.enum(ALLOCATION_DOCUMENT_TYPES, {
    errorMap: () => ({ message: "نوع المستند غير صالح" }),
  }),
  lineType: z.string().optional().nullable(),
  activityType: z.string().optional().nullable(),
  entityType: z.string().optional().nullable(),
  conditionsJson: z.record(z.any()).optional().nullable(),
  debitAccountId: z.coerce.number().optional().nullable(),
  creditAccountId: z.coerce.number().optional().nullable(),
  revenueAccountId: z.coerce.number().optional().nullable(),
  expenseAccountId: z.coerce.number().optional().nullable(),
  assetAccountId: z.coerce.number().optional().nullable(),
  inventoryAccountId: z.coerce.number().optional().nullable(),
  vatAccountId: z.coerce.number().optional().nullable(),
  costCenterStrategy: z.enum(ALLOCATION_COST_CENTRE_STRATEGIES).optional().nullable(),
  dimensionStrategyJson: z.record(z.any()).optional().nullable(),
  autoCreateMissing: zCoerceBoolean().optional().default(false),
  requiresEntityLink: zCoerceBoolean().optional().default(false),
  priority: z.coerce.number().int().optional().default(100),
  isActive: zCoerceBoolean().optional().default(true),
});

// GET /finance/allocation-rules?documentType=invoice&isActive=true
accountsRouter.get("/allocation-rules", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { documentType, isActive } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let where = `"companyId" = $1 AND "deletedAt" IS NULL`;
    if (documentType) {
      params.push(documentType);
      where += ` AND "documentType" = $${params.length}`;
    }
    if (isActive === "true" || isActive === "false") {
      params.push(isActive === "true");
      where += ` AND "isActive" = $${params.length}`;
    }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM accounting_allocation_rules
        WHERE ${where}
        ORDER BY "documentType", priority ASC, id ASC
        LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "List allocation rules error:");
  }
});

// GET /finance/allocation-rules/:id
accountsRouter.get("/allocation-rules/:id", authorize({ feature: "finance.accounts", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM accounting_allocation_rules
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("قاعدة التوجيه غير موجودة");
    res.json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "Get allocation rule error:");
  }
});

// POST /finance/allocation-rules
accountsRouter.post("/allocation-rules", authorize({ feature: "finance.accounts", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const p = zodParse(upsertRuleSchema.safeParse(req.body));

    const insRes = await rawExecute(
      `INSERT INTO accounting_allocation_rules (
         "companyId", name, "documentType", "lineType", "activityType", "entityType",
         "conditionsJson",
         "debitAccountId", "creditAccountId",
         "revenueAccountId", "expenseAccountId", "assetAccountId", "inventoryAccountId", "vatAccountId",
         "costCenterStrategy", "dimensionStrategyJson",
         "autoCreateMissing", "requiresEntityLink",
         priority, "isActive"
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7,
         $8, $9,
         $10, $11, $12, $13, $14,
         $15, $16,
         $17, $18,
         $19, $20
       )`,
      [
        scope.companyId, p.name, p.documentType, p.lineType ?? null, p.activityType ?? null, p.entityType ?? null,
        p.conditionsJson ? JSON.stringify(p.conditionsJson) : null,
        p.debitAccountId ?? null, p.creditAccountId ?? null,
        p.revenueAccountId ?? null, p.expenseAccountId ?? null, p.assetAccountId ?? null,
        p.inventoryAccountId ?? null, p.vatAccountId ?? null,
        p.costCenterStrategy ?? null,
        p.dimensionStrategyJson ? JSON.stringify(p.dimensionStrategyJson) : null,
        p.autoCreateMissing ?? false, p.requiresEntityLink ?? false,
        p.priority ?? 100, p.isActive ?? true,
      ]
    );
    const newId = insRes.insertId;
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM accounting_allocation_rules WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [newId, scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "accounting_allocation_rules", entityId: Number(newId),
      after: { name: p.name, documentType: p.documentType, priority: p.priority },
    }).catch((e) => logger.error(e, "allocation rule audit failed"));

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "finance.allocation_rule.created",
      entity: "accounting_allocation_rules", entityId: Number(newId),
      details: JSON.stringify({ name: p.name, documentType: p.documentType }),
    }).catch((e) => pushToDLQ("event", { action: "finance.allocation_rule.created", entityId: Number(newId) }, e, scope.companyId));

    res.status(201).json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "Create allocation rule error:");
  }
});

// PATCH /finance/allocation-rules/:id
accountsRouter.patch("/allocation-rules/:id", authorize({ feature: "finance.accounts", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const p = zodParse(upsertRuleSchema.partial().safeParse(req.body));

    const fields: string[] = [];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => {
      values.push(val);
      fields.push(`"${col}" = $${values.length}`);
    };
    if (p.name !== undefined) push("name", p.name);
    if (p.documentType !== undefined) push("documentType", p.documentType);
    if (p.lineType !== undefined) push("lineType", p.lineType ?? null);
    if (p.activityType !== undefined) push("activityType", p.activityType ?? null);
    if (p.entityType !== undefined) push("entityType", p.entityType ?? null);
    if (p.conditionsJson !== undefined) push("conditionsJson", p.conditionsJson ? JSON.stringify(p.conditionsJson) : null);
    if (p.debitAccountId !== undefined) push("debitAccountId", p.debitAccountId ?? null);
    if (p.creditAccountId !== undefined) push("creditAccountId", p.creditAccountId ?? null);
    if (p.revenueAccountId !== undefined) push("revenueAccountId", p.revenueAccountId ?? null);
    if (p.expenseAccountId !== undefined) push("expenseAccountId", p.expenseAccountId ?? null);
    if (p.assetAccountId !== undefined) push("assetAccountId", p.assetAccountId ?? null);
    if (p.inventoryAccountId !== undefined) push("inventoryAccountId", p.inventoryAccountId ?? null);
    if (p.vatAccountId !== undefined) push("vatAccountId", p.vatAccountId ?? null);
    if (p.costCenterStrategy !== undefined) push("costCenterStrategy", p.costCenterStrategy ?? null);
    if (p.dimensionStrategyJson !== undefined) push("dimensionStrategyJson", p.dimensionStrategyJson ? JSON.stringify(p.dimensionStrategyJson) : null);
    if (p.autoCreateMissing !== undefined) push("autoCreateMissing", p.autoCreateMissing);
    if (p.requiresEntityLink !== undefined) push("requiresEntityLink", p.requiresEntityLink);
    if (p.priority !== undefined) push("priority", p.priority);
    if (p.isActive !== undefined) push("isActive", p.isActive);

    if (fields.length === 0) throw new ValidationError("لا تغييرات لتطبيقها");
    fields.push(`"updatedAt" = NOW()`);

    values.push(id, scope.companyId);
    const updRes = await rawExecute(
      `UPDATE accounting_allocation_rules
          SET ${fields.join(", ")}
        WHERE id = $${values.length - 1}
          AND "companyId" = $${values.length}
          AND "deletedAt" IS NULL`,
      values
    );
    if (updRes.affectedRows === 0) throw new NotFoundError("قاعدة التوجيه غير موجودة");

    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM accounting_allocation_rules WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]
    );

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "accounting_allocation_rules", entityId: id,
      after: row,
    }).catch((e) => logger.error(e, "allocation rule audit failed"));

    res.json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "Update allocation rule error:");
  }
});

// DELETE /finance/allocation-rules/:id  (soft delete)
accountsRouter.delete("/allocation-rules/:id", authorize({ feature: "finance.accounts", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const updRes = await rawExecute(
      `UPDATE accounting_allocation_rules
          SET "deletedAt" = NOW(), "isActive" = false
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (updRes.affectedRows === 0) throw new NotFoundError("قاعدة التوجيه غير موجودة");

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "delete", entity: "accounting_allocation_rules", entityId: id,
    }).catch((e) => logger.error(e, "allocation rule audit failed"));

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "Delete allocation rule error:");
  }
});

// GET /finance/allocation-results — drilldown into past resolutions.
// Useful for the «show me which rule moved this line» operator query.
accountsRouter.get("/allocation-results", authorize({ feature: "finance.accounts", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { sourceTable, status, ruleId } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let where = `"companyId" = $1`;
    if (sourceTable) {
      params.push(sourceTable);
      where += ` AND "sourceTable" = $${params.length}`;
    }
    if (status) {
      params.push(status);
      where += ` AND "resolutionStatus" = $${params.length}`;
    }
    if (ruleId) {
      params.push(Number(ruleId));
      where += ` AND "ruleId" = $${params.length}`;
    }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM accounting_allocation_results
        WHERE ${where}
        ORDER BY "resolvedAt" DESC
        LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "List allocation results error:");
  }
});

// ── Finance enforce_line_allocation setting (migration 223) ──────────────
//
// GET /finance/settings/enforce-line-allocation
// Returns the resolved value for the caller's company scope (branch row
// overrides company row overrides system-wide default). The handler is
// gated by finance.accounts:list so any finance user can READ the flag
// to render the "enforcement is ON" banner; mutation requires the
// systemCritical finance.accounts:update grant.
accountsRouter.get("/settings/enforce-line-allocation",
  authorize({ feature: "finance.accounts", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { getEnforceLineAllocation } = await import("../lib/accountingAllocation.js");
      const enforce = await getEnforceLineAllocation({ companyId: scope.companyId, branchId: scope.branchId });
      res.json({ enforce, key: "finance.enforce_line_allocation" });
    } catch (err) {
      handleRouteError(err, res, "Get enforce-line-allocation setting error:");
    }
  });

// PUT /finance/settings/enforce-line-allocation { enforce: boolean }
// Writes a company-scoped row to system_settings (branchId NULL). Idempotent.
const enforceSettingSchema = z.object({ enforce: z.boolean() });
accountsRouter.put("/settings/enforce-line-allocation",
  authorize({ feature: "finance.accounts", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const body = zodParse(enforceSettingSchema.safeParse(req.body ?? {}));
      const value = body.enforce ? "true" : "false";
      // UPSERT against the company row. We don't rely on a specific
      // unique index name (table schema has shifted historically);
      // explicit UPDATE-then-INSERT keeps the operation portable.
      const upd = await rawExecute(
        `UPDATE system_settings
            SET value = $1, "updatedAt" = NOW()
          WHERE key = 'finance.enforce_line_allocation'
            AND "companyId" = $2
            AND "branchId" IS NULL`,
        [value, scope.companyId],
      );
      if (upd.affectedRows === 0) {
        await rawExecute(
          `INSERT INTO system_settings ("companyId", "branchId", key, value)
           VALUES ($1, NULL, 'finance.enforce_line_allocation', $2)`,
          [scope.companyId, value],
        );
      }
      createAuditLog({
        companyId: scope.companyId, userId: scope.userId,
        action: "update", entity: "system_settings", entityId: 0,
        after: { key: "finance.enforce_line_allocation", value },
      }).catch((e) => logger.error(e, "enforce-line-allocation audit failed"));
      res.json({ enforce: body.enforce, key: "finance.enforce_line_allocation" });
    } catch (err) {
      handleRouteError(err, res, "Set enforce-line-allocation setting error:");
    }
  });

// GET /finance/allocation-override-log — audit trail of approvals that
// bypassed the enforce flag via finance.allocation.override. Filtered by
// company scope; ordered most-recent first; capped at 500 rows.
accountsRouter.get("/allocation-override-log",
  authorize({ feature: "finance.accounts", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { documentType, documentId } = req.query as Record<string, string | undefined>;
      const params: unknown[] = [scope.companyId];
      let where = `"companyId" = $1`;
      if (documentType) {
        params.push(documentType);
        where += ` AND "documentType" = $${params.length}`;
      }
      if (documentId) {
        params.push(Number(documentId));
        where += ` AND "documentId" = $${params.length}`;
      }
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM allocation_override_log
          WHERE ${where}
          ORDER BY "createdAt" DESC
          LIMIT 500`,
        params,
      );
      res.json(maskFields(req, { data: rows, total: rows.length }));
    } catch (err) {
      handleRouteError(err, res, "List allocation-override-log error:");
    }
  });
