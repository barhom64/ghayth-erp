import { useState, useMemo } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileBarChart, TrendingUp, TrendingDown, Scale, DollarSign,
  ArrowDownCircle, ArrowUpCircle, BookOpen, AlertTriangle, Download,
  Users, BarChart2, PieChart, FileText, Printer, ChevronDown, ChevronRight
} from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { MultiExportButton } from "@/components/shared/export-buttons";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { ErrorState } from "@/components/shared/loading-error-states";

function exportCSV(rows: any[], headers: string[], filename: string) {
  if (!rows.length) return;
  const csv = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))].map((r) => r.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

function PrintButton() {
  return (
    <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="h-3.5 w-3.5 me-1" />طباعة
    </GuardedButton>
  );
}

export default function FinancialReportsPage() {
  const [activeTab, setActiveTab] = useState("trial-balance");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const dateParams = [
    startDate ? `startDate=${startDate}` : "",
    endDate ? `endDate=${endDate}` : "",
  ].filter(Boolean).join("&");

  return (
    <PageShell
      title="التقارير المالية المتقدمة"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "التقارير المالية المتقدمة" }]}
      actions={
        <>
          <DatePicker value={startDate} onChange={setStartDate} className="w-40" placeholder="من" />
          <DatePicker value={endDate} onChange={setEndDate} className="w-40" placeholder="إلى" />
        </>
      }
    >
      <FinanceTabsNav />
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="trial-balance" className="text-xs"><Scale className="h-3.5 w-3.5 me-1" />ميزان المراجعة</TabsTrigger>
          <TabsTrigger value="income-statement" className="text-xs"><TrendingUp className="h-3.5 w-3.5 me-1" />قائمة الدخل</TabsTrigger>
          <TabsTrigger value="balance-sheet" className="text-xs"><FileBarChart className="h-3.5 w-3.5 me-1" />الميزانية العمومية</TabsTrigger>
          <TabsTrigger value="cash-flow" className="text-xs"><DollarSign className="h-3.5 w-3.5 me-1" />التدفقات النقدية</TabsTrigger>
          <TabsTrigger value="cash-bank" className="text-xs"><BookOpen className="h-3.5 w-3.5 me-1" />كشف الصندوق/البنك</TabsTrigger>
          <TabsTrigger value="custody-advances" className="text-xs"><Users className="h-3.5 w-3.5 me-1" />العهد والسلف</TabsTrigger>
          <TabsTrigger value="expenses-analysis" className="text-xs"><BarChart2 className="h-3.5 w-3.5 me-1" />تحليل المصروفات</TabsTrigger>
          <TabsTrigger value="revenue-analysis" className="text-xs"><PieChart className="h-3.5 w-3.5 me-1" />تحليل الإيرادات</TabsTrigger>
          <TabsTrigger value="budget-variance" className="text-xs"><AlertTriangle className="h-3.5 w-3.5 me-1" />انحراف الميزانية</TabsTrigger>
          <TabsTrigger value="entity-statement" className="text-xs"><FileText className="h-3.5 w-3.5 me-1" />كشف حساب الجهة</TabsTrigger>
        </TabsList>

        <TabsContent value="trial-balance"><TrialBalance dateParams={dateParams} startDate={startDate} endDate={endDate} /></TabsContent>
        <TabsContent value="income-statement"><IncomeStatement dateParams={dateParams} startDate={startDate} endDate={endDate} /></TabsContent>
        <TabsContent value="balance-sheet"><BalanceSheet dateParams={dateParams.replace("startDate", "asOfDate")} /></TabsContent>
        <TabsContent value="cash-flow"><CashFlow dateParams={dateParams} /></TabsContent>
        <TabsContent value="cash-bank"><CashBankStatement dateParams={dateParams} /></TabsContent>
        <TabsContent value="custody-advances"><CustodyAdvances dateParams={dateParams} /></TabsContent>
        <TabsContent value="expenses-analysis"><ExpensesAnalysis dateParams={dateParams} /></TabsContent>
        <TabsContent value="revenue-analysis"><RevenueAnalysis dateParams={dateParams} /></TabsContent>
        <TabsContent value="budget-variance"><BudgetVariance /></TabsContent>
        <TabsContent value="entity-statement"><EntityStatement startDate={startDate} endDate={endDate} /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

