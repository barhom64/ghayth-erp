import { useApiQuery } from "@/lib/api";
import { exportRowsToCsv } from "@/lib/unified-export";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { Button } from "@/components/ui/button";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { CheckCircle2, AlertTriangle, Download, FileWarning } from "lucide-react";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
/**
 * GL integrity gaps — period-close pre-flight UI.
 * Consumes /reports/gl-integrity-gaps (#1043).
 *
 * Operators run this before any period close. Each section
 * surfaces a different class of broken GL linkage:
 *
 *  1. invoices_missing_je   — approved invoices with NULL journalEntryId
 *  2. credit_memos_missing_je — memo with NULL journalId (legacy)
 *  3. debit_memos_missing_je
 *  4. payment_runs_missing_je — executed run without GL
 *  5. spa_orphans            — SPA pointing at deleted JE
 */

interface GapRow {
  section: string;
  entityId: number;
  ref: string | null;
  gap: string;
  amount: number | null;
  createdAt: string | null;
}

interface GapsResponse {
  filters: { startDate?: string; endDate?: string };
  summary: {
    totalGaps: number;
    isClean: boolean;
    bySection: Array<{ source: string; count: number }>;
  };
  sections: Array<{ source: string; rows: GapRow[] }>;
}

const SECTION_LABEL: Record<string, string> = {
  invoices_missing_je:     "فواتير معتمدة بدون قيد",
  credit_memos_missing_je: "إشعارات دائنة بدون قيد",
  debit_memos_missing_je:  "إشعارات مدينة بدون قيد",
  payment_runs_missing_je: "دفعات مجمّعة بدون GL",
  spa_orphans:             "تخصيصات يتيمة (JE محذوف)",
};

const SECTION_HINT: Record<string, string> = {
  invoices_missing_je:
    "خطر — VAT-return و tax-summary لن يجدا إيراد هذه الفواتير. لازم إعادة اعتماد أو معالجة يدوية.",
  credit_memos_missing_je:
    "صفوف قديمة من قبل #1015 (atomic-post). تحتاج backfill JE.",
  debit_memos_missing_je:
    "صفوف قديمة من قبل #1015 (atomic-post). تحتاج backfill JE.",
  payment_runs_missing_je:
    "دفعة executed لكن JE لم يُسجَّل. ربما crash بين الـ posting + الـ UPDATE.",
  spa_orphans:
    "السطر يشير إلى JE تم حذفه نهائياً. soft-delete الـ SPA أو أعد ربطها.",
};

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(sections: GapsResponse["sections"], filename: string) {
  const headers = ["القسم", "المعرف", "المرجع", "الفجوة", "المبلغ", "تاريخ الإنشاء"];
  const rows: string[][] = [];
  for (const sec of sections) {
    for (const r of sec.rows) {
      rows.push([
        csvEscape(SECTION_LABEL[sec.source] ?? sec.source),
        String(r.entityId),
        csvEscape(r.ref ?? ""),
        csvEscape(r.gap),
        r.amount == null ? "—" : Number(r.amount).toFixed(2),
        csvEscape(r.createdAt ?? ""),
      ]);
    }
  }
  // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
  // Routed through unified export helper for audit + letterhead.
  void exportRowsToCsv({
    entityType: "report_gl_integrity_gaps",
    title: String(filename).replace(/\.csv$/i, ""),
    rows: rows.map((row: any) => Object.fromEntries(headers.map((h: string, i: number) => [h, Array.isArray(row) ? row[i] : (row?.[h] ?? "")]))),
    columns: headers.map((h: string) => ({ key: h, label: h })),
  }).catch((err) => console.error("[export] failed", err));
}

