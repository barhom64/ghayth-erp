import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { exportRowsToCsv } from "@/lib/unified-export";
import { PageShell, PageStatusBadge, resolveStatus } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import {
  Receipt, Wallet, AlertTriangle, Users, TrendingUp, Calendar, Download, FileText,
} from "lucide-react";
import { formatCurrency, formatUmrahDate } from "@/lib/formatters";

// تقرير ملخّص فواتير العملاء — §11 من شرائع #1870.
// مكمِّل لـ /umrah/invoices (الـ CRUD). هنا الإجمالات + التوزيع.
//
// يجاوب:
//   «أصدرنا كم فاتورة؟ كم المُحصَّل؟ كم المتبقي؟ من المتأخّر؟»
//
// API: GET /umrah/reports/sales-invoices-summary
//   ↳ { kpis, byStatus, byMonth, bySubAgent, recent }

interface KpiRow {
  total: number;
  totalAmount: number | string;
  paidAmount: number | string;
  outstandingAmount: number | string;
  pilgrimsCount: number;
  overdueCount: number;
  subAgentsCount: number;
}
interface BreakdownByStatus {
  status: string;
  count: number;
  totalAmount: number | string;
  paidAmount: number | string;
}
interface BreakdownByMonth {
  month: string;
  count: number;
  totalAmount: number | string;
  paidAmount: number | string;
}
interface BreakdownBySubAgent {
  subAgentId: number | null;
  subAgentName: string | null;
  subAgentNuskCode: string | null;
  count: number;
  totalAmount: number | string;
  paidAmount: number | string;
  outstandingAmount: number | string;
}
interface RecentRow {
  id: number;
  ref: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  status: string;
  subAgentId: number | null;
  subAgentName: string | null;
  subAgentNuskCode: string | null;
  clientId: number | null;
  clientName: string | null;
  seasonId: number | null;
  seasonTitle: string | null;
  total: number | string;
  paidAmount: number | string;
  outstanding: number | string;
  pilgrimCount: number | null;
  journalEntryId: number | null;
  createdAt: string;
}
interface SummaryResp {
  kpis: KpiRow;
  byStatus: BreakdownByStatus[];
  byMonth: BreakdownByMonth[];
  bySubAgent: BreakdownBySubAgent[];
  recent: RecentRow[];
}

interface SeasonOpt { id: number; title: string }
interface SubAgentOpt { id: number; name: string; nuskCode: string | null }

// حالات الفاتورة من المصدر القانوني الواحد (domain="invoice")؛ نُبقي مفاتيح
// الفلترة السبعة كما كانت بالضبط، والتسميات تأتي من STATUS_MAP.
const INVOICE_STATUS_KEYS = ["draft", "approved", "sent", "partially_paid", "paid", "overdue", "cancelled"] as const;
const statusLabelOf = (s: string) => resolveStatus(s, "invoice")?.label ?? s;

function num(v: number | string | null | undefined): number {
  return Number(v ?? 0);
}

