// ─────────────────────────────────────────────────────────────────────────────
// Umrah Assistant Engine — §9 of #1870
//
// The Charter says: "النظام يجب أن يكون مساعدًا للمستخدم، لا متلقيًا فقط."
//
// Today the operator opens a screen and stares at a blank form. The
// assistant engine scans system state at request time and produces a
// ranked list of suggestions — "you have 12 unlinked rows from last
// import", "this group has no transport requested", "visa expiring
// tomorrow for 3 pilgrims". The FE renders them as dismissible cards
// at the top of the dashboard + context-aware hints on detail pages.
//
// Phase 1 (this PR) — six suggestion types:
//
//   - unlinked_rows_recovery     (legacy orphans + new-batch unlinked)
//   - missing_finance_postings   (nusk invoices without AP JE)
//   - visa_expiring_attention    (pilgrims with visa ≤ 7d)
//   - active_overstayers         (status='overstayed')
//   - group_needs_transport      (groups w/no transport_bookings row)
//   - import_batch_review        (recent batch with errors > 0)
//
// Phase 2 (follow-up): per-entity suggestions (e.g. "this pilgrim is
// the 4th from agent X this month — consider a bulk discount"),
// last-used auto-fill, predictive next-action.
// ─────────────────────────────────────────────────────────────────────────────
import { rawQuery } from "./rawdb.js";
import { gccExclusionSqlFragment } from "./umrahNationalityRules.js";

export type SuggestionType =
  | "unlinked_rows_recovery"
  | "missing_finance_postings"
  | "visa_expiring_attention"
  | "active_overstayers"
  | "group_needs_transport"
  | "import_batch_review";

export type SuggestionSeverity = "info" | "warning" | "critical";

export interface AssistantSuggestion {
  type: SuggestionType;
  /** Operator-facing Arabic title. */
  title: string;
  /** Short body — one sentence; the operator decides whether to click. */
  body: string;
  /** Severity drives the card color in the FE. */
  severity: SuggestionSeverity;
  /** Where to drill — page route the FE should link to. */
  actionUrl: string;
  /** Label for the action button. */
  actionLabel: string;
  /** Numeric metric the title alludes to, so the FE can render badges. */
  metric?: number;
}

export interface AssistantScope {
  companyId: number;
  branchId?: number | null;
  seasonId?: number | null;
}

/**
 * Generic dashboard suggestions. Called by GET /umrah/assistant/suggestions.
 * The six SQL probes run in parallel — each is cheap (single COUNT
 * over an existing indexed column) so the whole endpoint is single-digit ms.
 *
 * Returns suggestions ordered by severity (critical → warning → info)
 * then by metric size (more cases first). The FE caps the visible list
 * at 5; the rest are accessible via a "see all" expander.
 */
