import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { DataTable, type DataTableColumn, PageShell } from "@workspace/ui-core";
import { ShieldCheck, AlertTriangle, FileWarning, Layers, Unlink } from "lucide-react";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

/**
 * لوحة صدق دفتر الأستاذ — FIN-INTEGRITY-CONTRACT (#2246) المرحلة أ (قياس فقط).
 *
 * تعرض حجم تسريب الأبعاد + ترحيلات الحساب الافتراضي + القيد اليدوي الأعمى،
 * **بلا أي إنفاذ**. تقرأ من /finance/reports/ledger-truth.
 * مكمّلة لـ«فجوات تكامل الأستاذ» (الربط) و«البنود غير الموجَّهة» (ما قبل الترحيل).
 */

const DIM_LABEL: Record<string, string> = {
  vehicle: "مركبة", property: "عقار", project: "مشروع", vendor: "مورد", client: "عميل",
};

interface LedgerTruthResponse {
  filters: { startDate: string | null; endDate: string | null; branchId: string | null };
  summary: {
    dimTotalLines: number; dimMissingLines: number; dimMissingValue: number;
    completenessPct: number; fallbackTotal: number; manualTotal: number; manualBlind: number;
    orphanSourceTotal: number;
    enforcement: string; phase: string;
  };
  dimensionCompleteness: Array<{ expectedDim: string; totalLines: number; missingLines: number; missingValue: number; completenessPct: number }>;
  byDoor: Array<{ door: string; missingLines: number; missingValue: number }>;
  fallbackByOperation: Array<{ operationType: string; count: number }>;
  manual: { total: number; noReason: number; noDimension: number; blind: number };
  nonPostableAccountEntries: Array<{ journalId: number; ref: string | null; createdAt: string; accountCode: string; accountName: string; reason: string }>;
  manualOperationalNoReason: Array<{ journalId: number; ref: string | null; createdAt: string; description: string | null }>;
  orphanSourceEntries: Array<{ journalId: number; ref: string | null; date: string; type: string | null; amount: number }>;
  ratchetReadiness: Array<{ expectedDim: string; missingLines: number; missingValue: number; completenessPct: number }>;
}

function startOfYearLocal() {
  return `${todayLocal().slice(0, 4)}-01-01`;
}

const pctColor = (pct: number) =>
  pct >= 95 ? "text-emerald-700" : pct >= 80 ? "text-status-warning-foreground" : "text-destructive";

