/**
 * Dynamic Analytic Accounts — Issue #2197
 *
 * The GL chart stays flat and clean. Every journal line that needs operational
 * breakdown (by agent, season, branch, employee, import-batch…) references an
 * `analytic_accounts` row. The system creates these rows automatically; the
 * operator links them to parties/seasons/contracts later via مركز التصنيف.
 *
 * Rules:
 *  - A missing party / season NEVER blocks posting. The engine creates a
 *    temporary analytic account with status='needs_linking' and posts normally.
 *  - Re-classification (linking) is a pure analytic update (no GL movement)
 *    unless it also changes the control account — that produces an audited
 *    reclassification journal entry.
 *  - Every create / link / reclassify action writes an audit_logs row.
 */

import { rawQuery, rawExecute } from "../rawdb.js";
import { logger } from "../logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnalyticDimensions {
  companyId: number;
  branchId?: number;
  controlAccountId?: number;
  partyId?: number;
  partyRole?: string;
  parentPartyId?: number;
  seasonId?: number;
  serviceType?: string;
  projectId?: number;
  contractId?: number;
  employeeId?: number;
  custodyId?: number;
  cashboxId?: number;
  bankAccountId?: number;
  sourceModule?: string;
  sourceDocumentId?: number;
  importBatchId?: number;
}

export interface AnalyticAccount {
  id: number;
  companyId: number;
  name: string;
  code: string | null;
  status: "active" | "needs_linking" | "closed" | "archived";
  autoCreated: boolean;
  needsLinking: boolean;
  linkingNote: string | null;
}

export interface ResolveAnalyticOptions {
  dims: AnalyticDimensions;
  /** Human label — used as the account name when auto-created. */
  label?: string;
  /** Caller id for audit log. */
  createdBy?: number;
}

// ─── Resolve / auto-create ────────────────────────────────────────────────────

/**
 * Resolve the best-matching analytic account for the given dimensions.
 * If none exists, creates one automatically with status='active' (or
 * 'needs_linking' when key linking fields like partyId are missing).
 *
 * The returned row is safe to stamp on journal_lines."analyticAccountId".
 */
export async function resolveAnalyticAccount(
  opts: ResolveAnalyticOptions
): Promise<AnalyticAccount> {
  const { dims, label, createdBy } = opts;

  // Build match conditions for existing account
  const conditions: string[] = [`"companyId" = ${dims.companyId}`, `"deletedAt" IS NULL`];
  const matchCols: Array<[string, unknown]> = [];

  if (dims.sourceModule)      matchCols.push(['"sourceModule"',      dims.sourceModule]);
  if (dims.sourceDocumentId)  matchCols.push(['"sourceDocumentId"',  dims.sourceDocumentId]);
  if (dims.importBatchId)     matchCols.push(['"importBatchId"',     dims.importBatchId]);
  if (dims.partyId)           matchCols.push(['"partyId"',           dims.partyId]);
  if (dims.partyRole)         matchCols.push(['"partyRole"',         dims.partyRole]);
  if (dims.seasonId)          matchCols.push(['"seasonId"',          dims.seasonId]);
  if (dims.employeeId)        matchCols.push(['"employeeId"',        dims.employeeId]);
  if (dims.custodyId)         matchCols.push(['"custodyId"',         dims.custodyId]);
  if (dims.branchId)          matchCols.push(['"branchId"',          dims.branchId]);

  if (matchCols.length > 0) {
    for (const [col, val] of matchCols) {
      conditions.push(`${col} = '${String(val).replace(/'/g, "''")}'`);
    }
  }

  const existing = await rawQuery<AnalyticAccount>(
    `SELECT id, "companyId", name, code, status, "autoCreated", "needsLinking", "linkingNote"
     FROM analytic_accounts WHERE ${conditions.join(" AND ")} LIMIT 1`
  );
  if (existing.length > 0) return existing[0];

  // Auto-create
  const needsLinking = !dims.partyId && !dims.employeeId && !dims.custodyId;
  const autoName = label
    ?? buildAutoName(dims);

  const [created] = await rawQuery<AnalyticAccount>(
    `INSERT INTO analytic_accounts (
       "companyId", "branchId", name,
       "controlAccountId", "partyId", "partyRole", "parentPartyId",
       "seasonId", "serviceType", "projectId", "contractId",
       "employeeId", "custodyId", "cashboxId", "bankAccountId",
       "sourceModule", "sourceDocumentId", "importBatchId",
       status, "autoCreated", "needsLinking",
       "linkingNote", "createdBy"
     ) VALUES (
       $1,$2,$3,
       $4,$5,$6,$7,
       $8,$9,$10,$11,
       $12,$13,$14,$15,
       $16,$17,$18,
       $19,true,$20,
       $21,$22
     ) RETURNING id, "companyId", name, code, status, "autoCreated", "needsLinking", "linkingNote"`,
    [
      dims.companyId, dims.branchId ?? null, autoName,
      dims.controlAccountId ?? null, dims.partyId ?? null, dims.partyRole ?? null, dims.parentPartyId ?? null,
      dims.seasonId ?? null, dims.serviceType ?? null, dims.projectId ?? null, dims.contractId ?? null,
      dims.employeeId ?? null, dims.custodyId ?? null, dims.cashboxId ?? null, dims.bankAccountId ?? null,
      dims.sourceModule ?? null, dims.sourceDocumentId ?? null, dims.importBatchId ?? null,
      needsLinking ? "needs_linking" : "active", needsLinking,
      needsLinking
        ? "يحتاج ربطاً بوكيل أو عميل أو طرف — راجع مركز التصنيف والمطابقة"
        : null,
      createdBy ?? null,
    ]
  );

  if (needsLinking) {
    logger.warn(
      `[analytic_accounts] Auto-created analytic account #${created.id} (needs_linking) ` +
      `for module=${dims.sourceModule} doc=${dims.sourceDocumentId} company=${dims.companyId}`
    );
  }

  return created;
}

