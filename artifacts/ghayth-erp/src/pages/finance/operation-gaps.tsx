import { useApiQuery } from "@/lib/api";
import { exportRowsToCsv } from "@/lib/unified-export";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Button } from "@/components/ui/button";
import { PageShell, DataTable, type DataTableColumn, AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { CheckCircle2, AlertTriangle, Download, FileWarning } from "lucide-react";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

/**
 * Operation-level finance gap report (#1715 §10). Consumes
 * /finance/reports/operation-gaps. Surfaces the governance gaps the issue
 * lists: payment-method↔account conflicts, operations with no money source,
 * party/target accounts missing their dimension, conflicting party fields,
 * un-allocated costs, allocation overrides, and postable accounts still
 * missing accountUsage. Read-only — each row deep-links to the entity.
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
  payment_method_account_conflict: "تعارض طريقة الدفع مع الحساب",
  missing_money_source:            "بلا مصدر مالي صحيح",
  party_account_without_party:     "ذمم بلا طرف مرتبط",
  conflicting_party_fields:        "حقول الطرف متعارضة",
  cost_without_target:             "تكلفة بلا ربط/مركز",
  allocation_overrides:            "تجاوزات الربط (override)",
  postable_accounts_missing_usage: "حسابات قابلة للترحيل بلا تصنيف",
};

const SECTION_HINT: Record<string, string> = {
  payment_method_account_conflict:
    "طريقة الدفع لا تطابق تصنيف حساب المصدر (مثلاً نقدي على حساب بنكي). صحّح الحساب أو طريقة الدفع.",
  missing_money_source:
    "العملية لها طريقة دفع لكن لا يوجد حساب صندوق/بنك/عهدة في أطرافها.",
  party_account_without_party:
    "القيد يمسّ ذمماً مدينة/دائنة لكن بلا طرف مرتبط (عميل/مورد). اربط الطرف.",
  conflicting_party_fields:
    "نوع الطرف موجود بلا معرّف أو العكس — بيانات ربط ناقصة.",
  cost_without_target:
    "مصروف/تكلفة بلا مركز تكلفة ولا ربط بكيان — لن تظهر في تقارير التكلفة.",
  allocation_overrides:
    "عمليات تجاوزت ضوابط الربط بسبب مسجَّل. راجعها دورياً.",
  postable_accounts_missing_usage:
    "حسابات قابلة للترحيل بلا accountUsage — صنّفها قبل الترحيل (تصنيف تلقائي متاح في «فجوات تصنيف الحسابات»).",
};

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(sections: GapsResponse["sections"], filename: string) {
  const headers = ["القسم", "المعرف", "المرجع", "الفجوة", "المبلغ", "التاريخ"];
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
  void exportRowsToCsv({
    entityType: "report_operation_gaps",
    title: String(filename).replace(/\.csv$/i, ""),
    rows: rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]]))),
    columns: headers.map((h) => ({ key: h, label: h })),
  }).catch((err) => console.error("[export] failed", err));
}

export default function OperationGapsPage() {
  const { data, isLoading, isError, refetch } = useApiQuery<GapsResponse>(
    ["operation-gaps"],
    "/finance/reports/operation-gaps",
  );

  // Search filters the PRIMARY section's rows (ref/gap text). Hooks run
  // before the early returns below.
  const [filters, setFilters] = useFilters();

  // Print targets the PRIMARY section only — the first non-empty section.
  // Sections have heterogeneous meaning (each is a distinct gap type) but a
  // uniform GapRow shape, so a single printed table is coherent.
  const allSections = data?.sections ?? [];
  const primarySection = allSections.find((s) => s.rows.length > 0) ?? null;
  // Search applies to the primary section only; print follows the filtered set.
  const filteredPrimaryRows = applyFilters(primarySection?.rows ?? [], filters, {
    searchFields: ["ref", "gap"],
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } =
    usePrintRows<GapRow>(filteredPrimaryRows);

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const { summary, sections } = data;

  const renderEntityLink = (section: string, entityId: number, ref: string | null) => {
    const path =
      section === "postable_accounts_missing_usage" ? `/finance/accounts/${entityId}/edit` :
      section === "allocation_overrides" ? null :
      `/finance/journal/${entityId}`;
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
    const isPrimary = !!primarySection && section.source === primarySection.source;
    // The primary section is searchable; its table renders the filtered set.
    const tableRows = isPrimary ? filteredPrimaryRows : section.rows;
    const cols: DataTableColumn<GapRow>[] = [
      { key: "entityId", header: "المعرف",
        render: (r) => renderEntityLink(section.source, r.entityId, r.ref) },
      { key: "gap", header: "نوع الفجوة",
        render: (r) => <span className="text-destructive text-xs">{r.gap}</span> },
      { key: "amount", header: "المبلغ",
        render: (r) => r.amount != null
          ? <span className="font-mono">{formatCurrency(Number(r.amount))}</span>
          : "—" },
      { key: "createdAt", header: "التاريخ",
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
          {isPrimary && (
            <AdvancedFilters
              config={{ searchPlaceholder: "بحث بالمرجع أو نوع الفجوة…", showDateRange: false }}
              values={filters}
              onChange={setFilters}
              resultCount={filteredPrimaryRows.length}
            />
          )}
          <DataTable
            columns={cols}
            data={tableRows}
            emptyMessage="—"
            pageSize={25}
            noToolbar
            // Only the primary (first non-empty) section feeds the printed list.
            {...(isPrimary ? { onSortedDataChange: setPrintRows } : {})}
          />
        </CardContent>
      </Card>
    );
  };

  const nonEmptySections = sections.filter((s) => s.rows.length > 0);

  return (
    <PageShell
      title="فجوات العمليات المالية"
      subtitle="فحص حوكمة على مستوى العمليات — تعارض طرق الدفع، عمليات بلا مصدر/طرف/ربط، وتجاوزات (#1715 §10)"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "فجوات العمليات" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/reports/gl-integrity-gaps">
              <AlertTriangle className="h-3.5 w-3.5 me-1" />فجوات الـ GL
            </Link></Button>
          {nonEmptySections.length > 0 ? (
            <GuardedButton
              perm="finance:export" variant="outline" size="sm"
              onClick={() => exportCSV(sections, `operation-gaps-${todayLocal()}.csv`)}
            >
              <Download className="h-3.5 w-3.5 me-1" />تصدير CSV
            </GuardedButton>
          ) : null}
          {primarySection ? (
            <PrintButton
              entityType="report_operation_gaps"
              entityId="list"
              size="icon"
              payload={() => ({
                entity: {
                  title: `فجوات العمليات المالية — ${SECTION_LABEL[primarySection.source] ?? primarySection.source}`,
                  total: printRows.length,
                },
                items: printRows.map((r: GapRow) => ({
                  "المعرف": r.ref || `#${r.entityId}`,
                  "نوع الفجوة": r.gap,
                  "المبلغ": r.amount != null ? formatCurrency(Number(r.amount)) : "—",
                  "التاريخ": r.createdAt?.slice(0, 10) ?? "—",
                })),
              })}
            />
          ) : null}
        </div>
      }
    >
      <FinanceTabsNav />
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
                ? "نظيف — لا توجد فجوات في العمليات المالية."
                : `يوجد ${formatNumber(summary.totalGaps)} فجوة موزّعة على ${nonEmptySections.length} نوع`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.isClean
                ? "كل عملية لها مصدر مالي صحيح وطرف وربط متّسق، ولا تجاوزات بلا سبب."
                : "اضغط على المعرف للذهاب للقيد/الحساب وإصلاحه، ثم أعد الفحص."}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7 mt-4">
        {summary.bySection.map((s) => (
          <Card key={s.source} className={s.count > 0 ? "border-destructive/30" : ""}>
            <CardContent className="p-3 text-center">
              <p className="text-[11px] text-muted-foreground mb-1 leading-tight">
                {SECTION_LABEL[s.source] ?? s.source}
              </p>
              <p className={`text-2xl font-bold ${s.count > 0 ? "text-destructive" : "text-emerald-700"}`}>
                {formatNumber(s.count)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4">
        <Button onClick={() => refetch()} variant="outline" size="sm" rateLimitAware>
          إعادة الفحص
        </Button>
      </div>

      {!summary.isClean && (
        <div className="mt-6 space-y-4">
          {nonEmptySections.map(renderSectionTable)}
        </div>
      )}
    </PageShell>
  );
}
