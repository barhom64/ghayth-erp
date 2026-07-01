import { useMemo, useState } from "react";
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
  FileText, TrendingUp, TrendingDown, AlertTriangle,
  Banknote, Building2, Users, Clock, ChevronRight, Calendar,
} from "lucide-react";
import {
  formatCurrency, formatDateAr, currentYearRiyadh,
  currentMonthPaddedRiyadh, todayLocal,
} from "@/lib/formatters";

/**
 * Monthly Close Board Pack
 *
 * One-page printable summary for the monthly close: condensed P&L,
 * balance sheet, cash flow, top variances, AR/AP highlights, all in
 * a layout that fits an A4 print without scrolling.
 *
 * Pulls 6 endpoints in parallel:
 *   /reports/income-statement, /reports/balance-sheet, /reports/cash-flow,
 *   /reports/budget-variance, /ar-aging, /payment-run/pending
 */

interface PnlResp {
  revenue?: { total: number };
  cogs?: { total: number };
  grossProfit?: number;
  operatingExpenses?: { total: number };
  operatingIncome?: number;
  netIncome?: number;
}
interface BsResp {
  assets?: { current: { total: number }; nonCurrent: { total: number }; total: number };
  liabilities?: { current: { total: number }; nonCurrent: { total: number }; total: number };
  equity?: { total: number };
}
interface CfResp {
  openingCash: number;
  closingCash: number;
  netChange: number;
  sections: {
    operating: { net: number };
    investing: { net: number };
    financing: { net: number };
  };
}
interface BudgetVarRow {
  accountCode: string;
  accountName: string;
  type: string;
  budget: number | string;
  actual: number | string;
  variance: number | string;
  usagePct: number | string;
}
interface BudgetResp { data: BudgetVarRow[]; summary: { totalBudget: number; totalActual: number; totalVariance: number } }
interface ArClient {
  clientId: number;
  clientName: string;
  total: number;
  current: number;
  over90: number;
}
interface ArResp { clients: ArClient[]; summary: { grandTotal: number; over90: number } }
interface ApPo {
  id: number;
  ref: string;
  supplierName: string;
  totalAmount: number | string;
  expectedDelivery: string | null;
}
interface ApResp { data: ApPo[]; totalDue: number; byVendor?: Array<{ supplierName: string; amount: number; count: number }> }

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export default function MonthlyClosePackPage() {
  const [year, setYear] = useState(currentYearRiyadh());
  const [month, setMonth] = useState(currentMonthPaddedRiyadh());
  const today = todayLocal();

  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${String(daysInMonth(year, Number(month))).padStart(2, "0")}`;
  const period = `${year}-${month}`;

  const pnl = useApiQuery<PnlResp>(["mcp-pnl", String(year), month], `/finance/reports/income-statement?startDate=${startDate}&endDate=${endDate}`);
  const bs = useApiQuery<BsResp>(["mcp-bs", String(year), month], `/finance/reports/balance-sheet?endDate=${endDate}`);
  const cf = useApiQuery<CfResp>(["mcp-cf", String(year), month], `/finance/reports/cash-flow?startDate=${startDate}&endDate=${endDate}`);
  const bud = useApiQuery<BudgetResp>(["mcp-bud", String(year), month], `/finance/reports/budget-variance?period=${period}`);
  const ar = useApiQuery<ArResp>(["mcp-ar", today], `/finance/ar-aging?asOfDate=${today}`);
  const ap = useApiQuery<ApResp>(["mcp-ap"], `/finance/payment-run/pending`);

  const isLoading = [pnl, bs, cf, bud, ar, ap].some(q => q.isLoading);

  // Top 5 variances (worst overruns)
  const topVariances = useMemo(() => {
    if (!bud.data?.data) return [];
    return bud.data.data
      .filter(r => Number(r.budget) > 0)
      .map(r => ({
        ...r,
        absVariance: Math.abs(Number(r.actual) - Number(r.budget)),
        pctOver: ((Number(r.actual) - Number(r.budget)) / Number(r.budget)) * 100,
      }))
      .sort((a, b) => b.absVariance - a.absVariance)
      .slice(0, 5);
  }, [bud.data]);

  const topAr = useMemo(() => {
    if (!ar.data?.clients) return [];
    return ar.data.clients
      .filter(c => c.total - c.current > 0)
      .slice(0, 5);
  }, [ar.data]);

  const topAp = useMemo(() => {
    if (!ap.data?.byVendor) return [];
    return ap.data.byVendor.slice().sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [ap.data]);

  return (
    <PageShell
      title="حزمة الإقفال الشهري"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "حزمة الإقفال الشهري" },
      ]}
      subtitle={`ملخص ${period} للعرض على مجلس الإدارة — قابل للطباعة في صفحة واحدة`}
      actions={
        <PrintButton
          entityType="report_finance_monthly_close_pack"
          entityId={period}
          size="icon"
          payload={{
            entity: { title: `حزمة الإقفال الشهري — ${period}`, total: 8 },
            items: [
              { "البند": "إجمالي الإيرادات", "القيمة": Number(pnl.data?.revenue?.total ?? 0) },
              { "البند": "تكلفة المبيعات", "القيمة": Number(pnl.data?.cogs?.total ?? 0) },
              { "البند": "إجمالي الربح", "القيمة": Number(pnl.data?.grossProfit ?? 0) },
              { "البند": "المصروفات التشغيلية", "القيمة": Number(pnl.data?.operatingExpenses?.total ?? 0) },
              { "البند": "الدخل التشغيلي", "القيمة": Number(pnl.data?.operatingIncome ?? 0) },
              { "البند": "صافي الدخل", "القيمة": Number(pnl.data?.netIncome ?? 0) },
              { "البند": "إجمالي الأصول", "القيمة": Number(bs.data?.assets?.total ?? 0) },
              { "البند": "إجمالي الالتزامات", "القيمة": Number(bs.data?.liabilities?.total ?? 0) },
              { "البند": "إجمالي حقوق الملكية", "القيمة": Number(bs.data?.equity?.total ?? 0) },
              { "البند": "النقد الافتتاحي", "القيمة": Number(cf.data?.openingCash ?? 0) },
              { "البند": "النقد الختامي", "القيمة": Number(cf.data?.closingCash ?? 0) },
              { "البند": "صافي التغير في النقد", "القيمة": Number(cf.data?.netChange ?? 0) },
            ],
          }}
        />
      }
    >
      <FinanceTabsNav />

      {/* Controls (hidden in print) */}
      <Card className="mb-4 print:hidden">
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
            <label className="text-xs text-muted-foreground mb-1 block">الشهر</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm bg-background"
            >
              {["01","02","03","04","05","06","07","08","09","10","11","12"].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          <Button asChild variant="outline" size="sm"><Link href="/finance/daily-close-checklist">
              فحص اليوم
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/period-close-preflight">
              فحص الإقفال
            </Link></Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-4 print:space-y-2">
          {/* Header (for print) */}
          <div className="text-center border-b pb-2 hidden print:block">
            <h1 className="text-2xl font-bold">حزمة الإقفال الشهري — {period}</h1>
            <div className="text-xs text-muted-foreground">طُبع في {formatDateAr(today)}</div>
          </div>

          {/* KPIs Row 1 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="الإيرادات"
              value={pnl.data?.revenue?.total ?? 0}
              icon={TrendingUp}
              color="success"
            />
            <KpiCard
              label="صافي الدخل"
              value={pnl.data?.netIncome ?? 0}
              icon={(pnl.data?.netIncome ?? 0) >= 0 ? TrendingUp : TrendingDown}
              color={(pnl.data?.netIncome ?? 0) >= 0 ? "success" : "danger"}
            />
            <KpiCard
              label="النقدية"
              value={cf.data?.closingCash ?? 0}
              icon={Banknote}
              color="info"
              footnote={`صافي التغير ${cf.data?.netChange ?? 0 >= 0 ? "+" : ""}${formatCurrency(cf.data?.netChange ?? 0)}`}
            />
            <KpiCard
              label="إجمالي الأصول"
              value={bs.data?.assets?.total ?? 0}
              icon={Building2}
              color="info"
            />
          </div>

          {/* KPIs Row 2 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="ذمم مدينة"
              value={ar.data?.summary?.grandTotal ?? 0}
              icon={Users}
              color="warning"
              footnote={`متأخر +90: ${formatCurrency(ar.data?.summary?.over90 ?? 0)}`}
            />
            <KpiCard
              label="ذمم دائنة (POs)"
              value={ap.data?.totalDue ?? 0}
              icon={Clock}
              color="warning"
              footnote={`${ap.data?.data?.length ?? 0} PO جاهزة للدفع`}
            />
            <KpiCard
              label="إجمالي الالتزامات"
              value={bs.data?.liabilities?.total ?? 0}
              icon={AlertTriangle}
              color="warning"
            />
            <KpiCard
              label="حقوق الملكية"
              value={bs.data?.equity?.total ?? 0}
              icon={TrendingUp}
              color="success"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Condensed P&L */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">قائمة الدخل المختصرة</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <tbody>
                    <PlRow label="الإيرادات" value={pnl.data?.revenue?.total ?? 0} bold />
                    <PlRow label="تكلفة الإيرادات" value={-(pnl.data?.cogs?.total ?? 0)} />
                    <PlRow label="مجمل الربح" value={pnl.data?.grossProfit ?? 0} bold border />
                    <PlRow label="مصاريف التشغيل" value={-(pnl.data?.operatingExpenses?.total ?? 0)} />
                    <PlRow label="الدخل التشغيلي" value={pnl.data?.operatingIncome ?? 0} bold border />
                    <PlRow
                      label="صافي الدخل"
                      value={pnl.data?.netIncome ?? 0}
                      bold
                      border
                      large
                    />
                  </tbody>
                </table></div>
              </CardContent>
            </Card>

            {/* Condensed Balance Sheet */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">الميزانية المختصرة</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <tbody>
                    <PlRow label="أصول متداولة" value={bs.data?.assets?.current?.total ?? 0} />
                    <PlRow label="أصول غير متداولة" value={bs.data?.assets?.nonCurrent?.total ?? 0} />
                    <PlRow label="إجمالي الأصول" value={bs.data?.assets?.total ?? 0} bold border />
                    <PlRow label="خصوم متداولة" value={bs.data?.liabilities?.current?.total ?? 0} />
                    <PlRow label="خصوم غير متداولة" value={bs.data?.liabilities?.nonCurrent?.total ?? 0} />
                    <PlRow label="إجمالي الخصوم" value={bs.data?.liabilities?.total ?? 0} bold border />
                    <PlRow label="حقوق الملكية" value={bs.data?.equity?.total ?? 0} bold border large />
                  </tbody>
                </table></div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Cash flow summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">حركة النقد</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <tbody>
                    <PlRow label="الرصيد الافتتاحي" value={cf.data?.openingCash ?? 0} />
                    <PlRow label="من التشغيل" value={cf.data?.sections?.operating?.net ?? 0} />
                    <PlRow label="من الاستثمار" value={cf.data?.sections?.investing?.net ?? 0} />
                    <PlRow label="من التمويل" value={cf.data?.sections?.financing?.net ?? 0} />
                    <PlRow label="الرصيد الختامي" value={cf.data?.closingCash ?? 0} bold border large />
                  </tbody>
                </table></div>
              </CardContent>
            </Card>

            {/* Top variances */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">أعلى انحرافات الميزانية</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {topVariances.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2">لا انحرافات</div>
                ) : (
                  <div className="overflow-x-auto"><table className="w-full text-xs">
                    <tbody>
                      {topVariances.map(r => (
                        <tr key={r.accountCode} className="border-b">
                          <td className="py-1.5 truncate max-w-32" title={r.accountName}>
                            <span className="font-mono text-[10px] text-muted-foreground ml-1">{r.accountCode}</span>
                            {r.accountName}
                          </td>
                          <td className={`py-1.5 text-end tabular-nums ${r.pctOver > 0 ? "text-status-danger-foreground" : "text-status-success-foreground"}`}>
                            {r.pctOver >= 0 ? "+" : ""}{r.pctOver.toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </CardContent>
            </Card>

            {/* Top AR + AP */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">أعلى العملاء/الموردين</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">عملاء متأخرون</div>
                  {topAr.length === 0 ? (
                    <div className="text-xs text-muted-foreground">لا متأخرات</div>
                  ) : (
                    topAr.map(c => (
                      <div key={c.clientId} className="flex justify-between text-xs py-0.5 border-b last:border-b-0">
                        <span className="truncate max-w-32">{c.clientName}</span>
                        <span className="tabular-nums text-status-warning-foreground font-semibold">
                          {formatCurrency(c.total - c.current)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">مدفوعات للموردين</div>
                  {topAp.length === 0 ? (
                    <div className="text-xs text-muted-foreground">لا مدفوعات معلقة</div>
                  ) : (
                    topAp.map((v, i) => (
                      <div key={i} className="flex justify-between text-xs py-0.5 border-b last:border-b-0">
                        <span className="truncate max-w-32">{v.supplierName}</span>
                        <span className="tabular-nums font-semibold">{formatCurrency(v.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Drill-down links (hidden in print) */}
          <Card className="print:hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">صفحات أعمق</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <DrillLink href="/finance/reports/is-vs-budget" label="الدخل مقابل الميزانية" />
                <DrillLink href="/finance/reports/cash-flow-statement" label="قائمة التدفقات" />
                <DrillLink href="/finance/budget-heatmap" label="خريطة الميزانية" />
                <DrillLink href="/finance/ar-collection-workbench" label="منضدة التحصيل" />
                <DrillLink href="/finance/ap-payment-calendar" label="تقويم الدفعات" />
                <DrillLink href="/finance/trial-balance-drilldown" label="ميزان مع تتبّع" />
                <DrillLink href="/finance/cfo-cockpit" label="لوحة المدير المالي" />
                <DrillLink href="/finance/period-close-preflight" label="فحص قبل الإقفال" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}

function KpiCard({
  label, value, icon: Icon, color, footnote,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: "success" | "danger" | "warning" | "info";
  footnote?: string;
}) {
  const colorClass = {
    success: "text-status-success-foreground",
    danger: "text-status-danger-foreground",
    warning: "text-status-warning-foreground",
    info: "text-status-info-foreground",
  }[color];
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
          <Icon className={`w-3 h-3 ${colorClass}`} />
          {label}
        </div>
        <div className={`text-lg font-bold tabular-nums ${colorClass}`}>{formatCurrency(value)}</div>
        {footnote && <div className="text-[10px] text-muted-foreground mt-1">{footnote}</div>}
      </CardContent>
    </Card>
  );
}

function PlRow({
  label, value, bold, border, large,
}: {
  label: string;
  value: number;
  bold?: boolean;
  border?: boolean;
  large?: boolean;
}) {
  return (
    <tr className={border ? "border-t-2 font-semibold" : ""}>
      <td className={`py-1.5 ${bold ? "font-semibold" : ""}`}>{label}</td>
      <td className={`py-1.5 text-end tabular-nums ${bold ? "font-bold" : ""} ${large ? "text-lg" : ""} ${value < 0 ? "text-status-danger-foreground" : ""}`}>
        {formatCurrency(value)}
      </td>
    </tr>
  );
}

function DrillLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href}>
      <div className="border rounded px-3 py-2 text-sm hover:bg-muted/30 cursor-pointer flex items-center justify-between">
        <span>{label}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </Link>
  );
}