function buildAutoName(dims: AnalyticDimensions): string {
  const parts: string[] = [];
  if (dims.sourceModule) parts.push(dims.sourceModule);
  if (dims.serviceType)  parts.push(dims.serviceType);
  if (dims.seasonId)     parts.push(`موسم ${dims.seasonId}`);
  if (dims.partyRole)    parts.push(dims.partyRole);
  if (dims.branchId)     parts.push(`فرع ${dims.branchId}`);
  if (parts.length === 0) parts.push(`حساب تحليلي تلقائي`);
  parts.push("/ غير مصنف");
  return parts.join(" / ");
}

// ─── Link analytic account to a party / season / contract ────────────────────

export interface LinkAnalyticOptions {
  analyticAccountId: number;
  companyId: number;
  updatedBy: number;
  reason?: string;
  updates: Partial<{
    partyId: number;
    partyRole: string;
    parentPartyId: number;
    seasonId: number;
    contractId: number;
    projectId: number;
    employeeId: number;
    custodyId: number;
    status: string;
    needsLinking: boolean;
  }>;
}

/**
 * Link a needs_linking analytic account to a party / season / etc.
 * Writes an audit_logs row. Does NOT produce a GL journal entry —
 * the linkage is purely analytical (no control-account change).
 * If the link changes the controlAccountId, the caller must produce a
 * reclassification journal entry manually (see reclassifyAnalyticAccount).
 */
export async function linkAnalyticAccount(opts: LinkAnalyticOptions): Promise<void> {
  const { analyticAccountId, companyId, updatedBy, reason, updates } = opts;

  const [before] = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM analytic_accounts WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
    [analyticAccountId, companyId]
  );
  if (!before) throw new Error(`Analytic account #${analyticAccountId} not found in company ${companyId}`);

  const setClauses: string[] = [`"updatedAt" = NOW()`];
  const params: unknown[] = [analyticAccountId, companyId];
  let pi = 3;

  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) {
      setClauses.push(`"${k}" = $${pi++}`);
      params.push(v);
    }
  }

  // Auto-clear needsLinking when a partyId is now set
  const newPartyId = updates.partyId ?? (before.partyId as number | null);
  if (newPartyId && (before.needsLinking as boolean)) {
    const alreadyClearing = "needsLinking" in updates;
    if (!alreadyClearing) {
      setClauses.push(`"needsLinking" = false`);
      setClauses.push(`status = 'active'`);
    }
  }

  await rawExecute(
    `UPDATE analytic_accounts SET ${setClauses.join(", ")} WHERE id = $1 AND "companyId" = $2`,
    params
  );

  await rawExecute(
    `INSERT INTO audit_logs ("companyId","userId",action,entity,"entityId","before","after")
     VALUES ($1,$2,'link_analytic','analytic_accounts',$3,$4,$5)`,
    [
      companyId, updatedBy, analyticAccountId,
      JSON.stringify(before),
      JSON.stringify({ ...updates, reason }),
    ]
  ).catch((e) => logger.error(e, "[analytic_accounts] audit insert failed"));
}

// ─── مركز التصنيف والمطابقة query helpers ─────────────────────────────────────

export interface ClassificationCenterSummary {
  needsLinkingCount: number;
  postingFailuresUnresolved: number;
  postingFailuresByCategory: Array<{ category: string; count: number }>;
  analyticNeedsLinking: Array<{
    id: number;
    name: string;
    sourceModule: string | null;
    seasonId: number | null;
    createdAt: string;
    linkingNote: string | null;
  }>;
}

export async function getClassificationCenterSummary(
  companyId: number
): Promise<ClassificationCenterSummary> {
  const [{ count: needsLinkingCount }] = await rawQuery<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM analytic_accounts
     WHERE "companyId" = $1 AND "needsLinking" = true AND "deletedAt" IS NULL`,
    [companyId]
  );

  const [{ count: postingFailuresUnresolved }] = await rawQuery<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM financial_posting_failures
     WHERE "companyId" = $1 AND resolved = false`,
    [companyId]
  );

  const postingFailuresByCategory = await rawQuery<{ category: string; count: string }>(
    `SELECT COALESCE("failureCategory",'other') AS category, COUNT(*)::text AS count
     FROM financial_posting_failures
     WHERE "companyId" = $1 AND resolved = false
     GROUP BY 1 ORDER BY 2 DESC`,
    [companyId]
  );

  const analyticNeedsLinking = await rawQuery<{
    id: number; name: string; sourceModule: string | null;
    seasonId: number | null; createdAt: string; linkingNote: string | null;
  }>(
    `SELECT id, name, "sourceModule", "seasonId", "createdAt", "linkingNote"
     FROM analytic_accounts
     WHERE "companyId" = $1 AND "needsLinking" = true AND "deletedAt" IS NULL
     ORDER BY "createdAt" DESC LIMIT 100`,
    [companyId]
  );

  return {
    needsLinkingCount: Number(needsLinkingCount),
    postingFailuresUnresolved: Number(postingFailuresUnresolved),
    postingFailuresByCategory: postingFailuresByCategory.map(r => ({
      category: r.category,
      count: Number(r.count),
    })),
    analyticNeedsLinking,
  };
}
