// ─────────────────────────────────────────────────────────────────────────────
// lib/finance/datafixInventory.ts  (#2090 / FIN-DATAFIX / FIN-SUB-02 — READ ONLY)
// ─────────────────────────────────────────────────────────────────────────────
// WHAT:  a STRICTLY READ-ONLY inventory of legacy per-entity subsidiary accounts
//        (subsidiary_accounts → chart_of_accounts) that the PRE-#2070
//        createSubsidiaryAccountsForEntity opened under the WRONG control parent.
//
// BACKGROUND: before #2070 the auto-provisioner hardcoded parents that matched
//        neither the default seed nor the SOCPA chart:
//          - client receivable → 1111 (الصندوق الرئيسي / main CASH)  — should be 1130 (AR)
//          - employee advance   → 1121 (a bank)                       — should be the advances acct
//          - employee/driver custody → 1131 (clients)                 — should be the custody acct
//          - vendor payable     → 2102 (nonexistent)                  — should be 2110/2111 (AP)
//        #2070 fixed NEW creation (intent-derived parent). The HISTORICAL sheets
//        remain misparented; this module finds them so a finance-reviewed
//        correction can be PLANNED. It NEVER moves, re-parents, or touches
//        balances — report only (#2090 owner-approved scope).
//
// SAFETY: the DB function `buildMisparentedSubsidiaryInventory` issues a SINGLE
//        read-only SELECT. There is NO INSERT/UPDATE/DELETE anywhere in this
//        file. The classification helpers below are PURE (no DB, no I/O) so the
//        wrong→correct mapping, severity, and autoFixable rules are unit-tested
//        in isolation (tests/unit/datafixInventory.test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { rawQuery } from "../rawdb.js";

// ── Entity types that get per-entity subsidiary sheets (mirrors
//    createSubsidiaryAccountsForEntity in routes/accounting-engine.ts). ───────
export type SubsidiaryEntityType =
  | "employee"
  | "client"
  | "vendor"
  | "vehicle"
  | "driver"
  | "umrah_agent";

export type Severity = "high" | "medium" | "low";

/**
 * The CORRECT control parent INTENT for each (entityType, accountType). This is
 * the SAME intent (type + name keywords) + literal fallbackCode that the
 * post-#2070 `resolveSubsidiaryParent` / `createSubsidiaryAccountsForEntity`
 * uses, so the report's "proposed correct parent" matches the LIVE provisioning
 * logic — not a guess. Keep this table in lockstep with accounting-engine.ts.
 */
export interface ParentIntent {
  type: "asset" | "liability" | "expense" | "revenue";
  keywords: string[];
  /** literal fallback control code (last resort, mirrors the live code) */
  fallbackCode: string;
}

export const CORRECT_PARENT_INTENT: Record<
  string, // `${entityType}:${accountType}`
  ParentIntent
> = {
  "employee:advance": { type: "asset", keywords: ["سلف الموظف", "سلف"], fallbackCode: "1140" },
  "employee:custody": { type: "asset", keywords: ["عهد مالية للموظف"], fallbackCode: "1142" },
  "client:receivable": { type: "asset", keywords: ["الذمم المدينة", "العملاء"], fallbackCode: "1130" },
  "vendor:payable": { type: "liability", keywords: ["الذمم الدائنة", "الموردون"], fallbackCode: "2110" },
  "driver:custody": { type: "asset", keywords: ["العهد النقدية", "عهد"], fallbackCode: "1113" },
  "vehicle:custody": { type: "asset", keywords: ["العهد النقدية"], fallbackCode: "1113" },
  "vehicle:fuel": { type: "expense", keywords: ["الوقود", "وقود"], fallbackCode: "5510" },
  "vehicle:maintenance": { type: "expense", keywords: ["صيانة وإصلاح المركبات", "صيانة"], fallbackCode: "5520" },
  "vehicle:depreciation": { type: "expense", keywords: ["إهلاك المركبات", "إهلاك"], fallbackCode: "5710" },
  "umrah_agent:revenue": { type: "revenue", keywords: ["إيرادات الخدمات", "عمرة"], fallbackCode: "4130" },
};