function BreakdownRows({ rows, testid, label }: {
  rows: Array<Record<string, unknown>>;
  testid: string;
  label: (r: Record<string, unknown>) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="p-4 text-center text-xs text-muted-foreground" data-testid={`${testid}-empty`}>
        لا بيانات.
      </p>
    );
  }
  const totalCount = rows.reduce((acc, r) => acc + num(r.count as number), 0);
  return (
    <div className="overflow-x-auto"><table className="w-full text-xs" data-testid={testid}>
      <thead>
        <tr className="text-right text-muted-foreground border-b bg-surface-subtle">
          <th className="p-2 font-medium">البند</th>
          <th className="p-2 font-medium">العدد</th>
          <th className="p-2 font-medium">٪</th>
          <th className="p-2 font-medium">إجمالي</th>
          <th className="p-2 font-medium">مدفوع</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => {
          const pct = totalCount > 0 ? Math.round((num(r.count as number) / totalCount) * 100) : 0;
          return (
            <tr
              key={idx}
              className="border-b last:border-b-0 hover:bg-muted/30"
              data-testid={`${testid}-row-${idx}`}
            >
              <td className="p-2 font-medium">{label(r)}</td>
              <td className="p-2">{num(r.count as number)}</td>
              <td className="p-2 text-muted-foreground">{pct}٪</td>
              <td className="p-2 font-semibold">{formatCurrency(num(r.totalAmount as number))}</td>
              <td className="p-2 text-status-success-foreground">
                {formatCurrency(num(r.paidAmount as number))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}

export default function UmrahSalesInvoicesSummaryReport() {
  const [seasonFilter, setSeasonFilter] = useState("all");
  const [subAgentFilter, setSubAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const qs = useMemo(() => {
    const parts: string[] = [];
    if (seasonFilter   !== "all") parts.push(`seasonId=${seasonFilter}`);
    if (subAgentFilter !== "all") parts.push(`subAgentId=${subAgentFilter}`);
    if (statusFilter   !== "all") parts.push(`status=${statusFilter}`);
    if (fromDate)                 parts.push(`from=${fromDate}`);
    if (toDate)                   parts.push(`to=${toDate}`);
    return parts.length ? `?${parts.join("&")}` : "";
  }, [seasonFilter, subAgentFilter, statusFilter, fromDate, toDate]);

  const { data, isLoading, isError, refetch } = useApiQuery<SummaryResp>(
    ["umrah-sales-invoices-summary", seasonFilter, subAgentFilter, statusFilter, fromDate, toDate],
    `/umrah/reports/sales-invoices-summary${qs}`,
  );
  const { data: seasonsResp } = useApiQuery<{ data: SeasonOpt[] }>(
    ["umrah-seasons-select"],
    "/umrah/seasons",
  );
  const { data: subAgentsResp } = useApiQuery<{ data: SubAgentOpt[] }>(
    ["umrah-sub-agents-select"],
    "/umrah/sub-agents",
  );

  const kpis = data?.kpis ?? {
    total: 0, totalAmount: 0, paidAmount: 0, outstandingAmount: 0,
    pilgrimsCount: 0, overdueCount: 0, subAgentsCount: 0,
  };
  const byStatus    = data?.byStatus    ?? [];
  const byMonth     = data?.byMonth     ?? [];
  const bySubAgent  = data?.bySubAgent  ?? [];
  const recent      = data?.recent      ?? [];
  const seasons     = seasonsResp?.data ?? [];
  const subAgents   = subAgentsResp?.data ?? [];

  const exportCsv = () => {
    void exportRowsToCsv({
      entityType: "report_umrah_sales_invoices_summary",
      title: "ملخّص فواتير العملاء",
      rows: recent as unknown as Record<string, unknown>[],
      columns: [
        { key: "id",               label: "id" },
        { key: "ref",              label: "ref" },
        { key: "invoiceDate",      label: "invoiceDate" },
        { key: "dueDate",          label: "dueDate" },
        { key: "status",           label: "status" },
        { key: "subAgentName",     label: "subAgentName" },
        { key: "subAgentNuskCode", label: "subAgentNuskCode" },
        { key: "clientName",       label: "clientName" },
        { key: "seasonTitle",      label: "seasonTitle" },
        { key: "total",            label: "total" },
        { key: "paidAmount",       label: "paidAmount" },
        { key: "outstanding",      label: "outstanding" },
        { key: "pilgrimCount",     label: "pilgrimCount" },
        { key: "journalEntryId",   label: "journalEntryId" },
      ],
    }).catch((err) => console.error("[export] failed", err));
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError)   return <ErrorState onRetry={refetch} />;

  const kpiTiles = [
    {
      label: "عدد الفواتير",
      value: String(kpis.total),
      icon: FileText,
      tone: "text-status-info-foreground bg-status-info-surface",
      testid: "sales-invoices-kpi-total",
    },
    {
      label: "إجمالي المُفوتر",
      value: formatCurrency(num(kpis.totalAmount)),
      icon: TrendingUp,
      tone: "text-status-info-foreground bg-status-info-surface",
      testid: "sales-invoices-kpi-total-amount",
    },
    {
      label: "إجمالي المُحصَّل",
      value: formatCurrency(num(kpis.paidAmount)),
      icon: Wallet,
      tone: "text-status-success-foreground bg-status-success-surface",
      testid: "sales-invoices-kpi-paid",
    },
    {
      label: "الرصيد المستحق",
      value: formatCurrency(num(kpis.outstandingAmount)),
      icon: AlertTriangle,
      tone: num(kpis.outstandingAmount) > 0
        ? "text-status-error-foreground bg-status-error-surface"
        : "text-status-neutral-foreground bg-status-neutral-surface",
      testid: "sales-invoices-kpi-outstanding",
    },
    {
      label: "المعتمرون",
      value: String(kpis.pilgrimsCount),
      icon: Users,
      tone: "text-status-info-foreground bg-status-info-surface",
      testid: "sales-invoices-kpi-pilgrims",
    },
    {
      label: "متأخّرة",
      value: String(kpis.overdueCount),
      icon: Calendar,
      tone: kpis.overdueCount > 0
        ? "text-status-error-foreground bg-status-error-surface"
        : "text-status-neutral-foreground bg-status-neutral-surface",
      testid: "sales-invoices-kpi-overdue",
    },
    {
      label: "الوكلاء الفرعيون",
      value: String(kpis.subAgentsCount),
      icon: Receipt,
      tone: "text-status-info-foreground bg-status-info-surface",
      testid: "sales-invoices-kpi-subagents",
    },
  ];

  return (
    <PageShell
      title="ملخّص فواتير العملاء — تقرير مجمَّع"
      subtitle="إجمالي المُفوتر + المُحصَّل + الرصيد + المتأخّرون + توزيع الفواتير حسب الحالة والشهر والوكيل الفرعي"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "ملخّص فواتير العملاء" }]}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={recent.length === 0}
          className="gap-1"
          data-testid="sales-invoices-export-csv"
        >
          <Download className="h-3 w-3" /> تصدير CSV
        </Button>
      }
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الموسم</label>
            <Select value={seasonFilter} onValueChange={setSeasonFilter}>
              <SelectTrigger className="w-[180px]" data-testid="sales-invoices-filter-season">
                <SelectValue placeholder="كل المواسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواسم</SelectItem>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الوكيل الفرعي</label>
            <Select value={subAgentFilter} onValueChange={setSubAgentFilter}>
              <SelectTrigger className="w-[200px]" data-testid="sales-invoices-filter-subagent">
                <SelectValue placeholder="كل الوكلاء" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الوكلاء</SelectItem>
                {subAgents.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}{s.nuskCode ? ` · ${s.nuskCode}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الحالة</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="sales-invoices-filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {INVOICE_STATUS_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>{statusLabelOf(k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">من تاريخ</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-[160px]"
              data-testid="sales-invoices-filter-from"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">إلى تاريخ</label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-[160px]"
              data-testid="sales-invoices-filter-to"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpiTiles.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className={`inline-flex h-8 w-8 items-center justify-center rounded ${k.tone}`}>
                <k.icon className="h-4 w-4" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{k.label}</p>
              <p className="text-xl font-bold mt-1" data-testid={k.testid}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="status" className="w-full">
            <TabsList className="m-3" data-testid="sales-invoices-breakdown-tabs">
              <TabsTrigger value="status"   data-testid="sales-invoices-tab-status">الحالة</TabsTrigger>
              <TabsTrigger value="month"    data-testid="sales-invoices-tab-month">الشهر</TabsTrigger>
              <TabsTrigger value="subagent" data-testid="sales-invoices-tab-subagent">الوكيل الفرعي</TabsTrigger>
            </TabsList>
            <TabsContent value="status">
              <BreakdownRows
                rows={byStatus as unknown as Array<Record<string, unknown>>}
                testid="sales-invoices-breakdown-status"
                label={(r) => statusLabelOf(r.status as string)}
              />
            </TabsContent>
            <TabsContent value="month">
              <BreakdownRows
                rows={byMonth as unknown as Array<Record<string, unknown>>}
                testid="sales-invoices-breakdown-month"
                label={(r) => (r.month as string) || "—"}
              />
            </TabsContent>
            <TabsContent value="subagent">
              <BreakdownRows
                rows={bySubAgent as unknown as Array<Record<string, unknown>>}
                testid="sales-invoices-breakdown-subagent"
                label={(r) => (r.subAgentName as string) || `#${r.subAgentId ?? "—"}`}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <p className="text-sm font-semibold">آخر الفواتير</p>
            <p className="text-xs text-muted-foreground">
              {recent.length} من أصل {kpis.total}
            </p>
          </div>
          {recent.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm" data-testid="sales-invoices-recent-empty">
              لا فواتير ضمن الفلتر الحالي.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="sales-invoices-recent-table">
                <thead>
                  <tr className="text-right text-muted-foreground border-b bg-surface-subtle">
                    <th className="p-2 font-medium">المرجع</th>
                    <th className="p-2 font-medium">الحالة</th>
                    <th className="p-2 font-medium">التاريخ</th>
                    <th className="p-2 font-medium">الاستحقاق</th>
                    <th className="p-2 font-medium">الوكيل الفرعي</th>
                    <th className="p-2 font-medium">العميل</th>
                    <th className="p-2 font-medium">الموسم</th>
                    <th className="p-2 font-medium">معتمرون</th>
                    <th className="p-2 font-medium">الإجمالي</th>
                    <th className="p-2 font-medium">المدفوع</th>
                    <th className="p-2 font-medium">المتبقي</th>
                    <th className="p-2 font-medium">القيد</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => {
                    const outstanding = num(r.outstanding);
                    const overdue = r.dueDate && new Date(r.dueDate) < new Date() && outstanding > 0
                      && r.status !== "paid" && r.status !== "cancelled";
                    return (
                      <tr
                        key={r.id}
                        className="border-b last:border-b-0 hover:bg-muted/30"
                        data-testid={`sales-invoices-recent-row-${r.id}`}
                      >
                        <td className="p-2 font-mono text-[11px]">
                          <Link
                            href={`/umrah/invoices/${r.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {r.ref || `#${r.id}`}
                          </Link>
                        </td>
                        <td className="p-2">
                          <PageStatusBadge status={r.status} domain="invoice" />
                        </td>
                        <td className="p-2">{r.invoiceDate ? formatUmrahDate(r.invoiceDate) : "—"}</td>
                        <td className={`p-2 ${overdue ? "text-status-error-foreground font-semibold" : ""}`}>
                          {r.dueDate ? formatUmrahDate(r.dueDate) : "—"}
                        </td>
                        <td className="p-2">
                          {r.subAgentId ? (
                            <Link href={`/umrah/sub-agents/${r.subAgentId}`} className="text-blue-600 hover:underline">
                              {r.subAgentName || `#${r.subAgentId}`}
                            </Link>
                          ) : "—"}
                          {r.subAgentNuskCode && (
                            <p className="text-[10px] font-mono text-muted-foreground">{r.subAgentNuskCode}</p>
                          )}
                        </td>
                        <td className="p-2">{r.clientName || "—"}</td>
                        <td className="p-2">{r.seasonTitle || "—"}</td>
                        <td className="p-2">{r.pilgrimCount ?? 0}</td>
                        <td className="p-2 font-semibold">{formatCurrency(num(r.total))}</td>
                        <td className="p-2 text-status-success-foreground">{formatCurrency(num(r.paidAmount))}</td>
                        <td
                          className={`p-2 font-bold ${outstanding > 0 ? "text-status-error-foreground" : ""}`}
                          data-testid={`sales-invoices-recent-outstanding-${r.id}`}
                        >
                          {formatCurrency(outstanding)}
                        </td>
                        <td className="p-2 text-[11px]">
                          {r.journalEntryId ? (
                            <Badge variant="outline" className="text-[10px] gap-1 bg-status-success-surface text-status-success-foreground">
                              ✓ {r.journalEntryId}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              بدون قيد
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
