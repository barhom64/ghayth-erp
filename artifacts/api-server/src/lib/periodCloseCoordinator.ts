// ─── Period-close coordinator — FIN-PERIOD-CLOSE (#2250) ─────────────────────
//
// A fiscal period must not lock while ANY integrity blocker still stands. The
// canonical close gate (closeFiscalPeriodCanonical) historically FAILED FAST —
// it threw on the FIRST blocker it found, so an operator fixing one problem
// would re-run, hit the next, fix that, re-run, and so on. That turns a single
// close into N round-trips and hides the true size of the work.
//
// This coordinator AGGREGATES all integrity blockers in one pass and returns
// the full list (it does NOT throw). The close gate then either:
//   • throws ConflictError ONCE with meta.blockers = the full array, or
//   • proceeds with the open→closed transition and records the close report.
//
// It also builds a close REPORT (counts + closedBy/closedAt) returned by the
// preview endpoint and persisted into the close audit record on commit.
//
// Every check is company-scoped AND windowed to the period's date range. No new
// table, no new engine — it COORDINATES the existing gates + ledger-truth SQL
// shapes (reused from /finance/reports/ledger-truth, scoped to the period).

import { rawQuery } from "./rawdb.js";

// ── Blocker contract ─────────────────────────────────────────────────────────

export type PeriodCloseBlockerType =
  | "pending_manual_je"
  | "amortization"
  | "deferred_revenue"
  | "dimension"
  | "mapping_fallback"
  | "manual_no_reason"
  | "posting_failure"
  | "orphan_source";

export interface PeriodCloseBlocker {
  /** Stable machine class — drives the per-class fix UI. */
  type: PeriodCloseBlockerType;
  /** Where the blocker was observed (table / report shape). */
  source: string;
  /** Optional pointer to the offending record(s). */
  recordRef?: string;
  /** Arabic, operator-facing description of WHY this blocks the close. */
  reason: string;
  /** Arabic, operator-facing instruction to clear it. */
  requiredAction: string;
}

export interface PeriodWindow {
  /** Inclusive period start date (YYYY-MM-DD). */
  startDate: string;
  /** Inclusive period end date (YYYY-MM-DD). */
  endDate: string;
  name?: string;
}

export interface PeriodCloseReport {
  periodId: number | null;
  periodName: string | null;
  startDate: string;
  endDate: string;
  totals: {
    totalJournalEntries: number;
    journalEntriesMissingDimensions: number;
    pendingManualJournalEntries: number;
    amortizationsExecuted: number;
    amortizationsRemaining: number;
    deferredRevenueRecognized: number;
    deferredRevenueRemaining: number;
    mappingFallbacks: number;
    manualWithoutReason: number;
    postingFailures: number;
  };
  blockerCount: number;
  /** Filled only on an actual close (commit), null on preview. */
  closedBy: number | null;
  closedAt: string | null;
}

