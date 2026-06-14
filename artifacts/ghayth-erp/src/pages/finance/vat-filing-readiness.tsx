import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  FileCheck2, Download, ArrowDownCircle, ArrowUpCircle, Equal,
  AlertTriangle, CheckCircle2, Calendar, ExternalLink, Building2, Receipt,
} from "lucide-react";
import {
  formatCurrency, formatDateAr, currentYearRiyadh,
  currentMonthPaddedRiyadh, todayLocal,
} from "@/lib/formatters";

/**
 * VAT Filing Readiness — ZATCA quarterly filing prep
 *
 * Shows the user the three months in the chosen quarter side-by-side
 * with output VAT (sales), input VAT (purchases), and net VAT payable.
 * Highlights filing deadline and flags whether the company owes ZATCA
 * or is due a refund.
 *
 * Saudi VAT filing deadlines:
 *   Quarterly filers: 30th of month following quarter end
 *   (Q1 ends Mar → file by Apr 30, etc.)
 *
 * Endpoint: GET /finance/tax/summary?period=YYYY-MM (called 3× per quarter)
 */

interface TaxSummary {
  period: string;
  outputVat: number;
  inputVat: number;
  netVat: number;
  vatRate: number;
  status: "payable" | "refundable";
}

function quarterMonths(quarter: 1 | 2 | 3 | 4): [string, string, string] {
  const start = (quarter - 1) * 3 + 1;
  return [
    String(start).padStart(2, "0"),
    String(start + 1).padStart(2, "0"),
    String(start + 2).padStart(2, "0"),
  ];
}

function quarterFilingDeadline(year: number, quarter: 1 | 2 | 3 | 4): string {
  // Next month after quarter end, day 30
  const endMonth = quarter * 3; // Q1=3, Q2=6, etc.
  const filingMonth = endMonth + 1;
  if (filingMonth > 12) {
    return `${year + 1}-01-30`;
  }
  return `${year}-${String(filingMonth).padStart(2, "0")}-30`;
}

function daysUntil(iso: string, today: string): number {
  const a = new Date(iso + "T00:00:00Z").getTime();
  const b = new Date(today + "T00:00:00Z").getTime();
  return Math.round((a - b) / 86400000);
}