/**
 * The WRONG control parent codes the pre-#2070 code hardcoded. A subsidiary
 * sheet whose CURRENT parent is one of these (or a code in that parent's
 * family / prefix) is a misparenting suspect. Used both to document the bug and
 * by the DB query's suspicion filter.
 *  - 1111 family: main cash (client receivable was minted here).
 *  - 1121 family: a bank   (employee advance was minted here).
 *  - 1131 family: clients  (custody was minted here).
 *  - 2102 family: nonexistent vendor AP literal (vendor payable was minted here).
 */
export const WRONG_PARENT_CODES = ["1111", "1121", "1131", "2102"] as const;

/**
 * PURE: the wrong→correct control parent intent for a subsidiary sheet, derived
 * from (entityType, accountType) via the live #2070 logic. Returns null when the
 * (entityType, accountType) pair has no provisioning rule (caller skips it).
 */
export function proposedParentIntent(
  entityType: string,
  accountType: string,
): ParentIntent | null {
  return CORRECT_PARENT_INTENT[`${entityType}:${accountType}`] ?? null;
}

/**
 * PURE: classify the suspicion severity of a misparented sheet.
 *  - high   : has a non-zero balance OR has posted journal lines (real money at
 *             risk — a reparent/transfer must be finance-reviewed).
 *  - medium : no balance/posting but has linked (e.g. unposted/draft) lines.
 *  - low    : dormant — no balance, no lines at all (cheap to fix).
 */
export function classifySeverity(input: {
  currentBalance: number;
  postedLines: number;
  linkedLines: number;
}): Severity {
  if (input.currentBalance !== 0 || input.postedLines > 0) return "high";
  if (input.linkedLines > 0) return "medium";
  return "low";
}

/**
 * PURE: a sheet is AUTO-FIXABLE (a future safe reparent, NOT done here) ONLY
 * when it carries zero balance AND zero posted journal lines — i.e. moving it to
 * the correct parent changes no balances and rewrites no history. Anything with
 * money or postings needs a finance-reviewed transfer journal entry instead.
 */
export function isAutoFixable(input: {
  currentBalance: number;
  postedLines: number;
}): boolean {
  return input.currentBalance === 0 && input.postedLines === 0;
}

// ── Inventory row + summary shapes ───────────────────────────────────────────
export interface MisparentedSubsidiaryRow {
  subsidiaryId: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  entityType: string;
  accountType: string;
  entityId: number;
  entityName: string | null;
  currentParentCode: string | null;
  currentParentName: string | null;
  proposedParentCode: string | null;
  proposedParentName: string | null;
  currentBalance: number;
  postedLines: number;
  linkedLines: number;
  suspicionReason: string;
  severity: Severity;
  autoFixable: boolean;
}

export interface MisparentedSubsidiaryInventory {
  rows: MisparentedSubsidiaryRow[];
  summary: {
    total: number;
    autoFixable: number;
    needsReview: number;
    bySeverity: { high: number; medium: number; low: number };
    totalBalanceAtRisk: number;
  };
}

/**
 * READ-ONLY: build the inventory of misparented per-entity subsidiary sheets for
 * one company. The SELECT joins subsidiary_accounts → chart_of_accounts (sheet)
 * → chart_of_accounts (current parent), resolves the PROPOSED correct parent via
 * the same intent search the live provisioner uses, counts journal_lines (total
 * + posted via journal_entries.balancesApplied), and reads each sheet's
 * currentBalance. Filters to entity-linked sheets whose CURRENT parent is one of
 * the WRONG codes/families OR differs from the resolved correct parent.
 *
 * NO writes. NO transaction-with-write. Company-scoped on `companyId`.
 */