// ── Pure decision rule (unit-testable mirror of the gate) ────────────────────
//
// A period MAY close ONLY when there are zero blockers. The aggregator is a
// pure function of "the set of blockers it found" → keep the decision rule
// itself tiny and pure so tests can re-derive it without a DB.
export function canCloseGivenBlockers(blockers: PeriodCloseBlocker[]): boolean {
  return blockers.length === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// collectPeriodCloseBlockers — runs ALL checks, returns the full list, never
// throws. Company-scoped + period-date-windowed. Each check mirrors an existing
// gate or ledger-truth report shape.
// ─────────────────────────────────────────────────────────────────────────────
export async function collectPeriodCloseBlockers(opts: {
  companyId: number;
  period: PeriodWindow;
}): Promise<PeriodCloseBlocker[]> {
  const { companyId, period } = opts;
  const { startDate, endDate } = period;
  const blockers: PeriodCloseBlocker[] = [];

  // ── 1. Pending manual JEs in the period (mirror of the existing gate). ──────
  const pendingRows = await rawQuery<{ pendingCount: string }>(
    `SELECT COUNT(*)::text AS "pendingCount" FROM journal_entries
      WHERE "companyId"=$1 AND "deletedAt" IS NULL
        AND "createdAt"::date BETWEEN $2 AND $3
        AND ("approvalStatus" IS NULL OR "approvalStatus" IN ('draft','pending_review'))
        AND "isManual" = TRUE`,
    [companyId, startDate, endDate],
  );
  const pendingCount = Number(pendingRows[0]?.pendingCount ?? 0);
  if (pendingCount > 0) {
    blockers.push({
      type: "pending_manual_je",
      source: "journal_entries",
      recordRef: `count=${pendingCount}`,
      reason: `يوجد ${pendingCount} قيد يدوي لم يُرحّل بعد داخل الفترة`,
      requiredAction: "ارحّل أو احذف القيود اليدوية المعلّقة قبل إقفال الفترة",
    });
  }

  // ── 2. Due un-posted prepaid amortizations (#2247). ─────────────────────────
  const { findUnpostedDueAmortizations } = await import(
    "./engines/prepaidAmortizationEngine.js"
  );
  const pendingAmort = await findUnpostedDueAmortizations({
    companyId,
    periodStart: startDate,
    periodEnd: endDate,
  });
  for (const a of pendingAmort) {
    blockers.push({
      type: "amortization",
      source: "prepaid_amortization_schedules",
      recordRef: `schedule#${a.scheduleId}:${a.ym}`,
      reason: `إطفاء مستحق لمصروف مدفوع مقدماً لم يُرحّل (جدول #${a.scheduleId} — ${a.ym})`,
      requiredAction:
        "نفّذ إطفاء المصروفات المدفوعة مقدماً المستحقة (POST /finance/amortization/run) قبل إقفال الفترة",
    });
  }

  // ── 3. Due un-posted deferred-revenue recognitions (#2248). ─────────────────
  const { findUnpostedDueRecognitions } = await import(
    "./engines/deferredRevenueEngine.js"
  );
  const pendingDefRev = await findUnpostedDueRecognitions({
    companyId,
    periodStart: startDate,
    periodEnd: endDate,
  });
  for (const d of pendingDefRev) {
    blockers.push({
      type: "deferred_revenue",
      source: "deferred_revenue_schedules",
      recordRef: `schedule#${d.scheduleId}:${d.ym}`,
      reason: `تحقّق مستحق لإيراد مؤجل لم يُرحّل (جدول #${d.scheduleId} — ${d.ym})`,
      requiredAction:
        "نفّذ تحقّق الإيرادات المؤجلة المستحقة (POST /finance/deferred-revenue/run) قبل إقفال الفترة",
    });
  }

  // ── 4. Operational JEs missing required dimensions in the period. ───────────
  // Reuse of the /finance/reports/ledger-truth dimension-completeness shape,
  // scoped to the period's date window. Keep the CASE in sync with that report
  // (which mirrors expectedDimensionForAccount in gl/ledgerTruth.ts).
  const dimMissingRows = await rawQuery<{ missingLines: string }>(
    `SELECT COUNT(*)::text AS "missingLines"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId"
       JOIN chart_of_accounts coa ON coa.id = jl."accountId" AND coa."companyId" = $1
      WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
        AND je."balancesApplied" = true AND je."reversedById" IS NULL
        AND jl."deletedAt" IS NULL
        AND je."createdAt"::date BETWEEN $2 AND $3
        AND (CASE
              WHEN (coa.code ~ '^55[0-9]{2}$' OR coa.code = '5710') AND jl."vehicleId" IS NULL THEN true
              WHEN coa.code ~ '^56[0-9]{2}$' AND jl."propertyId" IS NULL THEN true
              WHEN coa.code IN ('5130','4140') AND jl."projectId" IS NULL THEN true
              WHEN coa.code ~ '^211[1-3]$' AND jl."vendorId" IS NULL THEN true
              WHEN coa.code ~ '^113[1-3]$' AND jl."clientId" IS NULL THEN true
              ELSE false END) = true`,
    [companyId, startDate, endDate],
  );
  const dimMissing = Number(dimMissingRows[0]?.missingLines ?? 0);
  if (dimMissing > 0) {
    blockers.push({
      type: "dimension",
      source: "journal_lines (ledger-truth dimension completeness)",
      recordRef: `missingLines=${dimMissing}`,
      reason: `يوجد ${dimMissing} سطر قيد تشغيلي بلا البُعد المطلوب (مركبة/عقار/مشروع/مورد/عميل) داخل الفترة`,
      requiredAction: "أكمل أبعاد القيود التشغيلية الناقصة قبل إقفال الفترة",
    });
  }

  // ── 5. Mapping-fallback (default-account) postings in the period. ───────────
  // Signal: audit_logs action='mapping_fallback' within the period window.
  const fallbackRows = await rawQuery<{ fallbackCount: string }>(
    `SELECT COUNT(*)::text AS "fallbackCount"
       FROM audit_logs al
      WHERE al."companyId" = $1
        AND al.action = 'mapping_fallback'
        AND al.entity = 'accounting_mappings'
        AND al."createdAt"::date BETWEEN $2 AND $3`,
    [companyId, startDate, endDate],
  );
  const fallbackCount = Number(fallbackRows[0]?.fallbackCount ?? 0);
  if (fallbackCount > 0) {
    blockers.push({
      type: "mapping_fallback",
      source: "audit_logs (mapping_fallback)",
      recordRef: `count=${fallbackCount}`,
      reason: `يوجد ${fallbackCount} ترحيل على حساب افتراضي (mapping_fallback) داخل الفترة`,
      requiredAction:
        "صحّح ربط الحسابات للعمليات التي رُحّلت على الحساب الافتراضي قبل إقفال الفترة",
    });
  }

  // ── 6. Manual, operationally-linked JEs without a reason in the period. ──────
  // Reuse of the ledger-truth "blind manual JE" shape (manual + has an
  // operational dimension + no real description), scoped to the period.
  const manualNoReasonRows = await rawQuery<{ noReasonCount: string }>(
    `SELECT COUNT(*)::text AS "noReasonCount"
       FROM journal_entries je
      WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
        AND je."isManual" = true
        AND je."createdAt"::date BETWEEN $2 AND $3
        AND (je.description IS NULL OR je.description = '' OR je.description = 'قيد يدوي')
        AND EXISTS (
          SELECT 1 FROM journal_lines jl
           WHERE jl."journalId" = je.id AND jl."deletedAt" IS NULL
             AND (jl."vehicleId" IS NOT NULL OR jl."propertyId" IS NOT NULL OR jl."assetId" IS NOT NULL
               OR jl."employeeId" IS NOT NULL OR jl."driverId" IS NOT NULL OR jl."unitId" IS NOT NULL
               OR jl."contractId" IS NOT NULL)
        )`,
    [companyId, startDate, endDate],
  );
  const manualNoReason = Number(manualNoReasonRows[0]?.noReasonCount ?? 0);
  if (manualNoReason > 0) {
    blockers.push({
      type: "manual_no_reason",
      source: "journal_entries (manual operationally-linked, no reason)",
      recordRef: `count=${manualNoReason}`,
      reason: `يوجد ${manualNoReason} قيد يدوي مرتبط تشغيلياً بلا سبب (وصف) داخل الفترة`,
      requiredAction: "أضف سبباً واضحاً للقيود اليدوية المرتبطة تشغيلياً قبل إقفال الفترة",
    });
  }

  // ── 7. Open posting failures in the period (financial_posting_failures). ─────
  // A real DLQ-style source exists (migration 119). Unresolved rows in the
  // window mean GL postings never landed — closing would lock a period whose
  // ledger is knowingly incomplete.
  const postingFailRows = await rawQuery<{ failCount: string }>(
    `SELECT COUNT(*)::text AS "failCount"
       FROM financial_posting_failures
      WHERE "companyId" = $1 AND resolved = false
        AND "createdAt"::date BETWEEN $2 AND $3`,
    [companyId, startDate, endDate],
  );
  const postingFailures = Number(postingFailRows[0]?.failCount ?? 0);
  if (postingFailures > 0) {
    blockers.push({
      type: "posting_failure",
      source: "financial_posting_failures",
      recordRef: `count=${postingFailures}`,
      reason: `يوجد ${postingFailures} فشل ترحيل مالي غير معالَج داخل الفترة`,
      requiredAction:
        "عالج/أعد محاولة فشل الترحيل المالي (شاشة فشل الترحيل) قبل إقفال الفترة",
    });
  }

  // ── 8. Orphan-source posted JEs in the period (#2874 — BLOCKING, زيرو تسامح). ─
  // قرار إبراهيم: القيد اليتيم بالمصدر = مانع حاجب بصفر تسامح — وجود ≥1 قيد يتيم
  // يرفض إقفال الفترة. تعريف اليتيم مُعاد استخدامه حرفياً من تقرير حقيقة الدفتر
  // (/finance/reports/ledger-truth في routes/finance-reports.ts): قيد آلي مُرحَّل
  // بلا مصدر (sourceType أو sourceId = NULL)، غير يدوي، مُطبَّق، غير معكوس، غير
  // محذوف، ونوعه ليس من أبواب الإقفال/التسوية/المطابقة النظامية المستثناة. مُقيَّد
  // بالشركة + نطاق الفترة بنفس عمود التاريخ (createdAt) الذي تستخدمه بقية الموانع.
  // قراءة فقط — COUNT(*) لا غير.
  const ORPHAN_EXCLUDED_TYPES = [
    "closing",
    "monthly_closing",
    "opening_balance",
    "fx_revaluation",
    "fx_realised",
    "asset_revaluation",
    "bank_adjustment",
  ];
  const orphanRows = await rawQuery<{ orphanCount: string }>(
    `SELECT COUNT(*)::text AS "orphanCount"
       FROM journal_entries je
      WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
        AND je."isManual" = false
        AND je."balancesApplied" = true
        AND je."reversedById" IS NULL
        AND (je."sourceType" IS NULL OR je."sourceId" IS NULL)
        AND COALESCE(je.type, '') <> ALL($4::text[])
        AND je."createdAt"::date BETWEEN $2 AND $3`,
    [companyId, startDate, endDate, ORPHAN_EXCLUDED_TYPES],
  );
  const orphanCount = Number(orphanRows[0]?.orphanCount ?? 0);
  if (orphanCount > 0) {
    blockers.push({
      type: "orphan_source",
      source: "journal_entries (ledger-truth orphan source)",
      recordRef: `count=${orphanCount}`,
      reason: `يوجد ${orphanCount} قيد مُرحَّل بلا مصدر (قيود يتيمة) داخل الفترة — تمنع الإقفال`,
      requiredAction:
        "اربط القيود المُرحَّلة اليتيمة بمصدرها (sourceType/sourceId) أو عالجها قبل إقفال الفترة",
    });
  }

  return blockers;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPeriodCloseReport — aggregate counts for the preview + the close record.
// Company-scoped + period-windowed. `closedBy`/`closedAt` are filled only on an
// actual close; on preview they are null.
// ─────────────────────────────────────────────────────────────────────────────
export async function buildPeriodCloseReport(opts: {
  companyId: number;
  periodId?: number | null;
  period: PeriodWindow;
  blockers: PeriodCloseBlocker[];
  closedBy?: number | null;
  closedAt?: string | null;
}): Promise<PeriodCloseReport> {
  const { companyId, period, blockers } = opts;
  const { startDate, endDate } = period;

  // Total JEs in the period (posted or not).
  const totalJeRows = await rawQuery<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM journal_entries
      WHERE "companyId"=$1 AND "deletedAt" IS NULL
        AND "createdAt"::date BETWEEN $2 AND $3`,
    [companyId, startDate, endDate],
  );

  // JEs (distinct) with at least one dimension-missing operational line.
  const dimRows = await rawQuery<{ missingJes: string }>(
    `SELECT COUNT(DISTINCT je.id)::text AS "missingJes"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId"
       JOIN chart_of_accounts coa ON coa.id = jl."accountId" AND coa."companyId" = $1
      WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
        AND je."balancesApplied" = true AND je."reversedById" IS NULL
        AND jl."deletedAt" IS NULL
        AND je."createdAt"::date BETWEEN $2 AND $3
        AND (CASE
              WHEN (coa.code ~ '^55[0-9]{2}$' OR coa.code = '5710') AND jl."vehicleId" IS NULL THEN true
              WHEN coa.code ~ '^56[0-9]{2}$' AND jl."propertyId" IS NULL THEN true
              WHEN coa.code IN ('5130','4140') AND jl."projectId" IS NULL THEN true
              WHEN coa.code ~ '^211[1-3]$' AND jl."vendorId" IS NULL THEN true
              WHEN coa.code ~ '^113[1-3]$' AND jl."clientId" IS NULL THEN true
              ELSE false END) = true`,
    [companyId, startDate, endDate],
  );

  // Amortizations: executed (posted in window) vs remaining (due, un-posted).
  const amortExecRows = await rawQuery<{ posted: string }>(
    `SELECT COUNT(*)::text AS posted FROM prepaid_amortization_postings
      WHERE "companyId"=$1
        AND ("periodYm" || '-01')::date BETWEEN date_trunc('month',$2::date) AND $3`,
    [companyId, startDate, endDate],
  );
  const { findUnpostedDueAmortizations } = await import(
    "./engines/prepaidAmortizationEngine.js"
  );
  const amortRemaining = (
    await findUnpostedDueAmortizations({ companyId, periodStart: startDate, periodEnd: endDate })
  ).length;

  // Deferred revenue: recognized (posted in window) vs remaining (due, un-posted).
  const defRevExecRows = await rawQuery<{ posted: string }>(
    `SELECT COUNT(*)::text AS posted FROM deferred_revenue_postings
      WHERE "companyId"=$1
        AND ("periodYm" || '-01')::date BETWEEN date_trunc('month',$2::date) AND $3`,
    [companyId, startDate, endDate],
  );
  const { findUnpostedDueRecognitions } = await import(
    "./engines/deferredRevenueEngine.js"
  );
  const defRevRemaining = (
    await findUnpostedDueRecognitions({ companyId, periodStart: startDate, periodEnd: endDate })
  ).length;

  // Pull scalar counts straight off the blockers where they already encode a
  // count (avoids re-querying the same shape twice).
  const pendingManualBlocker = blockers.find((b) => b.type === "pending_manual_je");
  const fallbackBlocker = blockers.find((b) => b.type === "mapping_fallback");
  const manualNoReasonBlocker = blockers.find((b) => b.type === "manual_no_reason");
  const postingFailBlocker = blockers.find((b) => b.type === "posting_failure");
  const parseRef = (ref?: string) => Number((ref ?? "").replace(/^count=/, "") || 0);

  return {
    periodId: opts.periodId ?? null,
    periodName: period.name ?? null,
    startDate,
    endDate,
    totals: {
      totalJournalEntries: Number(totalJeRows[0]?.total ?? 0),
      journalEntriesMissingDimensions: Number(dimRows[0]?.missingJes ?? 0),
      pendingManualJournalEntries: parseRef(pendingManualBlocker?.recordRef),
      amortizationsExecuted: Number(amortExecRows[0]?.posted ?? 0),
      amortizationsRemaining: amortRemaining,
      deferredRevenueRecognized: Number(defRevExecRows[0]?.posted ?? 0),
      deferredRevenueRemaining: defRevRemaining,
      mappingFallbacks: parseRef(fallbackBlocker?.recordRef),
      manualWithoutReason: parseRef(manualNoReasonBlocker?.recordRef),
      postingFailures: parseRef(postingFailBlocker?.recordRef),
    },
    blockerCount: blockers.length,
    closedBy: opts.closedBy ?? null,
    closedAt: opts.closedAt ?? null,
  };
}
