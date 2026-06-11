/**
 * Nusk Invoices Summary Report — §11 partial → full (#1870)
 *
 * Finance-focused rollup over umrah_nusk_invoices. KPI tiles +
 * AP-posting tracking (purchaseInvoiceId IS NULL = pending AP) +
 * 3 breakdowns (status / month / agent) + recent 100 rows.
 *
 * The existing /umrah/nusk-invoices page stays as the list/edit
 * screen for individual rows.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency } from "@/lib/formatters";
import { Receipt, AlertCircle } from "lucide-react";

interface SummaryResp {
  kpis: {
    total: number;
    totalAmount: number;
    netCostTotal: number;
    refundedTotal: number;
    mutamerCount: number;
    apPostedCount: number;
    apPendingCount: number;
  };
  byStatus: Array<{ status: string; count: number; total: number }>;
  byMonth:  Array<{ month: string; count: number; total: number }>;
  byAgent:  Array<{ agentId: number; agentName: string | null; count: number; total: number }>;
  recent: Array<{
    id: number;
    nuskInvoiceNumber: string;
    nuskStatus: string;
    totalAmount: string | number;
    netCost: string | number;
    refundAmount: string | number;
    mutamerCount: number;
    issueDate: string | null;
    expiryDate: string | null;
    agentId: number | null;
    agentName: string | null;
    groupId: number | null;
    groupName: string | null;
    purchaseInvoiceId: number | null;
  }>;
}

interface SeasonOpt { id: number; title: string }
interface AgentOpt { id: number; name: string }

const STATUS_LABEL_AR: Record<string, string> = {
  pending:     "معلقة",
  paid:        "مدفوعة",
  in_progress: "قيد التنفيذ",
  expired:     "منتهية",
  refunded:    "مستردة",
  cancelled:   "ملغاة",
};

const STATUS_TONE: Record<string, string> = {
  pending:     "bg-amber-100 text-amber-700 border-amber-300",
  paid:        "bg-emerald-100 text-emerald-700 border-emerald-300",
  in_progress: "bg-sky-100 text-sky-700 border-sky-300",
  expired:     "bg-rose-100 text-rose-700 border-rose-300",
  refunded:    "bg-violet-100 text-violet-700 border-violet-300",
  cancelled:   "bg-slate-100 text-slate-600 border-slate-300",
};

export default function NuskInvoicesSummaryReport() {
  const [seasonFilter, setSeasonFilter] = useState("all");
  const [agentFilter, setAgentFilter]   = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate]         = useState("");
  const [toDate, setToDate]             = useState("");

  const qsParts: string[] = [];
  if (seasonFilter !== "all") qsParts.push(`seasonId=${seasonFilter}`);
  if (agentFilter !== "all")  qsParts.push(`agentId=${agentFilter}`);
  if (statusFilter !== "all") qsParts.push(`status=${statusFilter}`);
  if (fromDate)               qsParts.push(`from=${fromDate}`);
  if (toDate)                 qsParts.push(`to=${toDate}`);
  const qs = qsParts.length ? `?${qsParts.join("&")}` : "";

  const { data, isLoading, isError, refetch } = useApiQuery<SummaryResp>(
    ["umrah-nusk-summary", seasonFilter, agentFilter, statusFilter, fromDate, toDate],
    `/umrah/reports/nusk-invoices-summary${qs}`,
  );
  const { data: seasonsResp } = useApiQuery<{ data: SeasonOpt[] }>(
    ["umrah-seasons-select"],
    "/umrah/seasons",
  );
  const { data: agentsResp } = useApiQuery<{ data: AgentOpt[] }>(
    ["umrah-agents-select"],
    "/umrah/agents",
  );
  const seasons = seasonsResp?.data ?? [];
  const agents = agentsResp?.data ?? [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const k = data?.kpis;

  return (
    <PageShell
      title="تقرير فواتير نُسك (ملخص)"
      subtitle="مؤشرات إجمالية + حالة الترحيل للذمم الدائنة + تفصيل حسب الحالة / الشهر / الوكيل"
      breadcrumbs={[
        { href: "/umrah", label: "إدارة العمرة" },
        { href: "/umrah/reports", label: "التقارير" },
        { label: "ملخص فواتير نُسك" },
      ]}
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3" data-testid="nusk-summary-filters">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">الموسم</Label>
            <Select value={seasonFilter} onValueChange={setSeasonFilter}>
              <SelectTrigger data-testid="nusk-filter-season"><SelectValue placeholder="كل المواسم" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواسم</SelectItem>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">الوكيل</Label>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger data-testid="nusk-filter-agent"><SelectValue placeholder="كل الوكلاء" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الوكلاء</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">الحالة</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="nusk-filter-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {Object.entries(STATUS_LABEL_AR).map(([k2, v]) => (
                  <SelectItem key={k2} value={k2}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">من تاريخ الإصدار</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} data-testid="nusk-filter-from" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">إلى تاريخ الإصدار</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} data-testid="nusk-filter-to" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="عدد الفواتير" value={k?.total ?? 0} testid="nusk-kpi-total" />
        <KpiCard label="إجمالي المبالغ" value={k?.totalAmount ?? 0} testid="nusk-kpi-total-amount" asCurrency />
        <KpiCard label="إجمالي صافي التكلفة" value={k?.netCostTotal ?? 0} testid="nusk-kpi-net-cost" asCurrency />
        <KpiCard label="إجمالي المسترد" value={k?.refundedTotal ?? 0} testid="nusk-kpi-refunded" asCurrency />
        <KpiCard label="عدد المعتمرين" value={k?.mutamerCount ?? 0} testid="nusk-kpi-mutamers" />
        <KpiCard
          label="مع قيد ذمم (AP)"
          value={k?.apPostedCount ?? 0}
          testid="nusk-kpi-ap-posted"
          tone="success"
        />
        <KpiCard
          label="بدون قيد ذمم (AP)"
          value={k?.apPendingCount ?? 0}
          testid="nusk-kpi-ap-pending"
          tone="error"
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <Tabs defaultValue="status">
            <TabsList data-testid="nusk-breakdown-tabs">
              <TabsTrigger value="status" data-testid="nusk-tab-status">حسب الحالة</TabsTrigger>
              <TabsTrigger value="month"  data-testid="nusk-tab-month">حسب الشهر</TabsTrigger>
              <TabsTrigger value="agent"  data-testid="nusk-tab-agent">حسب الوكيل</TabsTrigger>
            </TabsList>

            <TabsContent value="status">
              <BreakdownRows
                rows={(data?.byStatus ?? []).map((r) => ({
                  label: STATUS_LABEL_AR[r.status] ?? r.status,
                  tone: STATUS_TONE[r.status],
                  count: r.count,
                  total: r.total,
                  key: r.status,
                }))}
                testid="nusk-breakdown-status"
              />
            </TabsContent>
            <TabsContent value="month">
              <BreakdownRows
                rows={(data?.byMonth ?? []).map((r) => ({
                  label: r.month,
                  count: r.count,
                  total: r.total,
                  key: r.month,
                }))}
                testid="nusk-breakdown-month"
              />
            </TabsContent>
            <TabsContent value="agent">
              <BreakdownRows
                rows={(data?.byAgent ?? []).map((r) => ({
                  label: r.agentName ?? `#${r.agentId}`,
                  href: `/umrah/agents/${r.agentId}`,
                  count: r.count,
                  total: r.total,
                  key: String(r.agentId),
                }))}
                testid="nusk-breakdown-agent"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="p-4 border-b">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              آخر 100 فاتورة
            </p>
          </div>
          {(data?.recent ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center" data-testid="nusk-recent-empty">
              لا فواتير تطابق الفلاتر.
            </p>
          ) : (
            <table className="w-full text-sm" data-testid="nusk-recent-table">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2 text-start">رقم نُسك</th>
                  <th className="p-2 text-start">المجموعة</th>
                  <th className="p-2 text-start">الوكيل</th>
                  <th className="p-2 text-start">الإصدار</th>
                  <th className="p-2 text-start">الانتهاء</th>
                  <th className="p-2 text-end">معتمرون</th>
                  <th className="p-2 text-end">الإجمالي</th>
                  <th className="p-2 text-start">قيد AP</th>
                  <th className="p-2 text-start">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent ?? []).map((r) => {
                  const tone = STATUS_TONE[r.nuskStatus] ?? "bg-slate-100 text-slate-700 border-slate-300";
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/20" data-testid={`nusk-recent-row-${r.id}`}>
                      <td className="p-2 font-mono text-xs">{r.nuskInvoiceNumber}</td>
                      <td className="p-2 text-xs">
                        {r.groupId ? (
                          <Link href={`/umrah/groups/${r.groupId}`} className="text-blue-600 hover:underline">
                            {r.groupName ?? `#${r.groupId}`}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="p-2 text-xs">
                        {r.agentId ? (
                          <Link href={`/umrah/agents/${r.agentId}`} className="text-blue-600 hover:underline">
                            {r.agentName ?? `#${r.agentId}`}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="p-2 text-xs">{r.issueDate ?? "—"}</td>
                      <td className="p-2 text-xs">{r.expiryDate ?? "—"}</td>
                      <td className="p-2 text-end font-mono">{r.mutamerCount}</td>
                      <td className="p-2 text-end font-mono">{formatCurrency(Number(r.totalAmount) || 0)}</td>
                      <td className="p-2">
                        {r.purchaseInvoiceId ? (
                          <span className="text-[10px] text-emerald-700">✓ مرحَّل</span>
                        ) : (
                          <span className="text-[10px] text-rose-700 inline-flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> بانتظار
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap ${tone}`}>
                          {STATUS_LABEL_AR[r.nuskStatus] ?? r.nuskStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

function KpiCard({
  label, value, testid, asCurrency, tone,
}: {
  label: string;
  value: number;
  testid: string;
  asCurrency?: boolean;
  tone?: "error" | "success";
}) {
  const cls = tone === "error" ? "text-status-error-foreground"
            : tone === "success" ? "text-status-success-foreground"
            : "";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${cls}`} data-testid={`${testid}-value`}>
          {asCurrency ? formatCurrency(value) : value}
        </p>
      </CardContent>
    </Card>
  );
}

function BreakdownRows({
  rows, testid,
}: {
  rows: Array<{ key: string; label: string; tone?: string; href?: string; count: number; total: number }>;
  testid: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">لا بيانات.</p>;
  }
  const totalCount = rows.reduce((acc, r) => acc + r.count, 0);
  return (
    <table className="w-full text-sm mt-2" data-testid={testid}>
      <thead className="bg-muted/40">
        <tr>
          <th className="p-2 text-start">العنصر</th>
          <th className="p-2 text-end">العدد</th>
          <th className="p-2 text-end">الإجمالي</th>
          <th className="p-2 text-end">%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const pct = totalCount > 0 ? Math.round((r.count / totalCount) * 100) : 0;
          return (
            <tr key={r.key} className="border-t" data-testid={`${testid}-row-${r.key}`}>
              <td className="p-2">
                {r.href ? (
                  <Link href={r.href} className="text-blue-600 hover:underline">{r.label}</Link>
                ) : r.tone ? (
                  <span className={`text-[10px] px-2 py-0.5 rounded border ${r.tone}`}>{r.label}</span>
                ) : r.label}
              </td>
              <td className="p-2 text-end font-mono">{r.count}</td>
              <td className="p-2 text-end font-mono">{formatCurrency(r.total)}</td>
              <td className="p-2 text-end font-mono">{pct}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}