const typeMap: Record<string, string> = { asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات" };

function TrialBalanceNode({ node, level = 0 }: { node: any; level?: number }) {
  const [expanded, setExpanded] = useState(level < 1);
  const hasChildren = node.children && node.children.length > 0;
  const hasData = Number(node.totalDebit) !== 0 || Number(node.totalCredit) !== 0;
  const isParent = hasChildren;

  if (!hasData && !hasChildren) return null;

  return (
    <>
      <tr className={`border-b hover:bg-surface-subtle ${isParent ? "bg-surface-subtle/50 font-semibold" : ""}`}>
        <td className="p-3" style={{ paddingInlineStart: `${12 + level * 20}px` }}>
          <div className="flex items-center gap-1">
            {hasChildren ? (
              <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-muted-foreground">
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : <span className="w-3.5" />}
            <span className="font-mono text-status-info-foreground text-xs">{node.code}</span>
          </div>
        </td>
        <td className="p-3">
          <span className={isParent ? "font-semibold" : ""}>{node.name}</span>
        </td>
        <td className="p-3"><Badge variant="outline" className="text-xs">{typeMap[node.type] || node.type}</Badge></td>
        <td className="p-3 text-status-success-foreground">{formatCurrency(Number(node.totalDebit || 0))}</td>
        <td className="p-3 text-status-error-foreground">{formatCurrency(Number(node.totalCredit || 0))}</td>
        <td className="p-3 font-bold" style={{ color: Number(node.balance) >= 0 ? "#16a34a" : "#dc2626" }}>
          {formatCurrency(Number(node.balance || 0))}
        </td>
      </tr>
      {expanded && hasChildren && node.children.map((child: any) => (
        <TrialBalanceNode key={child.code} node={child} level={level + 1} />
      ))}
      {expanded && hasChildren && (
        <tr className="border-b bg-surface-subtle/60">
          <td colSpan={3} className="p-2 text-xs text-muted-foreground font-bold" style={{ paddingInlineStart: `${12 + level * 20}px` }}>
            مجموع {node.name}
          </td>
          <td className="p-2 text-status-success-foreground text-xs font-bold">{formatCurrency(Number(node.subtotalDebit || node.totalDebit || 0))}</td>
          <td className="p-2 text-status-error-foreground text-xs font-bold">{formatCurrency(Number(node.subtotalCredit || node.totalCredit || 0))}</td>
          <td className="p-2 text-xs font-bold" style={{ color: Number(node.subtotalBalance || node.balance) >= 0 ? "#16a34a" : "#dc2626" }}>
            {formatCurrency(Number(node.subtotalBalance || node.balance || 0))}
          </td>
        </tr>
      )}
    </>
  );
}

function TrialBalance({ dateParams, startDate, endDate }: { dateParams: string; startDate?: string; endDate?: string }) {
  const { data, isLoading, isError } = useApiQuery<any>(["trial-balance", dateParams], `/finance/reports/trial-balance${dateParams ? `?${dateParams}` : ""}`);
  const rows = data?.data || [];
  const summary = data?.summary || {};
  const byType = data?.byType || {};
  const [viewMode, setViewMode] = useState<"tree" | "flat">("tree");

  if (isError) return <ErrorState />;

  const tree = useMemo(() => {
    if (!rows.length) return [];
    const map = new Map<number, any>();
    rows.forEach((r: any) => map.set(r.id, { ...r, children: [] }));
    const roots: any[] = [];
    rows.forEach((r: any) => {
      const node = map.get(r.id);
      if (r.parentId && map.has(r.parentId)) {
        map.get(r.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    });
    function calcSubtotals(node: any): { d: number; c: number; b: number } {
      let d = Number(node.totalDebit || 0), c = Number(node.totalCredit || 0), b = Number(node.balance || 0);
      for (const child of node.children) {
        const sub = calcSubtotals(child);
        d += sub.d; c += sub.c; b += sub.b;
      }
      node.subtotalDebit = d;
      node.subtotalCredit = c;
      node.subtotalBalance = b;
      return { d, c, b };
    }
    roots.forEach(calcSubtotals);
    return roots;
  }, [rows]);

  const flatColumns: DataTableColumn<any>[] = [
    { key: "code", header: "الرمز", sortable: true, searchable: true, render: (r) => <span className="font-mono text-status-info-foreground">{r.code}</span> },
    { key: "name", header: "الحساب", sortable: true, searchable: true, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "type", header: "النوع", sortable: true, render: (r) => <Badge variant="outline">{typeMap[r.type] || r.type}</Badge> },
    { key: "totalDebit", header: "مدين", sortable: true, render: (r) => <span className="text-status-success-foreground">{formatCurrency(Number(r.totalDebit || 0))}</span> },
    { key: "totalCredit", header: "دائن", sortable: true, render: (r) => <span className="text-status-error-foreground">{formatCurrency(Number(r.totalCredit || 0))}</span> },
    {
      key: "balance", header: "الرصيد", sortable: true,
      render: (r) => (
        <span className="font-bold" style={{ color: Number(r.balance) >= 0 ? "#16a34a" : "#dc2626" }}>
          {formatCurrency(Number(r.balance || 0))}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button variant={viewMode === "tree" ? "default" : "outline"} size="sm" onClick={() => setViewMode("tree")}>عرض شجري</Button>
          <Button variant={viewMode === "flat" ? "default" : "outline"} size="sm" onClick={() => setViewMode("flat")}>عرض مسطح</Button>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => exportCSV(rows, ["code", "name", "type", "totalDebit", "totalCredit", "balance"], "trial-balance.csv")}>
            <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
          </GuardedButton>
          <MultiExportButton
            exports={[
              { endpoint: "/export/excel/trial-balance", filename: "trial-balance.xlsx", type: "excel", label: "تصدير إكسل", params: { startDate, endDate } },
              { endpoint: "/export/pdf/trial-balance", filename: "trial-balance.pdf", type: "pdf", label: "تصدير ملف طباعي", params: { startDate, endDate } },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">إجمالي المدين</p>
          <p className="text-2xl font-bold text-status-success-foreground">{formatCurrency(Number(summary.totalDebit || 0))}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">إجمالي الدائن</p>
          <p className="text-2xl font-bold text-status-error-foreground">{formatCurrency(Number(summary.totalCredit || 0))}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">التوازن</p>
          <Badge className={summary.isBalanced ? "bg-status-success-surface text-status-success-foreground text-lg px-4 py-1" : "bg-status-error-surface text-status-error-foreground text-lg px-4 py-1"}>
            {summary.isBalanced ? "متوازن ✓" : "غير متوازن ✗"}
          </Badge>
        </CardContent></Card>
      </div>

      {Object.keys(byType).length > 0 && (
        <div className="grid gap-2 grid-cols-5">
          {Object.entries(byType).map(([type, vals]: any) => (
            <Card key={type} className="border-dashed">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">{typeMap[type] || type}</p>
                <p className="text-sm font-bold" style={{ color: Number(vals.balance) >= 0 ? "#16a34a" : "#dc2626" }}>
                  {formatCurrency(Number(vals.balance || 0))}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="print-area">
        {viewMode === "tree" ? (
          <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="p-3 text-start">الرمز</th>
                  <th className="p-3 text-start">الحساب</th>
                  <th className="p-3 text-start">النوع</th>
                  <th className="p-3 text-start">مدين</th>
                  <th className="p-3 text-start">دائن</th>
                  <th className="p-3 text-start">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? [...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b"><td colSpan={6} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
                )) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>
                ) : (
                  tree.map((node: any) => <TrialBalanceNode key={node.code} node={node} level={0} />)
                )}
                {rows.length > 0 && (
                  <tr className="bg-surface-subtle font-bold">
                    <td colSpan={3} className="p-3">المجموع الكلي</td>
                    <td className="p-3 text-status-success-foreground">{formatCurrency(Number(summary.totalDebit || 0))}</td>
                    <td className="p-3 text-status-error-foreground">{formatCurrency(Number(summary.totalCredit || 0))}</td>
                    <td className="p-3">{formatCurrency(Number(summary.totalDebit || 0) - Number(summary.totalCredit || 0))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div></div>
        ) : (
          <>
            <DataTable
              columns={flatColumns}
              data={rows}
              isLoading={isLoading}
              rowKey={(r) => r.code}
              noToolbar
              pageSize={0}
              emptyMessage="لا توجد بيانات"
            />
            {rows.length > 0 && (
              <div className="mt-2 grid grid-cols-6 gap-0 bg-surface-subtle font-bold rounded-lg overflow-hidden border">
                <div className="col-span-3 p-3">المجموع الكلي</div>
                <div className="p-3 text-status-success-foreground">{formatCurrency(Number(summary.totalDebit || 0))}</div>
                <div className="p-3 text-status-error-foreground">{formatCurrency(Number(summary.totalCredit || 0))}</div>
                <div className="p-3">{formatCurrency(Number(summary.totalDebit || 0) - Number(summary.totalCredit || 0))}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function IncomeStatement({ dateParams, startDate, endDate }: { dateParams: string; startDate?: string; endDate?: string }) {
  const { data, isLoading, isError } = useApiQuery<any>(["income-statement", dateParams], `/finance/reports/income-statement${dateParams ? `?${dateParams}` : ""}`);
  const revenues = data?.revenues || [];
  const expenses = data?.expenses || [];
  const summary = data?.summary || {};

  if (isLoading) return <div className="mt-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (isError) return <ErrorState />;

  const totalRevenue = Number(summary.totalRevenue || 0);
  const totalExpenses = Number(summary.totalExpenses || 0);
  const netIncome = Number(summary.netIncome || 0);
  const marginPct = totalRevenue > 0 ? ((netIncome / totalRevenue) * 100).toFixed(1) : "0.0";

  const revenueColumns: DataTableColumn<any>[] = [
    { key: "code", header: "الرمز", width: "4rem", render: (r) => <span className="font-mono text-sm text-muted-foreground">{r.code}</span> },
    { key: "name", header: "البيان", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "amount", header: "المبلغ", render: (r) => <span className="text-status-success-foreground font-bold">{formatCurrency(Number(r.amount || 0))}</span> },
    {
      key: "pct", header: "النسبة", width: "5rem",
      render: (r) => {
        const pct = totalRevenue > 0 ? ((Number(r.amount) / totalRevenue) * 100).toFixed(1) : "0.0";
        return (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <div className="flex-1 bg-surface-subtle rounded-full h-1.5">
              <div className="bg-green-400 h-1.5 rounded-full" style={{ width: `${Math.min(100, Number(pct))}%` }} />
            </div>
            <span>{pct}%</span>
          </div>
        );
      },
    },
  ];

  const expenseColumns: DataTableColumn<any>[] = [
    { key: "code", header: "الرمز", width: "4rem", render: (e) => <span className="font-mono text-sm text-muted-foreground">{e.code}</span> },
    { key: "name", header: "البيان", render: (e) => <span className="font-medium">{e.name}</span> },
    { key: "amount", header: "المبلغ", render: (e) => <span className="text-status-error-foreground font-bold">{formatCurrency(Number(e.amount || 0))}</span> },
    {
      key: "pct", header: "النسبة", width: "5rem",
      render: (e) => {
        const pct = totalExpenses > 0 ? ((Number(e.amount) / totalExpenses) * 100).toFixed(1) : "0.0";
        return (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <div className="flex-1 bg-surface-subtle rounded-full h-1.5">
              <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${Math.min(100, Number(pct))}%` }} />
            </div>
            <span>{pct}%</span>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end gap-2">
        <PrintButton />
        <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => exportCSV([...revenues.map((r: any) => ({ ...r, section: "إيرادات" })), ...expenses.map((e: any) => ({ ...e, section: "مصروفات" }))], ["section", "code", "name", "amount"], "income-statement.csv")}>
          <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
        </GuardedButton>
        <MultiExportButton
          exports={[
            { endpoint: "/export/excel/income-statement", filename: "income-statement.xlsx", type: "excel", label: "تصدير إكسل", params: { startDate, endDate } },
          ]}
        />
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="bg-status-success-surface"><CardContent className="p-4 text-center">
          <TrendingUp className="h-6 w-6 text-status-success-foreground mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">الإيرادات</p>
          <p className="text-2xl font-bold text-status-success-foreground">{formatCurrency(totalRevenue)}</p>
        </CardContent></Card>
        <Card className="bg-status-error-surface"><CardContent className="p-4 text-center">
          <TrendingDown className="h-6 w-6 text-status-error-foreground mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">المصروفات</p>
          <p className="text-2xl font-bold text-status-error-foreground">{formatCurrency(totalExpenses)}</p>
        </CardContent></Card>
        <Card className={netIncome >= 0 ? "bg-emerald-50" : "bg-rose-50"}><CardContent className="p-4 text-center">
          <DollarSign className="h-6 w-6 mx-auto mb-1" style={{ color: netIncome >= 0 ? "#059669" : "#dc2626" }} />
          <p className="text-xs text-muted-foreground">صافي الدخل</p>
          <p className="text-2xl font-bold" style={{ color: netIncome >= 0 ? "#059669" : "#dc2626" }}>
            {formatCurrency(netIncome)}
          </p>
        </CardContent></Card>
        <Card className="bg-status-info-surface"><CardContent className="p-4 text-center">
          <Scale className="h-6 w-6 text-status-info-foreground mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">هامش الربح</p>
          <p className="text-2xl font-bold text-status-info-foreground">{marginPct}%</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-status-success-foreground flex items-center justify-between">
          <span>الإيرادات</span>
          <span className="text-lg">{formatCurrency(totalRevenue)}</span>
        </CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={revenueColumns}
            data={revenues}
            rowKey={(r) => r.code}
            noToolbar
            pageSize={0}
            emptyMessage="لا توجد إيرادات"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-status-error-foreground flex items-center justify-between">
          <span>المصروفات</span>
          <span className="text-lg">{formatCurrency(totalExpenses)}</span>
        </CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={expenseColumns}
            data={expenses}
            rowKey={(e) => e.code}
            noToolbar
            pageSize={0}
            emptyMessage="لا توجد مصروفات"
          />
        </CardContent>
      </Card>

      <Card className={netIncome >= 0 ? "border-status-success-surface bg-status-success-surface" : "border-status-error-surface bg-status-error-surface"}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" style={{ color: netIncome >= 0 ? "#059669" : "#dc2626" }} />
              <span className="font-bold text-lg">صافي الدخل (الربح/الخسارة)</span>
            </div>
            <span className="text-2xl font-bold" style={{ color: netIncome >= 0 ? "#059669" : "#dc2626" }}>
              {formatCurrency(netIncome)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BalanceSheet({ dateParams }: { dateParams: string }) {
  const { data, isLoading, isError } = useApiQuery<any>(["balance-sheet", dateParams], `/finance/reports/balance-sheet${dateParams ? `?${dateParams}` : ""}`);
  const summary = data?.summary || {};
  const assets = data?.assets || [];
  const liabilities = data?.liabilities || [];
  const equity = data?.equity || [];

  if (isLoading) return <div className="mt-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (isError) return <ErrorState />;

  const totalAssets = Number(summary.totalAssets || 0);
  const totalLiabilities = Number(summary.totalLiabilities || 0);
  const totalEquity = Number(summary.totalEquity || 0);

  const Section = ({ title, items, color, total }: { title: string; items: any[]; color: string; total: number }) => {
    const sectionColumns: DataTableColumn<any>[] = [
      { key: "code", header: "الرمز", width: "4rem", render: (r) => <span className="font-mono text-sm text-muted-foreground">{r.code}</span> },
      { key: "name", header: "البيان", render: (r) => <span className="font-medium">{r.name}</span> },
      { key: "balance", header: "الرصيد", render: (r) => <span className="font-bold" style={{ color }}>{formatCurrency(Number(r.balance || 0))}</span> },
      {
        key: "pct", header: "النسبة", width: "4rem",
        render: (r) => {
          const pct = total > 0 ? ((Number(r.balance) / total) * 100).toFixed(1) : "0.0";
          return <span className="text-xs text-muted-foreground">{pct}%</span>;
        },
      },
    ];
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between" style={{ color }}>
            <span>{title}</span>
            <span className="text-lg">{formatCurrency(total)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={sectionColumns}
            data={items}
            rowKey={(r) => r.code}
            noToolbar
            pageSize={0}
            emptyMessage="لا توجد بيانات"
          />
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end gap-2">
        <PrintButton />
        <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => exportCSV([...assets, ...liabilities, ...equity], ["code", "name", "type", "balance"], "balance-sheet.csv")}>
          <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
        </GuardedButton>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card className="bg-status-info-surface"><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">الأصول</p>
          <p className="text-2xl font-bold text-status-info-foreground">{formatCurrency(totalAssets)}</p>
        </CardContent></Card>
        <Card className="bg-status-error-surface"><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">الخصوم</p>
          <p className="text-2xl font-bold text-status-error-foreground">{formatCurrency(totalLiabilities)}</p>
        </CardContent></Card>
        <Card className="bg-purple-50"><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">حقوق الملكية</p>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(totalEquity)}</p>
        </CardContent></Card>
      </div>

      <Section title="الأصول" items={assets} color="#2563eb" total={totalAssets} />
      <Section title="الخصوم" items={liabilities} color="#dc2626" total={totalLiabilities} />
      <Section title="حقوق الملكية" items={equity} color="#7c3aed" total={totalEquity} />

      <Card className={summary.isBalanced ? "border-status-success-surface bg-status-success-surface" : "border-status-error-surface bg-status-error-surface"}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="font-bold">الأصول = الخصوم + حقوق الملكية</span>
            <div className="flex items-center gap-4">
              <span className="text-status-info-foreground font-bold">{formatCurrency(totalAssets)}</span>
              <span className="text-muted-foreground">=</span>
              <span className="text-status-error-foreground font-bold">{formatCurrency(totalLiabilities)}</span>
              <span className="text-muted-foreground">+</span>
              <span className="text-purple-600 font-bold">{formatCurrency(totalEquity)}</span>
              <Badge className={summary.isBalanced ? "bg-status-success-surface text-status-success-foreground" : "bg-status-error-surface text-status-error-foreground"}>
                {summary.isBalanced ? "متوازن ✓" : "غير متوازن ✗"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CashFlow({ dateParams }: { dateParams: string }) {
  const { data, isLoading, isError } = useApiQuery<any>(["cash-flow", dateParams], `/finance/reports/cash-flow${dateParams ? `?${dateParams}` : ""}`);
  const summary = data?.summary || {};
  const inflows = data?.inflows || [];
  const outflows = data?.outflows || [];

  if (isLoading) return <div className="mt-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (isError) return <ErrorState />;

  const inflowColumns: DataTableColumn<any>[] = [
    { key: "description", header: "البيان", render: (f) => <span className="font-medium">{f.description || "-"}</span> },
    { key: "amount", header: "المبلغ", render: (f) => <span className="text-status-success-foreground font-bold">{formatCurrency(Number(f.amount))}</span> },
    { key: "date", header: "التاريخ", render: (f) => <span className="text-muted-foreground text-xs">{f.date ? formatDateAr(f.date) : ""}</span> },
  ];

  const outflowColumns: DataTableColumn<any>[] = [
    { key: "description", header: "البيان", render: (f) => <span className="font-medium">{f.description || "-"}</span> },
    { key: "amount", header: "المبلغ", render: (f) => <span className="text-status-error-foreground font-bold">{formatCurrency(Number(f.amount))}</span> },
    { key: "date", header: "التاريخ", render: (f) => <span className="text-muted-foreground text-xs">{f.date ? formatDateAr(f.date) : ""}</span> },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end gap-2">
        <PrintButton />
        <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => exportCSV([...inflows.map((f: any) => ({ ...f, type: "وارد" })), ...outflows.map((f: any) => ({ ...f, type: "صادر" }))], ["type", "description", "amount", "date"], "cash-flow.csv")}>
          <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
        </GuardedButton>
      </div>
      <div className="grid gap-3 grid-cols-3">
        <Card className="bg-status-success-surface"><CardContent className="p-4 text-center">
          <ArrowDownCircle className="h-6 w-6 text-status-success-foreground mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">التدفقات الداخلة</p>
          <p className="text-2xl font-bold text-status-success-foreground">{formatCurrency(Number(summary.totalInflow || 0))}</p>
        </CardContent></Card>
        <Card className="bg-status-error-surface"><CardContent className="p-4 text-center">
          <ArrowUpCircle className="h-6 w-6 text-status-error-foreground mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">التدفقات الخارجة</p>
          <p className="text-2xl font-bold text-status-error-foreground">{formatCurrency(Number(summary.totalOutflow || 0))}</p>
        </CardContent></Card>
        <Card className={Number(summary.netCashFlow || 0) >= 0 ? "bg-emerald-50" : "bg-rose-50"}><CardContent className="p-4 text-center">
          <DollarSign className="h-6 w-6 mx-auto mb-1" style={{ color: Number(summary.netCashFlow || 0) >= 0 ? "#059669" : "#dc2626" }} />
          <p className="text-xs text-muted-foreground">صافي التدفق</p>
          <p className="text-2xl font-bold" style={{ color: Number(summary.netCashFlow || 0) >= 0 ? "#059669" : "#dc2626" }}>
            {formatCurrency(Number(summary.netCashFlow || 0))}
          </p>
        </CardContent></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-status-success-foreground">التدفقات الداخلة</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={inflowColumns}
              data={inflows}
              rowKey={(_, i) => i}
              noToolbar
              pageSize={0}
              emptyMessage="لا توجد تدفقات"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-status-error-foreground">التدفقات الخارجة</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={outflowColumns}
              data={outflows}
              rowKey={(_, i) => i}
              noToolbar
              pageSize={0}
              emptyMessage="لا توجد تدفقات"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CashBankStatement({ dateParams }: { dateParams: string }) {
  const [accountCode, setAccountCode] = useState("1100");
  const params = `accountCode=${accountCode}${dateParams ? `&${dateParams}` : ""}`;
  const { data, isLoading, isError } = useApiQuery<any>(["cash-bank-statement", params], `/finance/reports/cash-bank-statement?${params}`);
  const entries = data?.entries || [];
  const summary = data?.summary || {};

  if (isError) return <ErrorState />;

  const cashBankColumns: DataTableColumn<any>[] = [
    { key: "date", header: "التاريخ", render: (e) => <span className="text-xs text-muted-foreground">{e.date ? formatDateAr(e.date) : "-"}</span> },
    { key: "ref", header: "المرجع", render: (e) => <span className="font-mono text-xs text-status-info-foreground">{e.ref || "-"}</span> },
    { key: "description", header: "الوصف", searchable: true, render: (e) => <span className="text-sm">{e.description || "-"}</span> },
    { key: "debit", header: "وارد", render: (e) => <span className="text-status-success-foreground">{Number(e.debit || 0) > 0 ? formatCurrency(Number(e.debit)) : "-"}</span> },
    { key: "credit", header: "صادر", render: (e) => <span className="text-status-error-foreground">{Number(e.credit || 0) > 0 ? formatCurrency(Number(e.credit)) : "-"}</span> },
    {
      key: "runningBalance", header: "الرصيد",
      render: (e) => (
        <span className="font-bold text-xs" style={{ color: Number(e.runningBalance) >= 0 ? "#16a34a" : "#dc2626" }}>
          {formatCurrency(Number(e.runningBalance || 0))}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={accountCode} onValueChange={setAccountCode}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="اختر الحساب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1100">1100 - الصندوق</SelectItem>
            <SelectItem value="1110">1110 - البنك</SelectItem>
          </SelectContent>
        </Select>
        <PrintButton />
        <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => exportCSV(entries, ["ref", "description", "debit", "credit", "runningBalance", "date"], `cash-${accountCode}.csv`)}>
          <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
        </GuardedButton>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">إجمالي الوارد</p>
          <p className="text-xl font-bold text-status-success-foreground">{formatCurrency(Number(summary.totalDebit || 0))}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">إجمالي الصادر</p>
          <p className="text-xl font-bold text-status-error-foreground">{formatCurrency(Number(summary.totalCredit || 0))}</p>
        </CardContent></Card>
        <Card className={Number(summary.closingBalance) >= 0 ? "bg-status-success-surface" : "bg-status-error-surface"}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">الرصيد الختامي</p>
            <p className="text-xl font-bold" style={{ color: Number(summary.closingBalance) >= 0 ? "#16a34a" : "#dc2626" }}>
              {formatCurrency(Number(summary.closingBalance || 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={cashBankColumns}
        data={entries}
        isLoading={isLoading}
        rowKey={(e, i) => e.id ?? i}
        noToolbar
        pageSize={0}
        emptyMessage="لا توجد حركات"
      />
    </div>
  );
}

function CustodyAdvances({ dateParams }: { dateParams: string }) {
  const { data, isLoading, isError } = useApiQuery<any>(["custody-advances", dateParams], `/finance/reports/custody-advances${dateParams ? `?${dateParams}` : ""}`);
  const custodies = data?.custodies || [];
  const advances = data?.advances || [];
  const summary = data?.summary || {};

  if (isLoading) return <div className="mt-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (isError) return <ErrorState />;

  const custodyColumns: DataTableColumn<any>[] = [
    { key: "ref", header: "المرجع", render: (c) => <span className="font-mono text-xs text-status-info-foreground">{c.ref}</span> },
    { key: "description", header: "الوصف", searchable: true, render: (c) => <span className="text-sm">{c.description || "-"}</span> },
    { key: "employeeName", header: "الموظف", render: (c) => <span className="text-xs text-muted-foreground">{c.employeeName || "-"}</span> },
    { key: "amount", header: "المبلغ", render: (c) => <span className="font-bold">{formatCurrency(Number(c.amount || 0))}</span> },
    { key: "date", header: "التاريخ", render: (c) => <span className="text-xs text-muted-foreground">{c.date ? formatDateAr(c.date) : "-"}</span> },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end gap-2">
        <PrintButton />
        <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => exportCSV([...custodies, ...advances], ["ref", "description", "amount", "employeeName", "date", "type"], "custody-advances.csv")}>
          <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
        </GuardedButton>
      </div>

      <div className="grid gap-3 grid-cols-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">إجمالي العهد</p>
          <p className="text-xl font-bold text-status-info-foreground">{formatCurrency(Number(summary.totalCustodies || 0))}</p>
          <p className="text-xs text-muted-foreground">{summary.custodyCount || 0} عهدة</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">إجمالي السلف</p>
          <p className="text-xl font-bold text-orange-600">{formatCurrency(Number(summary.totalAdvances || 0))}</p>
          <p className="text-xs text-muted-foreground">{summary.advanceCount || 0} سلفة</p>
        </CardContent></Card>
        <Card className="bg-surface-subtle"><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">الإجمالي</p>
          <p className="text-xl font-bold">{formatCurrency(Number(summary.total || 0))}</p>
        </CardContent></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-status-info-foreground text-base">العهد ({custodies.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={custodyColumns}
              data={custodies}
              noToolbar
              pageSize={0}
              emptyMessage="لا توجد عهد"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-orange-700 text-base">السلف ({advances.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={custodyColumns}
              data={advances}
              noToolbar
              pageSize={0}
              emptyMessage="لا توجد سلف"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ExpensesAnalysis({ dateParams }: { dateParams: string }) {
  const [groupBy, setGroupBy] = useState("account");
  const params = `groupBy=${groupBy}${dateParams ? `&${dateParams}` : ""}`;
  const { data, isLoading, isError } = useApiQuery<any>(["expenses-analysis", params], `/finance/reports/expenses-analysis?${params}`);
  const rows = data?.data || [];
  const summary = data?.summary || {};

  if (isError) return <ErrorState />;

  const expensesColumns: DataTableColumn<any>[] = [
    { key: "label", header: groupBy === "account" ? "الحساب" : groupBy === "branch" ? "الفرع" : "الموظف", searchable: true, render: (r) => <span className="font-medium">{r.label || "-"}</span> },
    { key: "amount", header: "المبلغ", render: (r) => <span className="text-status-error-foreground font-bold">{formatCurrency(Number(r.amount || 0))}</span> },
    { key: "entryCount", header: "عدد القيود", render: (r) => <span className="text-muted-foreground">{r.entryCount}</span> },
    {
      key: "pct", header: "النسبة",
      render: (r) => {
        const pct = summary.total > 0 ? Math.round(Number(r.amount) / summary.total * 100) : 0;
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-surface-subtle rounded-full h-1.5">
              <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-muted-foreground w-8">{pct}%</span>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="account">حسب الحساب</SelectItem>
            <SelectItem value="branch">حسب الفرع</SelectItem>
            <SelectItem value="employee">حسب الموظف</SelectItem>
          </SelectContent>
        </Select>
        <PrintButton />
        <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => exportCSV(rows, ["key", "label", "amount", "entryCount"], "expenses-analysis.csv")}>
          <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
        </GuardedButton>
      </div>

      <Card><CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground">إجمالي المصروفات</p>
        <p className="text-2xl font-bold text-status-error-foreground">{formatCurrency(Number(summary.total || 0))}</p>
      </CardContent></Card>

      <DataTable
        columns={expensesColumns}
        data={rows}
        isLoading={isLoading}
        rowKey={(r, i) => r.key ?? i}
        noToolbar
        pageSize={0}
        emptyMessage="لا توجد بيانات"
      />
    </div>
  );
}

function RevenueAnalysis({ dateParams }: { dateParams: string }) {
  const { data, isLoading, isError } = useApiQuery<any>(["revenue-analysis", dateParams], `/finance/reports/revenue-analysis${dateParams ? `?${dateParams}` : ""}`);
  const byAccount = data?.byAccount || [];
  const byMonth = data?.byMonth || [];
  const summary = data?.summary || {};

  if (isLoading) return <div className="mt-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (isError) return <ErrorState />;

  const byAccountColumns: DataTableColumn<any>[] = [
    {
      key: "name", header: "الحساب",
      render: (r) => (
        <div>
          <p className="font-medium">{r.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{r.code}</p>
        </div>
      ),
    },
    { key: "amount", header: "المبلغ", render: (r) => <span className="text-status-success-foreground font-bold">{formatCurrency(Number(r.amount || 0))}</span> },
    {
      key: "pct", header: "النسبة",
      render: (r) => {
        const pct = Number(summary.totalRevenue) > 0 ? ((Number(r.amount) / Number(summary.totalRevenue)) * 100).toFixed(1) : "0.0";
        return <span className="text-xs text-muted-foreground">{pct}%</span>;
      },
    },
  ];

  const byMonthColumns: DataTableColumn<any>[] = [
    { key: "period", header: "الشهر", render: (r) => <span className="font-mono">{r.period}</span> },
    { key: "invoiced", header: "الفواتير", render: (r) => formatCurrency(Number(r.invoiced || 0)) },
    { key: "collected", header: "المحصّل", render: (r) => <span className="text-status-success-foreground font-bold">{formatCurrency(Number(r.collected || 0))}</span> },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end gap-2">
        <PrintButton />
        <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => exportCSV(byAccount, ["code", "name", "amount", "entryCount"], "revenue-analysis.csv")}>
          <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
        </GuardedButton>
      </div>

      <Card><CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground">إجمالي الإيرادات</p>
        <p className="text-2xl font-bold text-status-success-foreground">{formatCurrency(Number(summary.totalRevenue || 0))}</p>
      </CardContent></Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">الإيرادات حسب الحساب</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={byAccountColumns}
              data={byAccount}
              rowKey={(r) => r.code}
              noToolbar
              pageSize={0}
              emptyMessage="لا توجد بيانات"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">الإيرادات الشهرية</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={byMonthColumns}
              data={byMonth}
              rowKey={(r) => r.period}
              noToolbar
              pageSize={0}
              emptyMessage="لا توجد بيانات"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BudgetVariance() {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const { data, isLoading, isError } = useApiQuery<any>(["budget-variance", period], `/finance/reports/budget-variance?period=${period}`);
  const rows = data?.data || [];
  const summary = data?.summary || {};

  if (isError) return <ErrorState />;

  const varianceColor = (v: number) => v >= 0 ? "#16a34a" : "#dc2626";

  const budgetColumns: DataTableColumn<any>[] = [
    {
      key: "accountName", header: "الحساب", searchable: true,
      render: (r) => (
        <div>
          <p className="font-medium">{r.accountName || r.accountCode}</p>
          <p className="font-mono text-xs text-muted-foreground">{r.accountCode}</p>
        </div>
      ),
    },
    { key: "budget", header: "الميزانية", render: (r) => formatCurrency(Number(r.budget || 0)) },
    { key: "actual", header: "الفعلي", render: (r) => formatCurrency(Number(r.actual || 0)) },
    {
      key: "variance", header: "الانحراف",
      render: (r) => (
        <span className="font-bold" style={{ color: varianceColor(Number(r.variance)) }}>
          {formatCurrency(Number(r.variance || 0))}
        </span>
      ),
    },
    {
      key: "usagePct", header: "نسبة الاستخدام",
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-surface-subtle rounded-full h-2">
            <div
              className={`h-2 rounded-full ${Number(r.usagePct) > 100 ? "bg-status-error-surface0" : Number(r.usagePct) > 80 ? "bg-orange-400" : "bg-green-400"}`}
              style={{ width: `${Math.min(100, Number(r.usagePct || 0))}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-10">{r.usagePct}%</span>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3">
        <Input type="month" className="w-40" value={period} onChange={(e) => setPeriod(e.target.value)} />
        <PrintButton />
        <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => exportCSV(rows, ["accountCode", "accountName", "budget", "actual", "variance", "usagePct"], "budget-variance.csv")}>
          <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
        </GuardedButton>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">الميزانية الإجمالية</p>
          <p className="text-xl font-bold text-status-info-foreground">{formatCurrency(Number(summary.totalBudget || 0))}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">الفعلي</p>
          <p className="text-xl font-bold text-orange-600">{formatCurrency(Number(summary.totalActual || 0))}</p>
        </CardContent></Card>
        <Card className={Number(summary.totalVariance) >= 0 ? "bg-status-success-surface" : "bg-status-error-surface"}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">الانحراف</p>
            <p className="text-xl font-bold" style={{ color: varianceColor(Number(summary.totalVariance)) }}>
              {formatCurrency(Number(summary.totalVariance || 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={budgetColumns}
        data={rows}
        isLoading={isLoading}
        rowKey={(r) => r.accountCode}
        noToolbar
        pageSize={0}
        emptyMessage="لا توجد بيانات ميزانية للفترة المختارة"
      />
    </div>
  );
}

function EntityStatement({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [entityType, setEntityType] = useState<"employee" | "client" | "supplier">("client");
  const [entityId, setEntityId] = useState("");

  const { data: entitiesData } = useApiQuery<any>(
    ["entities", entityType],
    `/finance/reports/entities/${entityType}`
  );
  const entities = entitiesData?.data || [];

  const dateParams = [
    startDate ? `startDate=${startDate}` : "",
    endDate ? `endDate=${endDate}` : "",
  ].filter(Boolean).join("&");

  const enabled = !!entityId;
  const params = `entityType=${entityType}&entityId=${entityId}${dateParams ? `&${dateParams}` : ""}`;
  const { data, isLoading, isError } = useApiQuery<any>(
    ["entity-statement", params],
    `/finance/reports/entity-statement?${params}`,
    enabled
  );

  if (isError) return <ErrorState />;

  const rows = data?.rows || [];
  const summary = data?.summary || {};
  const entityName = data?.entityName || "";

  let runningBalance = 0;
  const rowsWithBalance = rows.map((r: any) => {
    runningBalance += Number(r.debit || 0) - Number(r.credit || 0);
    return { ...r, runningBalance };
  });

  const entityColumns: DataTableColumn<any>[] = [
    { key: "date", header: "التاريخ", render: (r) => <span className="text-xs text-muted-foreground">{r.date ? formatDateAr(r.date) : "-"}</span> },
    { key: "ref", header: "المرجع", render: (r) => <span className="font-mono text-xs text-status-info-foreground">{r.ref || "-"}</span> },
    { key: "description", header: "البيان", searchable: true, render: (r) => r.description || "-" },
    { key: "debit", header: "مدين", render: (r) => <span className="text-status-success-foreground">{Number(r.debit || 0) > 0 ? formatCurrency(Number(r.debit)) : "-"}</span> },
    { key: "credit", header: "دائن", render: (r) => <span className="text-status-error-foreground">{Number(r.credit || 0) > 0 ? formatCurrency(Number(r.credit)) : "-"}</span> },
    {
      key: "runningBalance", header: "الرصيد التراكمي",
      render: (r) => (
        <span className="font-bold text-xs" style={{ color: Number(r.runningBalance) >= 0 ? "#16a34a" : "#dc2626" }}>
          {formatCurrency(Number(r.runningBalance || 0))}
        </span>
      ),
    },
    { key: "type", header: "الحالة", render: (r) => <Badge variant="outline" className="text-xs">{r.type || "-"}</Badge> },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={entityType} onValueChange={(v: any) => { setEntityType(v); setEntityId(""); }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="client">عميل</SelectItem>
            <SelectItem value="supplier">مورد</SelectItem>
            <SelectItem value="employee">موظف</SelectItem>
          </SelectContent>
        </Select>

        <Select value={entityId} onValueChange={setEntityId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder={`اختر ${entityType === "client" ? "العميل" : entityType === "supplier" ? "المورد" : "الموظف"}`} />
          </SelectTrigger>
          <SelectContent>
            {entities.length === 0 ? (
              <SelectItem value="__none" disabled>لا توجد بيانات</SelectItem>
            ) : entities.map((e: any) => (
              <SelectItem key={e.id} value={String(e.id)}>
                {e.name} {e.phone ? `(${e.phone})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {rows.length > 0 && (
          <>
            <PrintButton />
            <GuardedButton perm="finance:export" variant="outline" size="sm" onClick={() => exportCSV(rowsWithBalance, ["ref", "description", "debit", "credit", "runningBalance", "date", "type"], `entity-statement-${entityId}.csv`)}>
              <Download className="h-3.5 w-3.5 me-1" />تصدير جدولي
            </GuardedButton>
          </>
        )}
      </div>

      {!entityId && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
          اختر نوع الجهة ثم اختر الجهة من القائمة لعرض كشف حسابها
        </CardContent></Card>
      )}

      {enabled && (
        <>
          {entityName && (
            <div className="flex items-center gap-2 p-3 bg-status-info-surface rounded-lg border border-status-info-surface">
              <FileText className="h-4 w-4 text-status-info-foreground" />
              <span className="font-semibold text-status-info-foreground">{entityName}</span>
              <Badge variant="outline" className="text-xs">
                {entityType === "client" ? "عميل" : entityType === "supplier" ? "مورد" : "موظف"}
              </Badge>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">إجمالي المدين</p>
              <p className="text-xl font-bold text-status-success-foreground">{formatCurrency(Number(summary.totalDebit || 0))}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">إجمالي الدائن</p>
              <p className="text-xl font-bold text-status-error-foreground">{formatCurrency(Number(summary.totalCredit || 0))}</p>
            </CardContent></Card>
            <Card className={Number(summary.balance) >= 0 ? "bg-status-success-surface" : "bg-status-error-surface"}>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">الرصيد</p>
                <p className="text-xl font-bold" style={{ color: Number(summary.balance) >= 0 ? "#16a34a" : "#dc2626" }}>
                  {formatCurrency(Number(summary.balance || 0))}
                </p>
              </CardContent>
            </Card>
          </div>

          <DataTable
            columns={entityColumns}
            data={rowsWithBalance}
            isLoading={isLoading}
            rowKey={(r, i) => r.ref || i}
            noToolbar
            pageSize={0}
            emptyMessage="لا توجد حركات للجهة المحددة"
          />
          {rowsWithBalance.length > 0 && (
            <div className="grid grid-cols-7 gap-0 bg-surface-subtle font-bold rounded-lg overflow-hidden border">
              <div className="col-span-3 p-3">المجموع</div>
              <div className="p-3 text-status-success-foreground">{formatCurrency(Number(summary.totalDebit || 0))}</div>
              <div className="p-3 text-status-error-foreground">{formatCurrency(Number(summary.totalCredit || 0))}</div>
              <div className="p-3 font-bold" style={{ color: Number(summary.balance) >= 0 ? "#16a34a" : "#dc2626" }}>
                {formatCurrency(Number(summary.balance || 0))}
              </div>
              <div className="p-3">{summary.count || 0} حركة</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
