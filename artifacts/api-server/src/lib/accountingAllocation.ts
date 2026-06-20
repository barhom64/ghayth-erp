// ─────────────────────────────────────────────────────────────────────────────
// accountingAllocation.ts
//
// Finance Line-Level Allocation — Phase 5.2 (resolver service).
//
// Centralised resolver that turns a raw line (invoice line, purchase
// order item, expense voucher line, …) into a fully-allocated journal
// posting payload: account, cost centre, dimensions, taxCode, rule
// reference, and a resolution status the operator UI can render.
//
// Reads from accounting_allocation_rules (migration 203). Writes the
// resolution outcome to accounting_allocation_results so the GL can be
// drilled back to "which rule moved this line to which account, and
// who did the override".
//
// This is a PURE function module — no Express, no req/res, no
// authorize. The invoice + purchase route handlers call into it
// before posting; the Posting Preview endpoint (Phase 3) calls into
// it in dry-run mode to surface warnings before approval.
// ─────────────────────────────────────────────────────────────────────────────

import { rawQuery, rawExecute } from "./rawdb.js";
import { logger } from "./logger.js";

// ─── Public types ───────────────────────────────────────────────────────────

export interface AllocationInput {
  companyId: number;
  documentType: string;          // 'invoice' | 'purchase_order' | 'grn' | 'expense' | ...
  lineType?: string;             // 'product' | 'service' | 'asset' | 'fuel' | 'rent' | ...
  activityType?: string;
  entityType?: string;           // 'client' | 'supplier' | 'vehicle' | 'property' | ...
  // Pre-existing hints from the line itself — caller-provided values
  // override rule defaults so the operator can manually pin a line.
  accountCode?: string | null;
  accountId?: number | null;
  costCenterId?: number | null;
  // Optional dimensional context the line already carries; used both
  // for rule matching (conditionsJson) and to fill the journal line.
  dimensions?: {
    branchId?: number | null;
    vehicleId?: number | null;
    propertyId?: number | null;
    unitId?: number | null;
    assetId?: number | null;
    projectId?: number | null;
    employeeId?: number | null;
    driverId?: number | null;
    contractId?: number | null;
    umrahSeasonId?: number | null;
    umrahAgentId?: number | null;
    productId?: number | null;
    clientId?: number | null;
    vendorId?: number | null;
  };
  taxCode?: string | null;
  /** The line that this allocation describes — back-pointer to the
   *  source row so writeResult can UPSERT. */
  sourceTable: string;
  sourceLineId: number;
}

export type AllocationStatus = "resolved" | "unmapped" | "manual_override" | "failed";

export interface AllocationWarning {
  code: string;
  message: string;
}

export interface AllocationResult {
  status: AllocationStatus;
  resolvedAccountCode: string | null;
  resolvedAccountId: number | null;
  costCenterId: number | null;
  dimensions: Required<NonNullable<AllocationInput["dimensions"]>>;
  taxCode: string | null;
  ruleId: number | null;
  warnings: AllocationWarning[];
  /** What the resolver WOULD have picked if no manual override had
   *  been applied. Only populated when status='manual_override' —
   *  used by the "before/after" Manual Overrides report (audit gap
   *  #7 / migration 225). For status='resolved' these equal the
   *  resolvedAccountCode/costCenterId; for status='unmapped' or
   *  'failed' they are null (the resolver had nothing to propose). */
  proposedAccountCode?: string | null;
  proposedAccountId?: number | null;
  proposedCostCenterId?: number | null;
}

// Minimal shape we use from a rule row at resolve-time.
interface AllocationRuleRow {
  id: number;
  name: string;
  documentType: string;
  lineType: string | null;
  activityType: string | null;
  entityType: string | null;
  conditionsJson: Record<string, unknown> | null;
  debitAccountId: number | null;
  creditAccountId: number | null;
  revenueAccountId: number | null;
  expenseAccountId: number | null;
  assetAccountId: number | null;
  inventoryAccountId: number | null;
  vatAccountId: number | null;
  costCenterStrategy: string | null;
  dimensionStrategyJson: Record<string, unknown> | null;
  requiresEntityLink: boolean | null;
  priority: number;
}