export async function buildMisparentedSubsidiaryInventory(
  companyId: number,
): Promise<MisparentedSubsidiaryInventory> {
  type DbRow = {
    subsidiaryId: number;
    accountId: number;
    accountCode: string;
    accountName: string;
    entityType: string;
    accountType: string;
    entityId: number;
    entityName: string | null;
    currentParentCode: string | null;
    currentParentName: string | null;
    currentBalance: string | number;
    postedLines: string | number;
    linkedLines: string | number;
  };

  // The intent table for the SQL side, built from CORRECT_PARENT_INTENT so the
  // proposed parent resolved in SQL matches the pure helper exactly.
  // (Passed as a VALUES list so the query stays a single read-only SELECT.)
  const intentValues = Object.entries(CORRECT_PARENT_INTENT)
    .map(([key, intent]) => {
      const [entityType, accountType] = key.split(":");
      const kws = `ARRAY[${intent.keywords.map((k) => `'${k.replace(/'/g, "''")}'`).join(",")}]`;
      return `('${entityType}','${accountType}','${intent.type}','${intent.fallbackCode}',${kws})`;
    })
    .join(",\n      ");

  const wrongCodesArray = `ARRAY[${WRONG_PARENT_CODES.map((c) => `'${c}'`).join(",")}]`;

  // NOTE: STRICTLY a read-only SELECT (WITH ... SELECT). No write keyword.
  const sql = `
    WITH expected(entity_type, account_type, exp_type, fallback_code, kws) AS (VALUES
      ${intentValues}
    ),
    sub AS (
      SELECT
        sa.id AS "subsidiaryId", sa."companyId", sa."entityType", sa."entityId", sa."accountType",
        acc.id AS "accountId", acc.code AS "accountCode", acc.name AS "accountName", acc.type AS acc_type,
        COALESCE(acc."currentBalance", 0) AS "currentBalance",
        p.code AS "currentParentCode", p.name AS "currentParentName"
      FROM subsidiary_accounts sa
      JOIN chart_of_accounts acc ON acc.id = sa."accountId" AND acc."deletedAt" IS NULL AND acc."companyId" = sa."companyId"
      LEFT JOIN chart_of_accounts p ON p.id = acc."parentId" AND p."companyId" = sa."companyId"
      WHERE sa."companyId" = $1 AND sa."deletedAt" IS NULL AND sa."isActive" = true
    ),
    resolved AS (
      SELECT s.*,
        (SELECT k.code FROM chart_of_accounts k
           WHERE k."companyId" = s."companyId" AND k.type = e.exp_type AND k."deletedAt" IS NULL
             AND EXISTS (SELECT 1 FROM unnest(e.kws) kw WHERE k.name LIKE '%' || kw || '%')
           ORDER BY length(k.code) ASC, k.code ASC LIMIT 1) AS expected_by_intent_code,
        (SELECT k.code FROM chart_of_accounts k
           WHERE k."companyId" = s."companyId" AND k.code = e.fallback_code AND k."deletedAt" IS NULL
           LIMIT 1) AS expected_by_code
      FROM sub s
      JOIN expected e ON e.entity_type = s."entityType" AND e.account_type = s."accountType"
    ),
    counted AS (
      SELECT r.*,
        COALESCE(r.expected_by_intent_code, r.expected_by_code) AS "proposedParentCode",
        (SELECT count(*) FROM journal_lines jl WHERE jl."accountCode" = r."accountCode") AS "linkedLines",
        (SELECT count(*) FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl."journalId"
          WHERE jl."accountCode" = r."accountCode" AND je."deletedAt" IS NULL AND je."balancesApplied" = true) AS "postedLines",
        CASE r."entityType"
          WHEN 'client'      THEN (SELECT name FROM clients       WHERE id = r."entityId" AND "companyId" = r."companyId")
          WHEN 'vendor'      THEN (SELECT name FROM suppliers     WHERE id = r."entityId" AND "companyId" = r."companyId")
          WHEN 'employee'    THEN (SELECT name FROM employees     WHERE id = r."entityId")
          WHEN 'driver'      THEN (SELECT name FROM fleet_drivers WHERE id = r."entityId")
          WHEN 'vehicle'     THEN (SELECT "plateNumber" FROM fleet_vehicles WHERE id = r."entityId")
          WHEN 'umrah_agent' THEN (SELECT name FROM umrah_agents  WHERE id = r."entityId")
          ELSE NULL END AS "entityName"
      FROM resolved r
    )
    SELECT
      "subsidiaryId", "accountId", "accountCode", "accountName",
      "entityType", "accountType", "entityId", "entityName",
      "currentParentCode", "currentParentName",
      "currentBalance", "postedLines", "linkedLines"
    FROM counted
    WHERE "proposedParentCode" IS NOT NULL
      AND "currentParentCode" IS DISTINCT FROM "proposedParentCode"
      AND (
        "currentParentCode" IS NULL
        OR EXISTS (SELECT 1 FROM unnest(${wrongCodesArray}) w
                   WHERE "currentParentCode" = w OR "currentParentCode" LIKE w || '%')
      )
    ORDER BY ("currentBalance" <> 0 OR "postedLines" > 0) DESC, "accountCode" ASC
  `;

  const dbRows = await rawQuery<DbRow>(sql, [companyId]);

  // Resolve the proposed parent NAME from the same intent for display, plus the
  // pure severity/autoFixable classification. We re-resolve the proposed code
  // via the pure helper so it stays in lockstep (the SQL resolved the code; we
  // attach the human label from the chart in a second pass below is avoided —
  // the SQL already returned currentParent name; the proposed name is looked up
  // once per distinct code).
  const proposedNameByCode = await resolveProposedParentNames(companyId, dbRows);

  const rows: MisparentedSubsidiaryRow[] = dbRows.map((r) => {
    const currentBalance = Number(r.currentBalance) || 0;
    const postedLines = Number(r.postedLines) || 0;
    const linkedLines = Number(r.linkedLines) || 0;
    const intent = proposedParentIntent(r.entityType, r.accountType);
    const proposedParentCode = intent?.fallbackCode ?? null;
    // prefer the SQL-resolved code (intent-or-fallback) if present
    const sqlProposed = (r as unknown as { proposedParentCode?: string | null }).proposedParentCode ?? null;
    const finalProposedCode = sqlProposed ?? proposedParentCode;
    const severity = classifySeverity({ currentBalance, postedLines, linkedLines });
    const autoFixable = isAutoFixable({ currentBalance, postedLines });
    const suspicionReason =
      `حساب «${r.accountType}» للكيان «${r.entityType}» تحت ` +
      `«${r.currentParentName ?? r.currentParentCode ?? "بلا أصل"}» بدل الأصل الضابط الصحيح`;
    return {
      subsidiaryId: r.subsidiaryId,
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      entityType: r.entityType,
      accountType: r.accountType,
      entityId: r.entityId,
      entityName: r.entityName ?? null,
      currentParentCode: r.currentParentCode ?? null,
      currentParentName: r.currentParentName ?? null,
      proposedParentCode: finalProposedCode,
      proposedParentName: finalProposedCode ? proposedNameByCode.get(finalProposedCode) ?? null : null,
      currentBalance,
      postedLines,
      linkedLines,
      suspicionReason,
      severity,
      autoFixable,
    };
  });

  return { rows, summary: summarize(rows) };
}