export default function LedgerTruthPage() {
  const [startDate, setStartDate] = useState(startOfYearLocal());
  const [endDate, setEndDate] = useState(todayLocal());

  const { data, isLoading, isError } = useApiQuery<LedgerTruthResponse>(
    ["ledger-truth", startDate, endDate],
    `/finance/reports/ledger-truth?startDate=${startDate}&endDate=${endDate}`,
  );

  // Primary truth table = dimension completeness (the headline measurement).
  // Seeded from the optional response so the hook stays above the early return.
  const { sortedRows: printRows, setSortedRows: setPrintRows } =
    usePrintRows<LedgerTruthResponse["dimensionCompleteness"][number]>(data?.dimensionCompleteness ?? []);

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const { summary, dimensionCompleteness, byDoor, fallbackByOperation, manual, nonPostableAccountEntries, manualOperationalNoReason, orphanSourceEntries, ratchetReadiness } = data;

  const dimColumns: DataTableColumn<LedgerTruthResponse["dimensionCompleteness"][number]>[] = [
    { key: "expectedDim", header: "البُعد المطلوب", render: (r) => <span className="font-medium">{DIM_LABEL[r.expectedDim] ?? r.expectedDim}</span> },
    { key: "totalLines", header: "إجمالي السطور", sortable: true, render: (r) => formatNumber(r.totalLines) },
    { key: "missingLines", header: "سطور بلا بُعد", sortable: true, render: (r) => <span className={r.missingLines > 0 ? "text-destructive font-semibold" : ""}>{formatNumber(r.missingLines)}</span> },
    { key: "missingValue", header: "القيمة اليتيمة", sortable: true, render: (r) => <span className="text-orange-700">{formatCurrency(r.missingValue)}</span> },
    { key: "completenessPct", header: "اكتمال %", sortable: true, render: (r) => <span className={`font-bold ${pctColor(r.completenessPct)}`}>{r.completenessPct.toFixed(2)}%</span> },
  ];

  const doorColumns: DataTableColumn<LedgerTruthResponse["byDoor"][number]>[] = [
    { key: "door", header: "باب الترحيل (type)", render: (r) => <span className="font-mono text-xs">{r.door}</span> },
    { key: "missingLines", header: "سطور بلا بُعد", sortable: true, render: (r) => formatNumber(r.missingLines) },
    { key: "missingValue", header: "القيمة", sortable: true, render: (r) => <span className="text-orange-700">{formatCurrency(r.missingValue)}</span> },
  ];

  const fbColumns: DataTableColumn<LedgerTruthResponse["fallbackByOperation"][number]>[] = [
    { key: "operationType", header: "نوع العملية", render: (r) => <span className="font-mono text-xs">{r.operationType}</span> },
    { key: "count", header: "مرات الحساب الافتراضي", sortable: true, render: (r) => <span className="text-destructive font-semibold">{formatNumber(r.count)}</span> },
  ];

  const nonPostableColumns: DataTableColumn<LedgerTruthResponse["nonPostableAccountEntries"][number]>[] = [
    { key: "journalId", header: "القيد", render: (r) => <span className="font-mono text-xs">#{r.journalId}</span> },
    { key: "ref", header: "المرجع", render: (r) => <span className="font-mono text-xs">{r.ref ?? "—"}</span> },
    { key: "accountCode", header: "الحساب", render: (r) => <span className="font-mono text-xs">{r.accountCode}</span> },
    { key: "accountName", header: "اسم الحساب", render: (r) => r.accountName },
    { key: "reason", header: "السبب", render: (r) => <span className="text-destructive font-semibold">{r.reason}</span> },
    { key: "createdAt", header: "التاريخ", render: (r) => <span className="text-xs">{r.createdAt.slice(0, 10)}</span> },
  ];

  const manualNoReasonColumns: DataTableColumn<LedgerTruthResponse["manualOperationalNoReason"][number]>[] = [
    { key: "journalId", header: "القيد", render: (r) => <span className="font-mono text-xs">#{r.journalId}</span> },
    { key: "ref", header: "المرجع", render: (r) => <span className="font-mono text-xs">{r.ref ?? "—"}</span> },
    { key: "description", header: "الوصف", render: (r) => <span className="text-status-warning-foreground">{r.description || "بلا سبب"}</span> },
    { key: "createdAt", header: "التاريخ", render: (r) => <span className="text-xs">{r.createdAt.slice(0, 10)}</span> },
  ];

  const orphanSourceColumns: DataTableColumn<LedgerTruthResponse["orphanSourceEntries"][number]>[] = [
    { key: "journalId", header: "القيد", render: (r) => <span className="font-mono text-xs">#{r.journalId}</span> },
    { key: "ref", header: "المرجع", render: (r) => <span className="font-mono text-xs">{r.ref ?? "—"}</span> },
    { key: "type", header: "باب الترحيل (type)", render: (r) => <span className="font-mono text-xs">{r.type ?? "—"}</span> },
    { key: "amount", header: "القيمة", sortable: true, render: (r) => <span className="text-destructive font-semibold">{formatCurrency(r.amount)}</span> },
    { key: "date", header: "التاريخ", render: (r) => <span className="text-xs">{r.date.slice(0, 10)}</span> },
  ];

  const ratchetColumns: DataTableColumn<LedgerTruthResponse["ratchetReadiness"][number]>[] = [
    { key: "expectedDim", header: "الصنف", render: (r) => <span className="font-medium">{DIM_LABEL[r.expectedDim] ?? r.expectedDim}</span> },
    { key: "missingValue", header: "حجم التسريب", sortable: true, render: (r) => formatCurrency(r.missingValue) },
    { key: "completenessPct", header: "اكتمال %", sortable: true, render: (r) => <span className={`font-bold ${pctColor(r.completenessPct)}`}>{r.completenessPct.toFixed(2)}%</span> },
  ];

  return (
    <PageShell
      title="صدق دفتر الأستاذ (قياس)"
      subtitle="قياس اكتمال الأبعاد + الحساب الافتراضي + القيد اليدوي الأعمى — بلا إنفاذ (المرحلة أ). مكمّل لـ«فجوات تكامل الأستاذ» و«البنود غير الموجَّهة»."
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "صدق دفتر الأستاذ" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <DatePicker value={startDate} onChange={setStartDate} className="w-44" placeholder="من" />
          <DatePicker value={endDate} onChange={setEndDate} className="w-44" placeholder="إلى" />
          <PrintButton
            entityType="report_finance_ledger_truth_dimensions"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "اكتمال الأبعاد حسب الصنف", total: printRows.length },
              items: printRows.map((r) => ({
                "البُعد المطلوب": DIM_LABEL[r.expectedDim] ?? r.expectedDim,
                "إجمالي السطور": r.totalLines,
                "سطور بلا بُعد": r.missingLines,
                "القيمة اليتيمة": r.missingValue,
                "اكتمال %": `${r.completenessPct.toFixed(2)}%`,
              })),
            })}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      <div className="rounded-md bg-status-info-surface/40 border border-status-info-surface p-2 text-xs text-status-info-foreground mb-4">
        مرحلة <span className="font-semibold">القياس فقط</span> — لا يوجد منع أو رفض للقيود. الغرض تحديد حجم التسريب قبل تفعيل الإنفاذ تدريجيًا (ratchet) صنفًا صنفًا.
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card>
          <CardContent className="p-4 text-center">
            <ShieldCheck className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">اكتمال الأبعاد</p>
            <p className={`text-xl font-bold mt-1 ${pctColor(summary.completenessPct)}`}>{summary.completenessPct.toFixed(2)}%</p>
            <p className="text-[10px] text-muted-foreground mt-1">{formatNumber(summary.dimMissingLines)} / {formatNumber(summary.dimTotalLines)} سطر</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Layers className="h-5 w-5 text-orange-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">القيمة اليتيمة (بلا بُعد)</p>
            <p className="text-xl font-bold text-orange-700 mt-1">{formatCurrency(summary.dimMissingValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-5 w-5 text-destructive mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">ترحيلات الحساب الافتراضي</p>
            <p className="text-xl font-bold text-destructive mt-1">{formatNumber(summary.fallbackTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <FileWarning className="h-5 w-5 text-status-warning-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">قيد يدوي أعمى</p>
            <p className="text-xl font-bold text-status-warning-foreground mt-1">{formatNumber(summary.manualBlind)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">من {formatNumber(summary.manualTotal)} يدوي</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Unlink className="h-5 w-5 text-destructive mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">قيود يتيمة المصدر</p>
            <p className="text-xl font-bold text-destructive mt-1">{formatNumber(summary.orphanSourceTotal)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">قيد آلي مُرحَّل بلا مصدر</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">اكتمال الأبعاد حسب الصنف</h3>
        <DataTable columns={dimColumns} data={dimensionCompleteness} onSortedDataChange={setPrintRows} emptyMessage="لا توجد سطور مُبعّدة في هذه الفترة" noToolbar />
      </div>

      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">التسريب حسب باب الترحيل</h3>
        <DataTable columns={doorColumns} data={byDoor} emptyMessage="لا تسريب" noToolbar />
      </div>

      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">ترحيلات الحساب الافتراضي حسب نوع العملية</h3>
        <DataTable columns={fbColumns} data={fallbackByOperation} emptyMessage="لا ترحيلات افتراضية" noToolbar />
      </div>

      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">القيد اليدوي</h3>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 text-sm">
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">إجمالي يدوي</p><p className="text-lg font-bold mt-1">{formatNumber(manual.total)}</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">بلا سبب</p><p className="text-lg font-bold mt-1">{formatNumber(manual.noReason)}</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">بلا أي بُعد</p><p className="text-lg font-bold mt-1">{formatNumber(manual.noDimension)}</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">أعمى (الاثنان)</p><p className="text-lg font-bold text-status-warning-foreground mt-1">{formatNumber(manual.blind)}</p></CardContent></Card>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">قيود على حساب غير قابل للترحيل (allowPosting=false / غير نشط / محذوف)</h3>
        <DataTable columns={nonPostableColumns} data={nonPostableAccountEntries} emptyMessage="لا قيود على حسابات غير قابلة للترحيل" noToolbar />
      </div>

      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">قيود يدوية مرتبطة تشغيليًا بلا سبب</h3>
        <DataTable columns={manualNoReasonColumns} data={manualOperationalNoReason} emptyMessage="لا قيود يدوية تشغيلية بلا سبب" noToolbar />
      </div>

      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">قيود يتيمة المصدر (قيد آلي مُرحَّل بلا مصدر — تُستثنى أبواب الإقفال/التسوية/المطابقة)</h3>
        <DataTable columns={orphanSourceColumns} data={orphanSourceEntries} emptyMessage="لا قيود آلية يتيمة بالمصدر" noToolbar />
      </div>

      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">جاهزية الإنفاذ التدريجي (الأصغر تسريبًا أولًا)</h3>
        <DataTable columns={ratchetColumns} data={ratchetReadiness} emptyMessage="—" noToolbar />
      </div>
    </PageShell>
  );
}