export default function VatFilingReadinessPage() {
  const currentQ = Math.floor((Number(currentMonthPaddedRiyadh()) - 1) / 3) + 1 as 1 | 2 | 3 | 4;
  const [year, setYear] = useState(currentYearRiyadh());
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(currentQ);

  const [m1, m2, m3] = quarterMonths(quarter);
  const periodLabel = `Q${quarter} ${year}`;

  // 3 parallel queries — one per month
  const q1 = useApiQuery<TaxSummary>(["tax-summary", String(year), m1!], `/finance/tax/summary?period=${year}-${m1}`);
  const q2 = useApiQuery<TaxSummary>(["tax-summary", String(year), m2!], `/finance/tax/summary?period=${year}-${m2}`);
  const q3 = useApiQuery<TaxSummary>(["tax-summary", String(year), m3!], `/finance/tax/summary?period=${year}-${m3}`);

  const months = [q1, q2, q3];
  const isLoading = months.some(q => q.isLoading);

  const monthData = useMemo(() => {
    return [m1, m2, m3].map((m, i) => ({
      period: `${year}-${m}`,
      monthLabel: m,
      data: months[i]?.data ?? null,
    }));
  }, [year, m1, m2, m3, q1.data, q2.data, q3.data]);

  const totals = useMemo(() => {
    let output = 0, input = 0;
    for (const md of monthData) {
      if (md.data) {
        output += md.data.outputVat;
        input += md.data.inputVat;
      }
    }
    return { outputVat: output, inputVat: input, netVat: output - input };
  }, [monthData]);

  const today = todayLocal();
  const deadline = quarterFilingDeadline(year, quarter);
  const daysToDeadline = daysUntil(deadline, today);
  const isOverdue = daysToDeadline < 0;
  const isUrgent = daysToDeadline >= 0 && daysToDeadline <= 14;

  const exportCSV = () => {
    const lines: string[] = [];
    lines.push(`إعداد إقرار ZATCA — ${periodLabel}`);
    lines.push(`الموعد النهائي: ${deadline}`);
    lines.push("");
    lines.push("الشهر,ضريبة المخرجات,ضريبة المدخلات,الصافي,الحالة");
    for (const md of monthData) {
      const d = md.data;
      lines.push([
        md.period,
        d ? d.outputVat.toFixed(2) : "0.00",
        d ? d.inputVat.toFixed(2) : "0.00",
        d ? d.netVat.toFixed(2) : "0.00",
        d?.status ?? "—",
      ].join(","));
    }
    lines.push("");
    lines.push(`الإجمالي,${totals.outputVat.toFixed(2)},${totals.inputVat.toFixed(2)},${totals.netVat.toFixed(2)},${totals.netVat > 0 ? "مستحق الدفع" : "مستحق الاسترداد"}`);

    // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
    // Routed through unified export helper for audit + letterhead.
    {
      const _allLines = lines;
      const _headers = (_allLines[0] ?? "").split(",");
      const _rows = _allLines.slice(1).map((line) => {
        const parts = line.split(",");
        const obj: Record<string, string> = {};
        _headers.forEach((h, i) => { obj[h] = parts[i] ?? ""; });
        return obj;
      });
      void exportRowsToCsv({
        entityType: "report_vat_filing_readiness",
        title: String(`vat-readiness-${year}-Q${quarter}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="جاهزية إقرار ZATCA"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "جاهزية إقرار ZATCA" },
      ]}
      subtitle={`${periodLabel} — تجميع ضرائب القيمة المضافة الفصلية للإقرار`}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/tax-filing-calendar">
              <Calendar className="h-3.5 w-3.5 ml-1" />
              تقويم الإقرارات
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/reports/zatca">
              <Building2 className="h-3.5 w-3.5 ml-1" />
              تقارير ZATCA
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/wht-filing-workbench">
              <Receipt className="h-3.5 w-3.5 ml-1" />
              منضدة WHT
            </Link></Button>
        </div>
      }
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">السنة</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border rounded px-3 py-1.5 text-sm bg-background"
            >
              {[currentYearRiyadh(), currentYearRiyadh() - 1, currentYearRiyadh() - 2].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الربع</label>
            <div className="flex gap-1">
              {([1, 2, 3, 4] as const).map(q => (
                <Button
                  key={q}
                  variant={quarter === q ? "default" : "outline"}
                  size="sm"
                  onClick={() => setQuarter(q)}
                >
                  Q{q}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex-1" />
          <Button asChild variant="outline" size="sm"><Link href="/finance/reports/zatca">
              <FileCheck2 className="w-4 h-4 ml-1" />
              مركز تقارير ZATCA
            </Link></Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={isLoading}>
            <Download className="w-4 h-4 ml-1" />
            CSV
          </Button>
          <PrintButton
            entityType="report_vat_filing_readiness"
            entityId="all"
            payload={{
              entity: { title: "جاهزية إقرار ضريبة القيمة المضافة" },
              items: [],
            }}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* Filing deadline alert */}
          <Card className={`mb-4 ${isOverdue ? "border-status-danger-foreground border-2" : isUrgent ? "border-status-warning-foreground border-2" : ""}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isOverdue ? (
                    <AlertTriangle className="w-8 h-8 text-status-danger-foreground" />
                  ) : isUrgent ? (
                    <AlertTriangle className="w-8 h-8 text-status-warning-foreground" />
                  ) : (
                    <Calendar className="w-8 h-8 text-status-info-foreground" />
                  )}
                  <div>
                    <div className="text-xs text-muted-foreground">الموعد النهائي لإقرار {periodLabel}</div>
                    <div className="text-lg font-bold">{formatDateAr(deadline)}</div>
                  </div>
                </div>
                <div className="text-end">
                  {isOverdue ? (
                    <>
                      <div className="text-2xl font-bold text-status-danger-foreground">
                        متأخر {Math.abs(daysToDeadline)} يوم
                      </div>
                      <div className="text-xs text-status-danger-foreground">قدّم الإقرار فوراً</div>
                    </>
                  ) : daysToDeadline === 0 ? (
                    <div className="text-2xl font-bold text-status-warning-foreground">اليوم!</div>
                  ) : (
                    <>
                      <div className={`text-2xl font-bold ${isUrgent ? "text-status-warning-foreground" : "text-status-info-foreground"}`}>
                        {daysToDeadline} يوم
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {isUrgent ? "اقترب الموعد" : "متبقي"}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Per-month tiles */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">ضريبة القيمة المضافة شهرياً</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {monthData.map(md => {
                  const d = md.data;
                  return (
                    <div key={md.period} className="border rounded p-3">
                      <div className="text-xs text-muted-foreground mb-2">
                        {md.period} • شهر {md.monthLabel}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1 text-status-success-foreground">
                            <ArrowUpCircle className="w-3 h-3" />
                            مخرجات
                          </span>
                          <span className="tabular-nums font-semibold">{formatCurrency(d?.outputVat ?? 0)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1 text-status-warning-foreground">
                            <ArrowDownCircle className="w-3 h-3" />
                            مدخلات
                          </span>
                          <span className="tabular-nums font-semibold">{formatCurrency(d?.inputVat ?? 0)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm border-t pt-2">
                          <span className="flex items-center gap-1 font-semibold">
                            <Equal className="w-3 h-3" />
                            صافي
                          </span>
                          <span className={`tabular-nums font-bold ${(d?.netVat ?? 0) > 0 ? "text-status-danger-foreground" : (d?.netVat ?? 0) < 0 ? "text-status-success-foreground" : ""}`}>
                            {(d?.netVat ?? 0) > 0 ? "+" : ""}{formatCurrency(d?.netVat ?? 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Quarter totals */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">إجمالي الربع — {periodLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-status-success-surface rounded p-4 text-center">
                  <ArrowUpCircle className="w-6 h-6 text-status-success-foreground mx-auto mb-1" />
                  <div className="text-xs text-muted-foreground">إجمالي المخرجات</div>
                  <div className="text-xl font-bold tabular-nums text-status-success-foreground">
                    {formatCurrency(totals.outputVat)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">على مبيعات</div>
                </div>
                <div className="bg-status-warning-surface rounded p-4 text-center">
                  <ArrowDownCircle className="w-6 h-6 text-status-warning-foreground mx-auto mb-1" />
                  <div className="text-xs text-muted-foreground">إجمالي المدخلات</div>
                  <div className="text-xl font-bold tabular-nums text-status-warning-foreground">
                    {formatCurrency(totals.inputVat)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">على مشتريات</div>
                </div>
                <div className={`${totals.netVat > 0 ? "bg-status-danger-surface" : "bg-status-success-surface"} rounded p-4 text-center`}>
                  <Equal className={`w-6 h-6 ${totals.netVat > 0 ? "text-status-danger-foreground" : "text-status-success-foreground"} mx-auto mb-1`} />
                  <div className="text-xs text-muted-foreground">صافي الإقرار</div>
                  <div className={`text-xl font-bold tabular-nums ${totals.netVat > 0 ? "text-status-danger-foreground" : "text-status-success-foreground"}`}>
                    {totals.netVat > 0 ? "+" : ""}{formatCurrency(totals.netVat)}
                  </div>
                  <div className={`text-[10px] mt-1 font-semibold ${totals.netVat > 0 ? "text-status-danger-foreground" : "text-status-success-foreground"}`}>
                    {totals.netVat > 0 ? "تدفع لـ ZATCA" : "مستحق استرداد"}
                  </div>
                </div>
              </div>

              {/* Calculation breakdown */}
              <div className="border rounded p-3 bg-muted/30 text-sm">
                <div className="font-semibold mb-2">معادلة الحساب</div>
                <table className="w-full">
                  <tbody>
                    <tr className="border-b">
                      <td className="py-1">ضريبة المخرجات (output VAT) — مجموع VAT على فواتير المبيعات + إشعارات مدينة − إشعارات دائنة</td>
                      <td className="py-1 text-end tabular-nums font-semibold">+{formatCurrency(totals.outputVat)}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1">ضريبة المدخلات (input VAT) — مجموع المدين على حساب VAT المدخلات (1180)</td>
                      <td className="py-1 text-end tabular-nums font-semibold">-{formatCurrency(totals.inputVat)}</td>
                    </tr>
                    <tr className="font-bold">
                      <td className="py-2">صافي ضريبة القيمة المضافة المستحقة</td>
                      <td className={`py-2 text-end tabular-nums ${totals.netVat > 0 ? "text-status-danger-foreground" : "text-status-success-foreground"}`}>
                        ={formatCurrency(totals.netVat)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Action checklist */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                قائمة المراجعة قبل التقديم
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <ChecklistItem label="راجع كل فواتير المبيعات في الربع — لا توجد فواتير draft معلقة" href="/finance/invoices?status=draft" />
                <ChecklistItem label="راجع كل المصاريف المدخلة — input VAT يطابق فواتير ضريبية" href="/finance/expenses" />
                <ChecklistItem label="راجع إشعارات الدائن والمدين — تخفض/تزيد VAT المخرجات بشكل صحيح" href="/finance/invoices" />
                <ChecklistItem label="عدّل الفترة المحاسبية إن لزم قبل التقديم النهائي" href="/finance/fiscal-periods-v2" />
                <ChecklistItem label="اطبع قائمة الفواتير وأرفقها مع الإقرار" href="/finance/reports/zatca" />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}

function ChecklistItem({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href}>
      <div className="flex items-center gap-2 p-2 rounded hover:bg-muted/30 cursor-pointer">
        <div className="w-4 h-4 rounded border-2 border-muted-foreground shrink-0" />
        <span className="flex-1">{label}</span>
        <ExternalLink className="w-3 h-3 text-muted-foreground" />
      </div>
    </Link>
  );
}