/**
 * READ-ONLY helper: look up the display NAME for each distinct proposed parent
 * code (a single SELECT against chart_of_accounts). Pure-data fan-in; no writes.
 */
async function resolveProposedParentNames(
  companyId: number,
  dbRows: Array<{ entityType: string; accountType: string } & Record<string, unknown>>,
): Promise<Map<string, string>> {
  const codes = new Set<string>();
  for (const r of dbRows) {
    const sqlProposed = (r as { proposedParentCode?: string | null }).proposedParentCode ?? null;
    const intent = proposedParentIntent(r.entityType, r.accountType);
    const code = sqlProposed ?? intent?.fallbackCode ?? null;
    if (code) codes.add(code);
  }
  if (codes.size === 0) return new Map();
  const names = await rawQuery<{ code: string; name: string }>(
    `SELECT code, name FROM chart_of_accounts
      WHERE "companyId" = $1 AND code = ANY($2) AND "deletedAt" IS NULL`,
    [companyId, [...codes]],
  );
  return new Map(names.map((n) => [n.code, n.name]));
}

/** PURE: roll the inventory rows up into the summary counts. */
export function summarize(rows: MisparentedSubsidiaryRow[]): MisparentedSubsidiaryInventory["summary"] {
  const bySeverity = { high: 0, medium: 0, low: 0 };
  let autoFixable = 0;
  let totalBalanceAtRisk = 0;
  for (const r of rows) {
    bySeverity[r.severity] += 1;
    if (r.autoFixable) autoFixable += 1;
    totalBalanceAtRisk += Math.abs(r.currentBalance);
  }
  return {
    total: rows.length,
    autoFixable,
    needsReview: rows.length - autoFixable,
    bySeverity,
    totalBalanceAtRisk: Math.round(totalBalanceAtRisk * 100) / 100,
  };
}
