import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  DataTable, type DataTableColumn, PageShell,
} from "@workspace/ui-core";
import { Download, AlertTriangle, CheckCircle2, Scale } from "lucide-react";
import { formatCurrency, todayLocal } from "@/lib/formatters";

/**
 * VAT Reconciliation report page — UI for #1037's
 * GET /reports/vat-reconciliation endpoint.
 *
 * Pre-filing sanity check that ties out the period's Output−Input VAT
 * movement against the live VAT-account balance. A non-zero drift
 * means a JE landed on the VAT account from a non-standard source
 * OR a period boundary was misposted — operator must reconcile
 * BEFORE submitting the monthly ZATCA return.
 */

interface VatReconResponse {
  filters: { startDate?: string; endDate?: string };
  accounts: { outputVatCode: string; inputVatCode: string };
  summary: {
    outputVatPeriod: number;
    inputVatPeriod: number;
    netVatDue: number;
    outputVatLiveBalance: number;
    inputVatLiveBalance: number;
    liveNetPayable: number;
    drift: number;
    driftIsClean: boolean;
  };
  bySource: Array<{
    sourceType: string;
    outputVat: number;
    inputVat: number;
    netVat: number;
  }>;
}

const SOURCE_LABELS: Record<string, string> = {
  invoice:     "فواتير المبيعات",
  credit_memo: "إشعارات دائنة",
  debit_memo:  "إشعارات مدينة",
  voucher:     "سندات",
  payment:     "دفعات",
  expense:     "مصروفات",
  purchase:    "مشتريات",
  grn:         "إيصالات استلام",
  other:       "أخرى",
};

