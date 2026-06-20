// Retroactive revenue reclassification engine — the «على القديم» half
// of the dimensional-revenue routing feature. The runtime resolver
// (revenueAccountResolver.ts) handles NEW invoices automatically; this
// function walks OLD invoices and shifts their revenue posting from
// the original product-default account to whatever the current
// subsidiary_accounts mapping resolves to for their dimension.
//
// Lives in lib (not routes/) per the lint-patterns rule:
// "direct-gl-import-in-domain-route" forbids createGuardedJournalEntry
// + getAccountCodeFromMapping in non-finance ROUTES. Engines are
// always allowed. The route stays thin and the financial machinery is
// encapsulated here.
//
// Audit-safe pattern — never rewrites historical JEs; posts a NEW
// reversal+repost JE per invoice dated today. Idempotent via sourceKey.

import { rawQuery, rawExecute } from "./rawdb.js";
import {
  createGuardedJournalEntry,
  getAccountCodeFromMapping,
  emitEvent,
  createAuditLog,
  roundTo2,
} from "./businessHelpers.js";
import { logger } from "./logger.js";
import { resolveRevenueAccount } from "./revenueAccountResolver.js";

interface Scope {
  companyId: number;
  branchId?: number | null;
  userId: number;
}

export interface ReclassifyRevenueFilters {
  invoiceIds?: number[];
  subAgentId?: number;
  seasonId?: number;
  dryRun?: boolean;
}

export interface ReclassifyRevenueResult {
  summary: {
    scanned: number;
    reclassified: number;
    alreadyAligned: number;
    noOverride: number;
    failed: number;
  };
  details: Array<{
    invoiceId: number;
    ref: string;
    status: "reclassified" | "already_aligned" | "no_override" | "failed";
    moves?: { fromCode: string; toCode: string; amount: number }[];
    error?: string;
  }>;
  dryRun: boolean;
}