export default function GlIntegrityGapsPage() {
  const { data, isLoading, isError, refetch } = useApiQuery<GapsResponse>(
    ["gl-integrity-gaps"],
    "/finance/reports/gl-integrity-gaps",
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const { summary, sections } = data;

  const renderEntityLink = (section: string, entityId: number, ref: string | null) => {
    // Deep-link each entity type to its detail page so the auditor
    // can drill in with a single click.
    const path =
      section === "invoices_missing_je" ? `/finance/invoices/${entityId}` :
      section === "payment_runs_missing_je" ? `/finance/payment-run` :
      null;
    const label = ref || `#${entityId}`;
    return path ? (
      <Link href={path} className="font-mono text-xs text-status-info-foreground hover:underline">
        {label}
      </Link>
    ) : (
      <span className="font-mono text-xs">{label}</span>
    );
  };

  const renderSectionTable = (section: { source: string; rows: GapRow[] }) => {
    const cols: DataTableColumn<GapRow>[] = [
      { key: "entityId", header: "المعرف",
        render: (r) => renderEntityLink(section.source, r.entityId, r.ref) },
      { key: "gap", header: "نوع الفجوة",
        render: (r) => <span className="text-destructive text-xs">{r.gap}</span> },
      { key: "amount", header: "المبلغ",
        render: (r) => r.amount != null
          ? <span className="font-mono">{formatCurrency(Number(r.amount))}</span>
          : "—" },
      { key: "createdAt", header: "تاريخ الإنشاء",
        render: (r) => <span className="text-xs text-muted-foreground">{r.createdAt?.slice(0, 10) ?? "—"}</span> },
    ];
    return (
      <Card key={section.source} className="border-destructive/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-destructive" />
              {SECTION_LABEL[section.source] ?? section.source}
            </span>
            <Badge variant="destructive">{section.rows.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground bg-status-warning-surface/50 border border-status-warning-surface rounded p-2">
            ⓘ {SECTION_HINT[section.source] ?? ""}
          </p>
          <DataTable
            columns={cols}
            data={section.rows}
            emptyMessage="—"
            pageSize={25}
            noToolbar
          />
        </CardContent>
      </Card>
    );
  };

  const nonEmptySections = sections.filter((s) => s.rows.length > 0);

  return (
    <PageShell
      title="فجوات سلامة الـ GL (قبل إقفال الفترة)"
      subtitle="فحص ما قبل الإقفال — كل سطر في التقرير يجب تسويته قبل أي إقفال شهري أو إقرار ضريبي"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "فجوات سلامة GL" },
      ]}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/gl-health">
              <CheckCircle2 className="h-3.5 w-3.5 me-1" />صحة النظام
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/gl-anomaly-detector">
              <AlertTriangle className="h-3.5 w-3.5 me-1" />كاشف الشذوذ
            </Link></Button>
          {nonEmptySections.length > 0 ? (
            <GuardedButton
              perm="finance:export" variant="outline" size="sm"
              onClick={() => exportCSV(sections, `gl-integrity-gaps-${todayLocal()}.csv`)}
            >
              <Download className="h-3.5 w-3.5 me-1" />تصدير CSV
            </GuardedButton>
          ) : null}
          {nonEmptySections.length > 0 && (
            <PrintButton
              entityType="report_gl_integrity_gaps"
              entityId={todayLocal()}
              payload={{
                entity: {
                  title: "فجوات تكامل دفتر الأستاذ العام (GL)",
                  asOfDate: todayLocal(),
                  sectionCount: nonEmptySections.length,
                },
                items: sections.flatMap((s: any) => (s.items ?? []).map((it: any) => ({
                  "القسم": s.label ?? s.key,
                  ...it,
                }))),
              }}
            />
          )}
        </div>
      }
    >
      <FinanceTabsNav />
      {/* Hero state */}
      <Card className={summary.isClean
        ? "border-emerald-300 bg-emerald-50/40"
        : "border-destructive/40 bg-destructive/5"}>
        <CardContent className="p-4 flex items-start gap-3">
          {summary.isClean
            ? <CheckCircle2 className="h-6 w-6 text-emerald-600 mt-0.5 shrink-0" />
            : <AlertTriangle className="h-6 w-6 text-destructive mt-0.5 shrink-0" />}
          <div className="flex-1">
            <p className={`font-bold ${summary.isClean ? "text-emerald-700" : "text-destructive"}`}>
              {summary.isClean
                ? "نظيف — لا توجد فجوات. تقدر تقفل الفترة بأمان."
                : `يوجد ${formatNumber(summary.totalGaps)} فجوة موزعة على ${nonEmptySections.length} نوع — لازم تسوية قبل الإقفال`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.isClean
                ? "كل فاتورة / إشعار / دفعة في الفترة لها قيد محاسبي سليم؛ كل تخصيص دفعة يشير لـ JE موجود."
                : "اضغط على رابط المعرف للذهاب لصفحة الكيان وإصلاحه. بعد الإصلاح أعد فتح الصفحة (refetch) لتأكيد النظافة."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Summary breakdown */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5 mt-4">
        {summary.bySection.map((s) => (
          <Card key={s.source} className={s.count > 0 ? "border-destructive/30" : ""}>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">
                {SECTION_LABEL[s.source] ?? s.source}
              </p>
              <p className={`text-2xl font-bold ${s.count > 0 ? "text-destructive" : "text-emerald-700"}`}>
                {formatNumber(s.count)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Refresh */}
      <div className="mt-4">
        <Button onClick={() => refetch()} variant="outline" size="sm" rateLimitAware>
          إعادة الفحص
        </Button>
      </div>

      {/* Sections (only those with rows) */}
      {!summary.isClean && (
        <div className="mt-6 space-y-4">
          {nonEmptySections.map(renderSectionTable)}
        </div>
      )}
    </PageShell>
  );
}