function startOfMonthLocal() {
  // Day-of-month from the Riyadh wall-clock; rebuild with day = 01.
  const t = todayLocal();
  return `${t.slice(0, 8)}01`;
}

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(rows: VatReconResponse["bySource"], filename: string) {
  const headers = ["المصدر", "ضريبة المخرجات", "ضريبة المدخلات", "الصافي"];
  const out = rows.map((r) => [
    csvEscape(SOURCE_LABELS[r.sourceType] ?? r.sourceType),
    r.outputVat.toFixed(2),
    r.inputVat.toFixed(2),
    r.netVat.toFixed(2),
  ]);
  const csv = [headers, ...out].map((r) => r.join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

export default function VatReconciliationPage() {
  const [startDate, setStartDate] = useState(startOfMonthLocal());
  const [endDate, setEndDate] = useState(todayLocal());

  const { data, isLoading, isError, refetch } = useApiQuery<VatReconResponse>(
    ["vat-reconciliation", startDate, endDate],
    `/finance/reports/vat-reconciliation?startDate=${startDate}&endDate=${endDate}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const { summary, bySource, accounts } = data;

  const columns: DataTableColumn<VatReconResponse["bySource"][number]>[] = [
    {
      key: "sourceType",
      header: "المصدر",
      sortable: true,
      render: (r) => (
        <span className="font-medium">
          {SOURCE_LABELS[r.sourceType] ?? r.sourceType}
        </span>
      ),
    },
    {
      key: "outputVat",
      header: "ضريبة المخرجات (مبيعات)",
      sortable: true,
      render: (r) =>
        r.outputVat !== 0
          ? <Badge className="bg-status-success-surface text-status-success-foreground">
              {formatCurrency(r.outputVat)}
            </Badge>
          : "—",
    },
    {
      key: "inputVat",
      header: "ضريبة المدخلات (مشتريات)",
      sortable: true,
      render: (r) =>
        r.inputVat !== 0
          ? <Badge className="bg-status-info-surface text-status-info-foreground">
              {formatCurrency(r.inputVat)}
            </Badge>
          : "—",
    },
    {
      key: "netVat",
      header: "الصافي",
      sortable: true,
      className: "font-bold",
      render: (r) => (
        <span className={r.netVat >= 0 ? "text-emerald-700" : "text-destructive"}>
          {formatCurrency(r.netVat)}
        </span>
      ),
    },
  ];

  return (
    <PageShell
      title="مطابقة ضريبة القيمة المضافة"
      subtitle="مقارنة حركة الفترة على حسابي ضريبة المخرجات / المدخلات مقابل الرصيد الفعلي قبل تقديم إقرار زاتكا الشهري"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "مطابقة الضريبة" },
      ]}
      actions={
        <>
          <DatePicker value={startDate} onChange={setStartDate} className="w-44" placeholder="من" />
          <DatePicker value={endDate} onChange={setEndDate} className="w-44" placeholder="إلى" />
          <GuardedButton
            perm="finance:export"
            variant="outline"
            size="sm"
            onClick={() => exportCSV(bySource, `vat-reconciliation-${startDate}-${endDate}.csv`)}
          >
            <Download className="h-3.5 w-3.5 me-1" />تصدير CSV
          </GuardedButton>
        </>
      }
    >
      {/* الرسالة الرئيسية: drift صفر أم لا */}
      <Card className={summary.driftIsClean
        ? "border-emerald-300 bg-emerald-50/40"
        : "border-status-warning-surface bg-status-warning-surface/40"}>
        <CardContent className="p-4 flex items-start gap-3">
          {summary.driftIsClean
            ? <CheckCircle2 className="h-6 w-6 text-emerald-600 mt-0.5 shrink-0" />
            : <AlertTriangle className="h-6 w-6 text-status-warning-foreground mt-0.5 shrink-0" />}
          <div className="flex-1">
            <p className="font-semibold">
              {summary.driftIsClean
                ? "الأرصدة متطابقة — جاهز للإقرار"
                : `يوجد فرق ${formatCurrency(Math.abs(summary.drift))} يجب مراجعته قبل الإقرار`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.driftIsClean
                ? `صافي الضريبة المستحقة لزاتكا للفترة = ${formatCurrency(summary.netVatDue)}`
                : "الفرق بين رصيد الحسابات الدفتري والمحسوب من قيود الفترة قد يعني قيداً يدوياً على حساب الضريبة من مصدر غير معتاد، أو قيداً وقع خارج حدود الفترة."}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              حسابات الضريبة المستخدمة: المخرجات <span className="font-mono">{accounts.outputVatCode}</span> · المدخلات <span className="font-mono">{accounts.inputVatCode}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* بطاقات الـ KPI */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mt-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">ضريبة المخرجات (الفترة)</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">
              {formatCurrency(summary.outputVatPeriod)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">ضريبة المدخلات (الفترة)</p>
            <p className="text-xl font-bold text-status-info-foreground mt-1">
              {formatCurrency(summary.inputVatPeriod)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">صافي المستحق لزاتكا (الفترة)</p>
            <p className="text-xl font-bold text-orange-600 mt-1">
              {formatCurrency(summary.netVatDue)}
            </p>
          </CardContent>
        </Card>
        <Card className={summary.driftIsClean ? "" : "border-amber-400"}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Scale className="h-3 w-3" />
              الفرق مع الرصيد الفعلي
            </p>
            <p className={`text-xl font-bold mt-1 ${summary.driftIsClean ? "text-emerald-700" : "text-status-warning-foreground"}`}>
              {formatCurrency(summary.drift)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* بطاقات الأرصدة الفعلية */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-3 mt-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">رصيد المخرجات الفعلي (منذ البداية)</p>
            <p className="text-base font-semibold mt-1">{formatCurrency(summary.outputVatLiveBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">رصيد المدخلات الفعلي (منذ البداية)</p>
            <p className="text-base font-semibold mt-1">{formatCurrency(summary.inputVatLiveBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">صافي رصيد المستحق الفعلي</p>
            <p className="text-base font-semibold mt-1">{formatCurrency(summary.liveNetPayable)}</p>
          </CardContent>
        </Card>
      </div>

      {/* تفصيل المصادر */}
      <div className="mt-6">
        <h3 className="text-base font-semibold mb-3">تفصيل حركة الفترة حسب المصدر</h3>
        <DataTable
          columns={columns}
          data={bySource}
          emptyMessage="لا توجد حركة على حسابات الضريبة في هذه الفترة"
          noToolbar
        />
      </div>
    </PageShell>
  );
}