export async function getDashboardSuggestions(scope: AssistantScope): Promise<AssistantSuggestion[]> {
  const params: unknown[] = [scope.companyId];
  let pilgrimSeasonClause = "";
  if (scope.seasonId) {
    params.push(scope.seasonId);
    pilgrimSeasonClause = ` AND p."seasonId" = $${params.length}`;
  }

  const [
    orphanRow, missingApRow, visaRow, overstayRow, groupNoTransportRow, errorBatchRow,
  ] = await Promise.all([
    // Pilgrims with ANY NULL FK — same query as the compliance signal
    // but used here to recommend the recovery screen explicitly.
    rawQuery<{ c: string }>(
      `SELECT COUNT(*)::text AS c
         FROM umrah_pilgrims p
        WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
          AND (p."agentId" IS NULL OR p."groupId" IS NULL OR p."subAgentId" IS NULL)${pilgrimSeasonClause}`,
      params,
    ),
    rawQuery<{ c: string }>(
      `SELECT COUNT(*)::text AS c
         FROM umrah_nusk_invoices n
        WHERE n."companyId" = $1 AND n."deletedAt" IS NULL
          AND n."purchaseInvoiceId" IS NULL
          AND COALESCE(n."totalAmount",0) > 0
          AND n."nuskStatus" <> 'cancelled'`,
      [scope.companyId],
    ),
    rawQuery<{ c: string }>(
      `SELECT COUNT(*)::text AS c
         FROM umrah_pilgrims p
        WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
          AND p."visaExpiry" IS NOT NULL
          AND p."visaExpiry" <= CURRENT_DATE + INTERVAL '7 days'
          AND p.status NOT IN ('departed', 'cancelled')
          AND ${gccExclusionSqlFragment(`p."nationality"`)}${pilgrimSeasonClause}`,
      params,
    ),
    rawQuery<{ c: string }>(
      `SELECT COUNT(*)::text AS c
         FROM umrah_pilgrims p
        WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
          AND p.status IN ('overstayed', 'overstay_penalized')${pilgrimSeasonClause}`,
      params,
    ),
    // Groups with at least one pilgrim AND zero transport_bookings.
    // Surfaces "this group hasn't been booked for transport yet" so
    // the operator can fire createTransportRequestFromUmrah (§7).
    rawQuery<{ c: string }>(
      `SELECT COUNT(*)::text AS c
         FROM umrah_groups g
        WHERE g."companyId" = $1 AND g."deletedAt" IS NULL
          AND COALESCE(g."mutamerCount", 0) > 0
          AND NOT EXISTS (
            SELECT 1 FROM transport_bookings b
             WHERE b."umrahGroupId" = g.id
               AND b."companyId" = g."companyId"
               AND b."deletedAt" IS NULL
          )`,
      [scope.companyId],
    ),
    // Recent (last 30 days) import batches with errorCount > 0 — gives
    // the operator a single "review this batch" prompt instead of
    // requiring them to remember which batches need attention.
    rawQuery<{ c: string }>(
      `SELECT COALESCE(SUM(COALESCE(b."errorCount",0)),0)::text AS c
         FROM umrah_import_batches b
        WHERE b."companyId" = $1 AND b."deletedAt" IS NULL
          AND b."createdAt" >= NOW() - INTERVAL '30 days'`,
      [scope.companyId],
    ),
  ]);

  const suggestions: AssistantSuggestion[] = [];

  const orphans = Number(orphanRow[0]?.c ?? "0");
  if (orphans > 0) {
    suggestions.push({
      type: "unlinked_rows_recovery",
      severity: orphans > 100 ? "critical" : "warning",
      title: `${orphans} معتمر بلا ربط كامل`,
      body: "صفوف معتمرين بلا وكيل أو مجموعة أو مكتب فرعي — لن تظهر على الكشوف. اربطها جماعياً من شاشة الاسترداد.",
      actionUrl: "/umrah/orphan-pilgrims",
      actionLabel: "افتح شاشة الاسترداد",
      metric: orphans,
    });
  }

  const missingAp = Number(missingApRow[0]?.c ?? "0");
  if (missingAp > 0) {
    suggestions.push({
      type: "missing_finance_postings",
      severity: "critical",
      title: `${missingAp} فاتورة نسك بدون قيد ذمم`,
      body: "أثر مالي مفقود في ميزان المراجعة. أي PATCH على الفاتورة يُرحّل القيد تلقائياً عبر postNuskJournalEntries.",
      actionUrl: "/umrah/nusk-invoices",
      actionLabel: "افتح الفواتير",
      metric: missingAp,
    });
  }

  const visa = Number(visaRow[0]?.c ?? "0");
  if (visa > 0) {
    suggestions.push({
      type: "visa_expiring_attention",
      severity: visa > 10 ? "warning" : "info",
      title: `${visa} تأشيرة تنتهي خلال 7 أيام`,
      body: "اتصل بالوكيل لتأكيد جداول المغادرة قبل أن تتحول الحالة إلى متجاوز.",
      actionUrl: "/umrah/pilgrims?visaExpiringWithin=7",
      actionLabel: "افتح القائمة",
      metric: visa,
    });
  }

  const overstay = Number(overstayRow[0]?.c ?? "0");
  if (overstay > 0) {
    suggestions.push({
      type: "active_overstayers",
      severity: "critical",
      title: `${overstay} معتمر متجاوز حالياً`,
      body: "تواصل معهم قبل أن تتحول الحالة إلى مخالف وتسجَّل غرامة تلقائية.",
      actionUrl: "/umrah/pilgrims?status=overstayed",
      actionLabel: "افتح القائمة",
      metric: overstay,
    });
  }

  const groupNoTransport = Number(groupNoTransportRow[0]?.c ?? "0");
  if (groupNoTransport > 0) {
    suggestions.push({
      type: "group_needs_transport",
      severity: "warning",
      title: `${groupNoTransport} مجموعة بدون طلب نقل`,
      body: "اطلب رحلة نقل لكل مجموعة من صفحة المجموعة. الطلب يذهب لمسار النقل عبر الـ Service Contract.",
      actionUrl: "/umrah/groups",
      actionLabel: "افتح المجموعات",
      metric: groupNoTransport,
    });
  }

  const errorBatches = Number(errorBatchRow[0]?.c ?? "0");
  if (errorBatches > 0) {
    suggestions.push({
      type: "import_batch_review",
      severity: "info",
      title: `${errorBatches} صف مرفوض في الاستيراد (30 يوم)`,
      body: "راجع الصفوف المرفوضة وأعد ضبط مصدر البيانات لتجنب تكرارها.",
      actionUrl: "/umrah/import",
      actionLabel: "افتح المعالج",
      metric: errorBatches,
    });
  }

  const sevOrder: Record<SuggestionSeverity, number> = { critical: 0, warning: 1, info: 2 };
  suggestions.sort((a, b) => {
    const s = sevOrder[a.severity] - sevOrder[b.severity];
    if (s !== 0) return s;
    return (b.metric ?? 0) - (a.metric ?? 0);
  });

  return suggestions;
}