// ─── Resolver ───────────────────────────────────────────────────────────────

/**
 * Resolve allocation for a single line.
 *
 * Algorithm:
 *   1. If the caller already pinned an `accountCode` or `accountId`,
 *      that wins → status='manual_override' (still records the result
 *      for audit).
 *   2. Otherwise, fetch all active rules for the company + documentType,
 *      ordered by priority ascending.
 *   3. The first rule whose (lineType, activityType, entityType) match
 *      the input wins. NULL fields on the rule match any input.
 *   4. The matched rule's debit/credit/revenue/expense/asset/inventory
 *      account is picked based on documentType:
 *        invoice → revenueAccountId (CR line)
 *        purchase_order / grn / expense → expenseAccountId
 *          (or inventoryAccountId / assetAccountId per lineTreatment)
 *   5. costCenterId is resolved per `costCenterStrategy`:
 *        from_vehicle   → cost_centers row linked to vehicleId
 *        from_property  → cost_centers row linked to propertyId
 *        from_project   → cost_centers row linked to projectId
 *        explicit       → keep input.costCenterId
 *        none           → null
 *   6. If `requiresEntityLink` and the relevant dimension is missing,
 *      status='unmapped' + warning.
 *   7. If no rule matches, status='unmapped' (caller falls back to a
 *      company-level generic account).
 */
export async function resolveLineAllocation(input: AllocationInput): Promise<AllocationResult> {
  const warnings: AllocationWarning[] = [];

  const dims = normalizeDimensions(input.dimensions);

  // Step 1 — caller-pinned account always wins, but we ALSO run the
  // rule-driven path with the pin stripped so the "Manual Overrides"
  // report can show what the resolver WOULD have picked otherwise
  // (audit gap #7). The proposed fields are then surfaced on
  // accounting_allocation_results via migration 225 columns.
  if (input.accountCode || input.accountId) {
    const ruleProposal = await computeRuleProposal({
      ...input,
      accountCode: undefined,
      accountId: undefined,
    });
    return {
      status: "manual_override",
      resolvedAccountCode: input.accountCode ?? null,
      resolvedAccountId: input.accountId ?? null,
      costCenterId: input.costCenterId ?? null,
      dimensions: dims,
      taxCode: input.taxCode ?? null,
      ruleId: ruleProposal.ruleId,
      warnings,
      proposedAccountCode: ruleProposal.accountCode,
      proposedAccountId: ruleProposal.accountId,
      proposedCostCenterId: ruleProposal.costCenterId,
    };
  }

  // Step 2 — fetch candidate rules.
  const rules = await rawQuery<AllocationRuleRow>(
    `SELECT id, name, "documentType", "lineType", "activityType", "entityType",
            "conditionsJson", "debitAccountId", "creditAccountId",
            "revenueAccountId", "expenseAccountId", "assetAccountId",
            "inventoryAccountId", "vatAccountId",
            "costCenterStrategy", "dimensionStrategyJson",
            "requiresEntityLink", priority
       FROM accounting_allocation_rules
      WHERE "companyId" = $1
        AND "documentType" = $2
        AND "isActive" = true
        AND "deletedAt" IS NULL
      ORDER BY priority ASC, id ASC`,
    [input.companyId, input.documentType]
  );

  // Step 3 — pick the first matching rule.
  const matched = rules.find((r) => ruleMatches(r, input));
  if (!matched) {
    warnings.push({
      code: "no_matching_rule",
      message: `لم تُطابق أي قاعدة توجيه (document=${input.documentType}, line=${input.lineType ?? "—"}, activity=${input.activityType ?? "—"})`,
    });
    return {
      status: "unmapped",
      resolvedAccountCode: null,
      resolvedAccountId: null,
      costCenterId: input.costCenterId ?? null,
      dimensions: dims,
      taxCode: input.taxCode ?? null,
      ruleId: null,
      warnings,
    };
  }

  // Step 4 — pick the account from the matched rule per documentType.
  const accountId = pickAccountFromRule(matched, input.documentType, input.lineType);
  if (!accountId) {
    warnings.push({
      code: "rule_missing_account",
      message: `القاعدة "${matched.name}" مطابِقة لكنها لا تحدد حسابًا لـ${input.documentType}`,
    });
    return {
      status: "unmapped",
      resolvedAccountCode: null,
      resolvedAccountId: null,
      costCenterId: input.costCenterId ?? null,
      dimensions: dims,
      taxCode: input.taxCode ?? null,
      ruleId: matched.id,
      warnings,
    };
  }

  const accountCode = await lookupAccountCode(input.companyId, accountId);

  // Step 5 — cost centre by strategy.
  const costCenterId = await resolveCostCenter(input.companyId, matched.costCenterStrategy, dims, input.costCenterId);

  // Step 6 — requiredEntityLink validation.
  if (matched.requiresEntityLink) {
    const missing = checkRequiredEntity(matched.entityType, dims);
    if (missing) {
      warnings.push({
        code: "missing_required_entity",
        message: `القاعدة "${matched.name}" تشترط ربط ${missing} والبند لا يحمله`,
      });
      return {
        status: "unmapped",
        resolvedAccountCode: null,
        resolvedAccountId: null,
        costCenterId,
        dimensions: dims,
        taxCode: input.taxCode ?? null,
        ruleId: matched.id,
        warnings,
      };
    }
  }

  return {
    status: "resolved",
    resolvedAccountCode: accountCode,
    resolvedAccountId: accountId,
    costCenterId,
    dimensions: dims,
    taxCode: input.taxCode ?? null,
    ruleId: matched.id,
    warnings,
    // For status='resolved' the proposal IS the result — no override
    // happened. Populating both keeps the report query shape uniform.
    proposedAccountCode: accountCode,
    proposedAccountId: accountId,
    proposedCostCenterId: costCenterId,
  };
}