export async function reclassifyRevenueForInvoices(
  scope: Scope,
  filters: ReclassifyRevenueFilters,
): Promise<ReclassifyRevenueResult> {
  const dryRun = filters.dryRun ?? false;

  // Default revenue account — the fallback every invoice originally
  // posted to before subsidiary_accounts overrides existed.
  const defaultRevCode = await getAccountCodeFromMapping(
    scope.companyId,
    "umrah_invoice_revenue",
    "credit",
    "4130",
  );

  // Build the invoice set. We pull the dimension columns (subAgentId +
  // agentId via the sub-agent join + seasonId) in one round-trip — the
  // resolver needs them for hint construction, and pulling them upfront
  // avoids N+1 lookups for large reclass batches.
  const conditions = [`inv."companyId" = $1`, `inv."deletedAt" IS NULL`, `inv.status != 'cancelled'`];
  const params: unknown[] = [scope.companyId];
  if (filters.invoiceIds && filters.invoiceIds.length > 0) {
    params.push(filters.invoiceIds);
    conditions.push(`inv.id = ANY($${params.length})`);
  }
  if (filters.subAgentId) {
    params.push(filters.subAgentId);
    conditions.push(`inv."subAgentId" = $${params.length}`);
  }
  if (filters.seasonId) {
    params.push(filters.seasonId);
    conditions.push(`inv."seasonId" = $${params.length}`);
  }

  const invoices = await rawQuery<{
    id: number;
    ref: string;
    branchId: number | null;
    subAgentId: number;
    agentId: number | null;
    seasonId: number;
  }>(
    `SELECT inv.id, inv.ref, inv."branchId", inv."subAgentId", sa."agentId", inv."seasonId"
       FROM umrah_sales_invoices inv
       JOIN umrah_sub_agents sa
         ON sa.id = inv."subAgentId"
        AND sa."companyId" = inv."companyId"
      WHERE ${conditions.join(" AND ")}
      ORDER BY inv."invoiceDate" ASC, inv.id ASC
      LIMIT 5000`,
    params,
  );

  const summary = {
    scanned: invoices.length,
    reclassified: 0,
    alreadyAligned: 0,
    noOverride: 0,
    failed: 0,
  };
  const details: ReclassifyRevenueResult["details"] = [];

  for (const inv of invoices) {
    try {
      const hit = await resolveRevenueAccount(
        scope.companyId,
        {
          subAgentId: inv.subAgentId,
          agentId: inv.agentId,
          seasonId: inv.seasonId,
        },
        "revenue",
      );
      if (!hit) {
        summary.noOverride++;
        details.push({ invoiceId: inv.id, ref: inv.ref, status: "no_override" });
        continue;
      }
      const targetCode = hit.accountCode;

      // Current effective revenue accountCodes for this invoice —
      // grouped sum from invoice items. NULL accountCode means the
      // line was posted to the company-wide default at generation.
      const grouped = await rawQuery<{ code: string; amount: string }>(
        `SELECT COALESCE("accountCode", $1) AS code, SUM("lineTotal") AS amount
           FROM umrah_sales_invoice_items
          WHERE "invoiceId" = $2 AND "itemType" = 'group'
          GROUP BY COALESCE("accountCode", $1)`,
        [defaultRevCode, inv.id],
      );

      const moves = grouped
        .map((g) => ({ fromCode: g.code, amount: roundTo2(Number(g.amount) || 0) }))
        .filter((m) => m.amount > 0 && m.fromCode !== targetCode);

      if (moves.length === 0) {
        summary.alreadyAligned++;
        details.push({ invoiceId: inv.id, ref: inv.ref, status: "already_aligned" });
        continue;
      }

      if (dryRun) {
        summary.reclassified++;
        details.push({
          invoiceId: inv.id,
          ref: inv.ref,
          status: "reclassified",
          moves: moves.map((m) => ({ fromCode: m.fromCode, toCode: targetCode, amount: m.amount })),
        });
        continue;
      }

      // Post the compensating entry. One JE per invoice — keeps the
      // audit trail neat ("invoice X was reclassified on date Y to
      // account Z") and matches the sourceKey-idempotency model.
      const glLines = moves.flatMap((m) => [
        {
          accountCode: m.fromCode,
          debit: m.amount,
          credit: 0,
          description: `عكس إيراد سابق — ${inv.ref}`,
          umrahAgentId: inv.agentId ?? undefined,
          umrahSeasonId: inv.seasonId ?? undefined,
        },
        {
          accountCode: targetCode,
          debit: 0,
          credit: m.amount,
          description: `إعادة تصنيف إيراد — ${inv.ref} → ${targetCode}`,
          umrahAgentId: inv.agentId ?? undefined,
          umrahSeasonId: inv.seasonId ?? undefined,
        },
      ]);

      await createGuardedJournalEntry(
        {
          companyId: scope.companyId,
          branchId: inv.branchId ?? scope.branchId ?? 0,
          createdBy: scope.userId,
          ref: `JE-RECLASS-${inv.ref}`,
          description: `إعادة تصنيف إيراد عمرة — ${inv.ref} → ${targetCode}`,
          type: "reclassification",
          sourceType: "umrah_revenue_reclass",
          sourceId: inv.id,
          sourceKey: `umrah_reclass_${inv.id}_to_${targetCode}`,
          lines: glLines,
        },
        { table: "umrah_sales_invoices", id: inv.id },
      );

      // Persist the new accountCode on each group line. This makes
      // the items mirror the current GL state, so the next call to
      // this endpoint sees the invoice as "already aligned" and the
      // umrah balance reports / dashboards reading items.accountCode
      // reflect reality post-reclassification.
      await rawExecute(
        `UPDATE umrah_sales_invoice_items
            SET "accountCode" = $1
          WHERE "invoiceId" = $2 AND "itemType" = 'group'`,
        [targetCode, inv.id],
      );

      summary.reclassified++;
      details.push({
        invoiceId: inv.id,
        ref: inv.ref,
        status: "reclassified",
        moves: moves.map((m) => ({ fromCode: m.fromCode, toCode: targetCode, amount: m.amount })),
      });

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "umrah.invoice.revenue_reclassified",
        entity: "umrah_sales_invoices",
        entityId: inv.id,
        details: JSON.stringify({ ref: inv.ref, target: targetCode, moves }),
      }).catch((e) => logger.error(e, "[reclassifyRevenue] event emit failed"));
    } catch (e: any) {
      summary.failed++;
      details.push({
        invoiceId: inv.id,
        ref: inv.ref,
        status: "failed",
        error: e?.message ?? String(e),
      });
      logger.error(e, `[reclassifyRevenue] failed on invoice ${inv.id}`);
    }
  }

  createAuditLog({
    companyId: scope.companyId,
    userId: scope.userId,
    action: dryRun ? "preview" : "reclassify",
    entity: "umrah_sales_invoices",
    entityId: 0,
    after: { summary, filters },
  }).catch((e) => logger.error(e, "[reclassifyRevenue] audit log failed"));

  return { summary, details, dryRun };
}
