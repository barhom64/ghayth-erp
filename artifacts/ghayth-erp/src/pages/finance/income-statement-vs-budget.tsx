import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  BarChart3, Download, TrendingUp, TrendingDown, CheckCircle2,
  AlertTriangle, Target, ChevronDown, ChevronRight, Grid3x3,
} from "lucide-react";
import {
  formatCurrency, currentYearRiyadh, currentMonthPaddedRiyadh,
} from "@/lib/formatters";

/**
 * Income Statement vs Budget — variance analysis
 *
 * Side-by-side P&L: actual revenue/expense vs. budget for the same period,
 * with absolute variance and % over/under. Lines collapse into revenue/COGS/
 * opex/other groups. Color-codes favorable (revenue up / expense down) vs
 * unfavorable variances.
 *
 * Endpoints:
 *   GET /finance/reports/income-statement?startDate&endDate
 *   GET /finance/reports/budget-variance?period=YYYY-MM (or aggregated for range)
 */

interface IncomeStmtLine {
  accountCode: string;
  accountName: string;
  amount: number | string;
}

interface IncomeStmtResp {
  revenue: { items: IncomeStmtLine[]; total: number };
  cogs: { items: IncomeStmtLine[]; total: number };
  grossProfit: number;
  operatingExpenses: { items: IncomeStmtLine[]; total: number };
  operatingIncome: number;
  otherIncome?: { items: IncomeStmtLine[]; total: number };
  otherExpenses?: { items: IncomeStmtLine[]; total: number };
  netIncome: number;
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

interface BudgetVarResp {
  data: BudgetVarRow[];
  summary: { totalBudget: number; totalActual: number; totalVariance: number };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export default function IncomeStatementVsBudgetPage() {
  const [year, setYear] = useState(currentYearRiyadh());
  const [month, setMonth] = useState(currentMonthPaddedRiyadh());
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    revenue: true, cogs: true, opex: true, other: false,
  });

  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${String(daysInMonth(year, Number(month))).padStart(2, "0")}`;
  const period = `${year}-${month}`;

  const { data: pnl, isLoading: pnlLoading } = useApiQuery<IncomeStmtResp>(
    ["pnl-vs-budget", String(year), month],
    `/finance/reports/income-statement?startDate=${startDate}&endDate=${endDate}`,
  );

  const { data: budget, isLoading: budgetLoading } = useApiQuery<BudgetVarResp>(
    ["budget-vs-actual", String(year), month],
    `/finance/reports/budget-variance?period=${period}`,
  );

  // Build budget map: accountCode → budget amount
  const budgetMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of budget?.data ?? []) {
      m.set(r.accountCode, Number(r.budget));
    }
    return m;
  }, [budget]);

  const sections = useMemo(() => {
    if (!pnl) return [];
    return [
      { key: "revenue", label: "الإيرادات", items: pnl.revenue?.items ?? [], actualTotal: pnl.revenue?.total ?? 0, kind: "revenue" as const },
      { key: "cogs", label: "تكلفة الإيرادات", items: pnl.cogs?.items ?? [], actualTotal: pnl.cogs?.total ?? 0, kind: "expense" as const },
      { key: "opex", label: "مصاريف التشغيل", items: pnl.operatingExpenses?.items ?? [], actualTotal: pnl.operatingExpenses?.total ?? 0, kind: "expense" as const },
      ...(pnl.otherIncome ? [{ key: "other-inc", label: "إيرادات أخرى", items: pnl.otherIncome.items, actualTotal: pnl.otherIncome.total, kind: "revenue" as const }] : []),
      ...(pnl.otherExpenses ? [{ key: "other-exp", label: "مصاريف أخرى", items: pnl.otherExpenses.items, actualTotal: pnl.otherExpenses.total, kind: "expense" as const }] : []),
    ];
  }, [pnl]);

  const toggleSection = (key: string) => {
    setOpenSections(s => ({ ...s, [key]: !s[key] }));
  };

  // Compute total budget per kind
  const sectionBudgets = useMemo(() => {
    const out = new Map<string, number>();
    for (const sec of sections) {
      let total = 0;
      for (const it of sec.items) {
        total += budgetMap.get(it.accountCode) ?? 0;
      }
      out.set(sec.key, total);
    }
    return out;
  }, [sections, budgetMap]);

  const totalRevenueBudget = (sectionBudgets.get("revenue") ?? 0) + (sectionBudgets.get("other-inc") ?? 0);
  const totalExpenseBudget = (sectionBudgets.get("cogs") ?? 0) + (sectionBudgets.get("opex") ?? 0) + (sectionBudgets.get("other-exp") ?? 0);
  const netIncomeBudget = totalRevenueBudget - totalExpenseBudget;

  const totalRevenueActual = pnl ? (pnl.revenue?.total ?? 0) + (pnl.otherIncome?.total ?? 0) : 0;
  const totalExpenseActual = pnl ? (pnl.cogs?.total ?? 0) + (pnl.operatingExpenses?.total ?? 0) + (pnl.otherExpenses?.total ?? 0) : 0;

  const exportCSV = () => {
    if (!pnl) return;
    const lines: string[] = [];
    lines.push(`قائمة الدخل مقابل الميزانية — ${period}`);
    lines.push("");
    lines.push("القسم,الحساب,الاسم,الفعلي,الميزانية,الفرق,الانحراف %");
    for (const sec of sections) {
      for (const it of sec.items) {
        const actual = Number(it.amount);
        const bud = budgetMap.get(it.accountCode) ?? 0;
        const variance = sec.kind === "revenue" ? actual - bud : bud - actual;
        const pct = bud > 0 ? (variance / bud) * 100 : 0;
        lines.push([
          sec.label,
          it.accountCode,
          (it.accountName ?? "").replace(/,/g, "،"),
          actual.toFixed(2),
          bud.toFixed(2),
          variance.toFixed(2),
          `${pct.toFixed(1)}%`,
        ].join(","));
      }
    }
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
        entityType: "report_income_statement_vs_budget",
        title: String(`pnl-vs-budget-${period}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="قائمة الدخل مقابل الميزانية"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "قائمة الدخل مقابل الميزانية" },
      ]}
      subtitle={`تحليل الانحراف لـ ${period} — هل أنت قبل الميزانية أم بعدها؟`}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/reports/is-trend">
              <TrendingUp className="h-3.5 w-3.5 ml-1" />
              اتجاه الدخل
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/budget-heatmap">
              <Grid3x3 className="h-3.5 w-3.5 ml-1" />
              خريطة الميزانية
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/budget-variance">
              <Target className="h-3.5 w-3.5 ml-1" />
              انحرافات الميزانية
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
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!pnl}>
            <Download className="w-4 h-4 ml-1" />
            CSV
          </Button>
          <PrintButton
            entityType="report_income_vs_budget"
            entityId={period}
            payload={{
              entity: {
                title: "قائمة الدخل مقابل الموازنة",
                period,
                totalRevenueBudget,
                totalExpenseBudget,
                netIncomeBudget,
              },
              items: [
                ...(pnl?.revenue?.items ?? []).map((l) => ({
                  "القسم": "إيرادات", "الكود": l.accountCode, "اسم الحساب": l.accountName, "فعلي": Number(l.amount ?? 0),
                })),
                ...(pnl?.cogs?.items ?? []).map((l) => ({
                  "القسم": "تكلفة البضاعة", "الكود": l.accountCode, "اسم الحساب": l.accountName, "فعلي": Number(l.amount ?? 0),
                })),
                ...(pnl?.operatingExpenses?.items ?? []).map((l) => ({
                  "القسم": "مصاريف تشغيلية", "الكود": l.accountCode, "اسم الحساب": l.accountName, "فعلي": Number(l.amount ?? 0),
                })),
              ],
            }}
          />
        </CardContent>
      </Card>

      {pnlLoading || budgetLoading ? (
        <LoadingSpinner />
      ) : !pnl ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد بيانات</CardContent></Card>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <SummaryTile
              label="الإيرادات"
              actual={totalRevenueActual}
              budget={totalRevenueBudget}
              kind="revenue"
            />
            <SummaryTile
              label="المصاريف"
              actual={totalExpenseActual}
              budget={totalExpenseBudget}
              kind="expense"
            />
            <SummaryTile
              label="مجمل الربح"
              actual={pnl.grossProfit ?? 0}
              budget={(sectionBudgets.get("revenue") ?? 0) - (sectionBudgets.get("cogs") ?? 0)}
              kind="profit"
            />
            <SummaryTile
              label="صافي الدخل"
              actual={pnl.netIncome ?? 0}
              budget={netIncomeBudget}
              kind="profit"
            />
          </div>

          {/* Sections */}
          {sections.map(sec => {
            const isOpen = !!openSections[sec.key];
            const secBudget = sectionBudgets.get(sec.key) ?? 0;
            const variance = sec.kind === "revenue" ? sec.actualTotal - secBudget : secBudget - sec.actualTotal;
            const favorable = variance >= 0;
            const pct = secBudget > 0 ? (variance / secBudget) * 100 : 0;
            return (
              <Card key={sec.key} className="mb-3">
                <CardHeader
                  className="pb-3 cursor-pointer hover:bg-muted/30"
                  onClick={() => toggleSection(sec.key)}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      {sec.label}
                      <Badge variant="outline">{sec.items.length}</Badge>
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">
                        ميزانية: <strong className="text-foreground tabular-nums">{formatCurrency(secBudget)}</strong>
                      </span>
                      <span className="text-muted-foreground">
                        فعلي: <strong className="text-foreground tabular-nums">{formatCurrency(sec.actualTotal)}</strong>
                      </span>
                      <span className={`font-bold tabular-nums flex items-center gap-1 ${favorable ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                        {favorable ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        {variance >= 0 ? "+" : ""}{formatCurrency(variance)}
                        {secBudget > 0 && (
                          <span className="text-xs">({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)</span>
                        )}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                {isOpen && (
                  <CardContent className="pt-0">
                    <div className="overflow-x-auto">
                      <DataTable
                        data={sec.items}
                        rowKey={(it) => it.accountCode}
                        noToolbar
                        pageSize={0}
                        className="text-sm"
                        columns={[
                          {
                            key: "accountCode", header: "الرمز", width: "6rem", sortable: false, ltr: true,
                            render: (it) => <span className="font-mono text-xs">{it.accountCode}</span>,
                          },
                          { key: "accountName", header: "الاسم", sortable: false },
                          {
                            key: "budget", header: "الميزانية", align: "end", width: "7rem", sortable: false,
                            render: (it) => {
                              const bud = budgetMap.get(it.accountCode) ?? 0;
                              return (
                                <span className="tabular-nums text-muted-foreground">
                                  {bud > 0 ? formatCurrency(bud) : "—"}
                                </span>
                              );
                            },
                          },
                          {
                            key: "actual", header: "الفعلي", align: "end", width: "7rem", sortable: false,
                            render: (it) => <span className="tabular-nums font-semibold">{formatCurrency(Number(it.amount))}</span>,
                          },
                          {
                            key: "variance", header: "الانحراف", align: "end", width: "7rem", sortable: false,
                            render: (it) => {
                              const actual = Number(it.amount);
                              const bud = budgetMap.get(it.accountCode) ?? 0;
                              const v = sec.kind === "revenue" ? actual - bud : bud - actual;
                              const itemFavorable = v >= 0;
                              return (
                                <span className={`tabular-nums font-semibold ${itemFavorable ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                                  {v >= 0 ? "+" : ""}{formatCurrency(v)}
                                </span>
                              );
                            },
                          },
                          {
                            key: "pct", header: "%", align: "end", width: "5rem", sortable: false,
                            render: (it) => {
                              const actual = Number(it.amount);
                              const bud = budgetMap.get(it.accountCode) ?? 0;
                              const v = sec.kind === "revenue" ? actual - bud : bud - actual;
                              const itemFavorable = v >= 0;
                              const itemPct = bud > 0 ? (v / bud) * 100 : 0;
                              return (
                                <span className={`tabular-nums ${itemFavorable ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                                  {bud > 0 ? `${itemPct >= 0 ? "+" : ""}${itemPct.toFixed(1)}%` : "—"}
                                </span>
                              );
                            },
                          },
                          {
                            key: "indicator", header: "المؤشر", width: "8rem", sortable: false,
                            render: (it) => {
                              const actual = Number(it.amount);
                              const pctOfTotal = sec.actualTotal > 0 ? (actual / sec.actualTotal) * 100 : 0;
                              return (
                                <div className="h-1.5 bg-muted rounded overflow-hidden">
                                  <div
                                    className={sec.kind === "revenue" ? "bg-status-success-foreground" : "bg-status-warning-foreground"}
                                    style={{ width: `${Math.min(pctOfTotal, 100)}%`, height: "100%" }}
                                  />
                                </div>
                              );
                            },
                          },
                        ] satisfies DataTableColumn<IncomeStmtLine>[]}
                      />
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Final net income card */}
          <Card className={pnl.netIncome >= netIncomeBudget ? "border-status-success-foreground border-2" : "border-status-warning-foreground border-2"}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">صافي الدخل</div>
                  <div className="text-2xl font-bold tabular-nums">{formatCurrency(pnl.netIncome ?? 0)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    الميزانية: {formatCurrency(netIncomeBudget)}
                  </div>
                </div>
                <div className="text-end">
                  <div className={`text-3xl font-bold tabular-nums flex items-center gap-2 ${(pnl.netIncome - netIncomeBudget) >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                    {(pnl.netIncome - netIncomeBudget) >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                    {(pnl.netIncome - netIncomeBudget) >= 0 ? "+" : ""}{formatCurrency(pnl.netIncome - netIncomeBudget)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {netIncomeBudget !== 0 && `${((pnl.netIncome - netIncomeBudget) / Math.abs(netIncomeBudget) * 100).toFixed(1)}% من الميزانية`}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}

function SummaryTile({
  label, actual, budget, kind,
}: {
  label: string;
  actual: number;
  budget: number;
  kind: "revenue" | "expense" | "profit";
}) {
  const variance = kind === "expense" ? budget - actual : actual - budget;
  const favorable = variance >= 0;
  const pct = budget !== 0 ? (variance / Math.abs(budget)) * 100 : 0;
  return (
    <Card className={budget > 0 ? (favorable ? "border-status-success-foreground" : "border-status-warning-foreground") : ""}>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
          <Target className="w-3 h-3" />
          {label}
        </div>
        <div className="text-xl font-bold tabular-nums">{formatCurrency(actual)}</div>
        <div className="text-[11px] text-muted-foreground">
          مقابل {formatCurrency(budget)}
        </div>
        {budget !== 0 && (
          <div className={`text-xs font-semibold mt-1 ${favorable ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
            {variance >= 0 ? "+" : ""}{formatCurrency(variance)} ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
          </div>
        )}
      </CardContent>
    </Card>
  );
}