/**
 * Compute what the resolver would have picked WITHOUT any caller-
 * pinned account, returning just the rule-driven account + cost-centre
 * + rule id. Used by resolveLineAllocation to capture the "would have
 * been" half of a manual-override audit row (migration 225).
 *
 * Returns nulls when no rule matches or the rule has no account for
 * this documentType — the manual override is then "purely additive"
 * (the operator pinned a value the resolver couldn't have produced).
 */
async function computeRuleProposal(
  input: AllocationInput,
): Promise<{ accountCode: string | null; accountId: number | null; costCenterId: number | null; ruleId: number | null }> {
  try {
    const dims = normalizeDimensions(input.dimensions);
    const rules = await rawQuery<AllocationRuleRow>(
      `SELECT id, name, "documentType", "lineType", "activityType", "entityType",
              "conditionsJson", "debitAccountId", "creditAccountId",
              "revenueAccountId", "expenseAccountId", "assetAccountId",
              "inventoryAccountId", "vatAccountId",
              "costCenterStrategy", "dimensionStrategyJson",
              "requiresEntityLink", priority
         FROM accounting_allocation_rules
        WHERE "companyId" = $1
          AND "documentType" = $2
          AND "isActive" = true
          AND "deletedAt" IS NULL
        ORDER BY priority ASC, id ASC`,
      [input.companyId, input.documentType],
    );
    const matched = rules.find((r) => ruleMatches(r, input));
    if (!matched) return { accountCode: null, accountId: null, costCenterId: null, ruleId: null };
    const accountId = pickAccountFromRule(matched, input.documentType, input.lineType);
    if (!accountId) return { accountCode: null, accountId: null, costCenterId: null, ruleId: matched.id };
    const accountCode = await lookupAccountCode(input.companyId, accountId);
    const costCenterId = await resolveCostCenter(input.companyId, matched.costCenterStrategy, dims, null);
    return { accountCode, accountId, costCenterId, ruleId: matched.id };
  } catch {
    // The proposal is best-effort metadata; an error here must not
    // break the actual resolution path.
    return { accountCode: null, accountId: null, costCenterId: null, ruleId: null };
  }
}

/**
 * Resolve many lines from one document in a single call. Useful for
 * the invoice/PO approval handler that needs to allocate every line
 * before posting.
 */
export async function resolveDocumentAllocations(
  inputs: AllocationInput[],
): Promise<AllocationResult[]> {
  // Resolved sequentially to keep DB load predictable + warnings in
  // order. Each resolveLineAllocation reads from the same rule set;
  // a fancier implementation could cache rules per (companyId,
  // documentType) for the lifetime of the call, but the rule table
  // is tiny so the cost is negligible.
  const out: AllocationResult[] = [];
  for (const input of inputs) {
    out.push(await resolveLineAllocation(input));
  }
  return out;
}

/**
 * Persist the resolution outcome on accounting_allocation_results.
 * UPSERTs on the unique index `(sourceTable, sourceLineId, companyId)`.
 *
 * Called from the approval handler AFTER the JE is posted so failures
 * don't leave orphan rows. The route may choose not to call this for
 * manual_override results that the operator explicitly pinned —
 * those are already recorded on the source line itself.
 */
export async function writeAllocationResult(input: AllocationInput, result: AllocationResult, actorAssignmentId?: number): Promise<void> {
  // #1945 hardening — this audit write is best-effort by design (the catch
  // below), but when it runs INSIDE a caller's transaction (e.g. the invoice
  // approval flow) a failed INSERT used to leave that transaction ABORTED:
  // the error was swallowed here, then the caller's NEXT statement blew up
  // with «current transaction is aborted» — which is exactly how the missing
  // id-sequence drift (fixed by migration 291) turned every invoice approval
  // into a 500. Guard the INSERT with a SAVEPOINT so a failure rolls back
  // only this statement, never the caller's transaction. Outside a
  // transaction the SAVEPOINT itself fails — harmless, because autocommit
  // already isolates the failed INSERT.
  let sp = false;
  try {
    await rawQuery("SAVEPOINT wa_alloc_result", []);
    sp = true;
  } catch { /* not inside a transaction — autocommit isolation suffices */ }
  try {
    await rawExecute(
      `INSERT INTO accounting_allocation_results (
         "companyId", "sourceTable", "sourceLineId", "documentType",
         "resolvedAccountId", "resolvedAccountCode", "costCenterId",
         "dimensionsJson", "ruleId", "resolutionStatus", "warningsJson",
         "resolvedBy",
         "proposedAccountId", "proposedAccountCode", "proposedCostCenterId",
         "proposedDimensionsJson"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT ("sourceTable", "sourceLineId", "companyId")
       DO UPDATE SET
         "resolvedAccountId" = EXCLUDED."resolvedAccountId",
         "resolvedAccountCode" = EXCLUDED."resolvedAccountCode",
         "costCenterId" = EXCLUDED."costCenterId",
         "dimensionsJson" = EXCLUDED."dimensionsJson",
         "ruleId" = EXCLUDED."ruleId",
         "resolutionStatus" = EXCLUDED."resolutionStatus",
         "warningsJson" = EXCLUDED."warningsJson",
         "resolvedBy" = EXCLUDED."resolvedBy",
         "proposedAccountId" = EXCLUDED."proposedAccountId",
         "proposedAccountCode" = EXCLUDED."proposedAccountCode",
         "proposedCostCenterId" = EXCLUDED."proposedCostCenterId",
         "proposedDimensionsJson" = EXCLUDED."proposedDimensionsJson",
         "resolvedAt" = NOW()`,
      [
        input.companyId,
        input.sourceTable,
        input.sourceLineId,
        input.documentType,
        result.resolvedAccountId,
        result.resolvedAccountCode,
        result.costCenterId,
        JSON.stringify(result.dimensions),
        result.ruleId,
        result.status,
        result.warnings.length > 0 ? JSON.stringify(result.warnings) : null,
        actorAssignmentId ?? null,
        result.proposedAccountId ?? null,
        result.proposedAccountCode ?? null,
        result.proposedCostCenterId ?? null,
        // Proposed dimensions are the same as resolved dimensions —
        // the resolver computes them from the input line, not from the
        // pin. We still store them for query symmetry.
        JSON.stringify(result.dimensions),
      ]
    );
    if (sp) await rawQuery("RELEASE SAVEPOINT wa_alloc_result", []).catch(() => {});
  } catch (err) {
    if (sp) await rawQuery("ROLLBACK TO SAVEPOINT wa_alloc_result", []).catch(() => {});
    logger.error({ err, input }, "[accountingAllocation] writeResult failed");
  }
}

/**
 * Validate that an array of allocation results is OK to post.
 * Returns the list of blocker reasons (empty = OK to post).
 */
export function validateAllocationCompleteness(results: AllocationResult[]): { ok: boolean; blockers: string[] } {
  const blockers: string[] = [];
  for (const r of results) {
    if (r.status === "unmapped" || r.status === "failed") {
      for (const w of r.warnings) blockers.push(w.message);
    }
  }
  return { ok: blockers.length === 0, blockers };
}

/**
 * Read the `finance.enforce_line_allocation` setting for the given
 * scope. Branch row overrides company row overrides system-wide
 * default; if no row exists the function returns `false` (legacy
 * fallback-to-generic-account behavior).
 *
 * Seeded as 'false' system-wide by migration 223; flip to 'true' per
 * company once the chart-of-accounts + allocation rules are mature
 * enough to refuse fallbacks in production.
 */
export async function getEnforceLineAllocation(
  scope: { companyId: number; branchId?: number | null },
): Promise<boolean> {
  try {
    const rows = await rawQuery<{ value: string | null }>(
      `SELECT value FROM system_settings
        WHERE key = 'finance.enforce_line_allocation'
          AND ( ("companyId" = $1 AND "branchId" = $2)
             OR ("companyId" = $1 AND "branchId" IS NULL)
             OR ("companyId" IS NULL AND "branchId" IS NULL) )
        ORDER BY ("branchId" IS NULL) ASC, ("companyId" IS NULL) ASC
        LIMIT 1`,
      [scope.companyId, scope.branchId ?? null],
    );
    const raw = rows[0]?.value?.trim().toLowerCase();
    if (!raw) return false;
    return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
  } catch {
    // system_settings query failed (table missing in dev?) — fail OPEN
    // (allow the legacy fallback). Production deployments must run the
    // migration so this branch is unreachable.
    return false;
  }
}

/**
 * Record an enforce_line_allocation bypass on allocation_override_log.
 * Caller is expected to verify the actor holds the
 * `finance.allocation.override` permission BEFORE invoking this;
 * the audit row just preserves the trail.
 *
 * `blockers` is the list returned by validateAllocationCompleteness;
 * persisted verbatim so reviewers can see exactly what the resolver
 * objected to at approval time even after rules change.
 */
export async function logAllocationOverride(params: {
  companyId: number;
  branchId: number | null;
  actorAssignmentId: number | null;
  actorUserId: number | null;
  documentType: string;
  documentId: number;
  sourceTable: string;
  blockers: string[];
  overrideReason: string;
}): Promise<void> {
  try {
    await rawExecute(
      `INSERT INTO allocation_override_log (
         "companyId", "branchId", "actorAssignmentId", "actorUserId",
         "documentType", "documentId", "sourceTable",
         "blockersJson", "overrideReason"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.companyId,
        params.branchId,
        params.actorAssignmentId,
        params.actorUserId,
        params.documentType,
        params.documentId,
        params.sourceTable,
        JSON.stringify(params.blockers),
        params.overrideReason,
      ],
    );
  } catch (err) {
    logger.error({ err, params: { documentType: params.documentType, documentId: params.documentId } }, "[accountingAllocation] logAllocationOverride failed");
  }
}

// ─── Internals ──────────────────────────────────────────────────────────────

function normalizeDimensions(dims: AllocationInput["dimensions"]): Required<NonNullable<AllocationInput["dimensions"]>> {
  return {
    branchId: dims?.branchId ?? null,
    vehicleId: dims?.vehicleId ?? null,
    propertyId: dims?.propertyId ?? null,
    unitId: dims?.unitId ?? null,
    assetId: dims?.assetId ?? null,
    projectId: dims?.projectId ?? null,
    employeeId: dims?.employeeId ?? null,
    driverId: dims?.driverId ?? null,
    contractId: dims?.contractId ?? null,
    umrahSeasonId: dims?.umrahSeasonId ?? null,
    umrahAgentId: dims?.umrahAgentId ?? null,
    productId: dims?.productId ?? null,
    clientId: dims?.clientId ?? null,
    vendorId: dims?.vendorId ?? null,
  };
}

function ruleMatches(rule: AllocationRuleRow, input: AllocationInput): boolean {
  // NULL on the rule = wildcard (matches any input value).
  if (rule.lineType && rule.lineType !== input.lineType) return false;
  if (rule.activityType && rule.activityType !== input.activityType) return false;
  if (rule.entityType && rule.entityType !== input.entityType) return false;
  // Future: also evaluate conditionsJson (e.g. product.category match).
  // Left as a no-op for Phase 5.2; rules whose conditionsJson is set
  // still match on the structured fields above. A separate v2 will
  // add a generic JSON-path matcher.
  return true;
}

function pickAccountFromRule(rule: AllocationRuleRow, documentType: string, _lineType?: string): number | null {
  switch (documentType) {
    case "invoice":
      return rule.revenueAccountId ?? rule.creditAccountId ?? null;
    case "purchase_order":
    case "grn":
    case "expense":
      // _lineType-aware refinement (inventory vs asset vs expense)
      // happens at the call site since the GRN posting switch is
      // driven by goods_receipt_items.lineTreatment, not by the rule
      // alone. The rule's expenseAccountId is the default fallback.
      return rule.expenseAccountId ?? rule.inventoryAccountId ?? rule.assetAccountId ?? rule.debitAccountId ?? null;
    default:
      return rule.debitAccountId ?? rule.creditAccountId ?? null;
  }
}

async function lookupAccountCode(companyId: number, accountId: number): Promise<string | null> {
  const rows = await rawQuery<{ code: string }>(
    `SELECT code FROM chart_of_accounts WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [accountId, companyId]
  );
  return rows[0]?.code ?? null;
}

async function resolveCostCenter(
  companyId: number,
  strategy: string | null,
  dims: Required<NonNullable<AllocationInput["dimensions"]>>,
  explicitCostCenterId: number | null | undefined,
): Promise<number | null> {
  if (!strategy || strategy === "none") return null;
  if (strategy === "explicit") return explicitCostCenterId ?? null;

  let entityType: string | null = null;
  let entityId: number | null = null;
  switch (strategy) {
    case "from_branch":   entityType = "branch";   entityId = dims.branchId;   break;
    case "from_vehicle":  entityType = "vehicle";  entityId = dims.vehicleId;  break;
    case "from_property": entityType = "property"; entityId = dims.propertyId; break;
    case "from_unit":     entityType = "unit";     entityId = dims.unitId;     break;
    case "from_project":  entityType = "project";  entityId = dims.projectId;  break;
    case "from_employee": entityType = "employee"; entityId = dims.employeeId; break;
    case "from_contract": entityType = "contract"; entityId = dims.contractId; break;
    case "from_umrah_agent":  entityType = "umrah_agent";  entityId = dims.umrahAgentId;  break;
    case "from_umrah_season": entityType = "umrah_season"; entityId = dims.umrahSeasonId; break;
  }
  if (!entityType || !entityId) return null;

  const rows = await rawQuery<{ id: number }>(
    `SELECT id FROM cost_centers
       WHERE "companyId" = $1
         AND "linkedEntityType" = $2
         AND "linkedEntityId" = $3
         AND COALESCE("isActive", true) = true
         AND "deletedAt" IS NULL
       LIMIT 1`,
    [companyId, entityType, entityId]
  );
  return rows[0]?.id ?? null;
}

/**
 * يشتق مركز التكلفة المرتبط بفرع (المركز التلقائي `BR-XXXX` المربوط عبر
 * linkedEntityType='branch'). seam مشترك يستهلكه محرك الرواتب لاستمام بُعد
 * مركز التكلفة على سطور قيد الرواتب دون تكرار منطق البحث في cost_centers.
 * يُرجِع null إن لم يوجد مركز تكلفة للفرع (لا يفرض شيئًا على القيد).
 */
export async function deriveBranchCostCenter(
  companyId: number,
  branchId: number | null | undefined,
): Promise<number | null> {
  if (!branchId) return null;
  return resolveCostCenter(companyId, "from_branch", normalizeDimensions({ branchId }), null);
}

function checkRequiredEntity(entityType: string | null, dims: Required<NonNullable<AllocationInput["dimensions"]>>): string | null {
  if (!entityType) return null;
  switch (entityType) {
    case "vehicle":      return dims.vehicleId  ? null : "vehicleId";
    case "property":     return dims.propertyId ? null : "propertyId";
    case "unit":         return dims.unitId     ? null : "unitId";
    case "asset":        return dims.assetId    ? null : "assetId";
    case "project":      return dims.projectId  ? null : "projectId";
    case "employee":     return dims.employeeId ? null : "employeeId";
    case "driver":       return dims.driverId   ? null : "driverId";
    case "contract":     return dims.contractId ? null : "contractId";
    case "umrah_agent":  return dims.umrahAgentId  ? null : "umrahAgentId";
    case "umrah_season": return dims.umrahSeasonId ? null : "umrahSeasonId";
    case "client":       return dims.clientId  ? null : "clientId";
    case "supplier":     return dims.vendorId  ? null : "vendorId";
  }
  return null;
}

// ── #1945 item 6 — خريطة إيراد المنتج ────────────────────────────────────
// Map productId → the product's mapped revenue account code
// (products."defaultRevenueAccountId", migration 203). Consulted by the
// sales-invoice approval + preview-posting paths for lines whose resolver
// produced no account (no manual pin, no allocation rule) BEFORE falling
// back to the generic company-level invoice_revenue — so each product line
// posts to ITS revenue account with its productId dim, and the preview
// matches what approval will post. Defensive: only postable accounts of
// type 'revenue' qualify; a misconfigured product (e.g. pointing at an
// expense or a header account) is skipped and the caller's generic
// fallback applies — never a wrong-side posting.
export async function getProductRevenueCodes(
  companyId: number,
  productIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const ids = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return map;
  const rows = await rawQuery<{ id: number; code: string; type: string }>(
    `SELECT p.id, coa.code, coa.type
       FROM products p
       JOIN chart_of_accounts coa
         ON coa.id = p."defaultRevenueAccountId"
        AND coa."companyId" = p."companyId"
        AND coa."deletedAt" IS NULL
        AND coa."allowPosting" = true
      WHERE p."companyId" = $1 AND p.id = ANY($2::int[])
        AND p."defaultRevenueAccountId" IS NOT NULL`,
    [companyId, ids],
  );
  for (const r of rows) {
    if (r.type === "revenue") map.set(Number(r.id), r.code);
  }
  return map;
}
