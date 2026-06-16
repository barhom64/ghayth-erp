/**
 * Violations Summary Report — §11 partial → full (#1870)
 *
 * The existing /umrah/violations page is the list/edit screen for
 * one-by-one work. This page is the REPORT: rollups + KPI tiles +
 * three group-by breakdowns (status / type / month) + a list of
 * the 100 most recent rows for drill-through.
 *
 * Filters: date range (detectedAt), season, agent. Each updates
 * the KPI tiles + every breakdown via a single endpoint call.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
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
import { AlertTriangle } from "lucide-react";

interface SummaryResp {
  kpis: {
    total: number;
    openCount: number;
    closedCount: number;
    totalPenalty: number;
    pendingPenalty: number;
  };
  byStatus: Array<{ status: string; count: number; total: number }>;
  byType:   Array<{ type: string; count: number; total: number }>;
  byMonth:  Array<{ month: string; count: number; total: number }>;
  recent: Array<{
    id: number;
    type: string;
    status: string;
    penaltyAmount: string | number;
    detectedAt: string;
    description: string | null;
    mutamerId: number | null;
    mutamerName: string | null;
    agentId: number | null;
    agentName: string | null;
  }>;
}

interface SeasonOpt { id: number; title: string }
interface AgentOpt { id: number; name: string }

const STATUS_LABEL_AR: Record<string, string> = {
  detected: "مرصودة",
  open:     "مفتوحة",
  invoiced: "مفوترة",
  paid:     "مدفوعة",
  disputed: "محل اعتراض",
  closed:   "مغلقة",
};

const STATUS_TONE: Record<string, string> = {
  detected: "bg-amber-100 text-amber-700 border-amber-300",
  open:     "bg-rose-100 text-rose-700 border-rose-300",
  invoiced: "bg-sky-100 text-sky-700 border-sky-300",
  paid:     "bg-emerald-100 text-emerald-700 border-emerald-300",
  disputed: "bg-violet-100 text-violet-700 border-violet-300",
  closed:   "bg-slate-100 text-slate-700 border-slate-300",
};

export default function ViolationsSummaryReport() {
  const [seasonFilter, setSeasonFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const qsParts: string[] = [];
  if (seasonFilter !== "all") qsParts.push(`seasonId=${seasonFilter}`);
  if (agentFilter !== "all")  qsParts.push(`agentId=${agentFilter}`);
  if (fromDate)               qsParts.push(`from=${fromDate}`);
  if (toDate)                 qsParts.push(`to=${toDate}`);
  const qs = qsParts.length ? `?${qsParts.join("&")}` : "";

  const { data, isLoading, isError, refetch } = useApiQuery<SummaryResp>(
    ["umrah-violations-summary", seasonFilter, agentFilter, fromDate, toDate],
    `/umrah/reports/violations-summary${qs}`,
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
      title="تقرير المخالفات (ملخص)"
      subtitle="مؤشرات إجمالية + تفصيل حسب الحالة / النوع / الشهر + آخر 100 مخالفة"
      breadcrumbs={[
        { href: "/umrah", label: "إدارة العمرة" },
        { href: "/umrah/reports", label: "التقارير" },
        { label: "ملخص المخالفات" },
      ]}
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3" data-testid="violations-filters">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">الموسم</Label>
            <Select value={seasonFilter} onValueChange={setSeasonFilter}>
              <SelectTrigger data-testid="violations-filter-season"><SelectValue placeholder="كل المواسم" /></SelectTrigger>
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
              <SelectTrigger data-testid="violations-filter-agent"><SelectValue placeholder="كل الوكلاء" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الوكلاء</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">من تاريخ</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} data-testid="violations-filter-from" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">إلى تاريخ</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} data-testid="violations-filter-to" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="إجمالي المخالفات" value={k?.total ?? 0} testid="violations-kpi-total" />
        <KpiCard label="مفتوحة" value={k?.openCount ?? 0} testid="violations-kpi-open" tone="error" />
        <KpiCard label="مغلقة / مدفوعة" value={k?.closedCount ?? 0} testid="violations-kpi-closed" tone="success" />
        <KpiCard
          label="إجمالي الغرامات"
          value={k?.totalPenalty ?? 0}
          testid="violations-kpi-total-penalty"
          asCurrency
        />
        <KpiCard
          label="غرامات غير مسددة"
          value={k?.pendingPenalty ?? 0}
          testid="violations-kpi-pending-penalty"
          tone="error"
          asCurrency
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <Tabs defaultValue="status">
            <TabsList data-testid="violations-breakdown-tabs">
              <TabsTrigger value="status" data-testid="violations-tab-status">حسب الحالة</TabsTrigger>
              <TabsTrigger value="type"   data-testid="violations-tab-type">حسب النوع</TabsTrigger>
              <TabsTrigger value="month"  data-testid="violations-tab-month">حسب الشهر</TabsTrigger>
            </TabsList>

            <TabsContent value="status">
              <BreakdownTable
                rows={data?.byStatus ?? []}
                keyField="status"
                labels={STATUS_LABEL_AR}
                tones={STATUS_TONE}
                testid="violations-breakdown-status"
              />
            </TabsContent>
            <TabsContent value="type">
              <BreakdownTable
                rows={data?.byType ?? []}
                keyField="type"
                testid="violations-breakdown-type"
              />
            </TabsContent>
            <TabsContent value="month">
              <BreakdownTable
                rows={data?.byMonth ?? []}
                keyField="month"
                testid="violations-breakdown-month"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="p-4 border-b">
            <p className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              آخر 100 مخالفة
            </p>
          </div>
          <div data-testid="violations-recent-empty">
          <DataTable<SummaryResp["recent"][number]>
            data={data?.recent ?? []}
            rowKey={(r) => String(r.id)}
            noToolbar
            pageSize={0}
            emptyMessage="لا مخالفات تطابق الفلاتر."
            columns={[
              { key: "id", header: "#", render: (r) => <Link href={`/umrah/violations/${r.id}`} className="text-blue-600 hover:underline font-mono text-xs">#{r.id}</Link> },
              { key: "detectedAt", header: "التاريخ", render: (r) => <span className="text-xs">{r.detectedAt?.slice(0, 10)}</span> },
              { key: "type", header: "النوع", className: "text-xs" },
              { key: "status", header: "الحالة", render: (r) => { const tone = STATUS_TONE[r.status] ?? "bg-slate-100 text-slate-700 border-slate-300"; return <span className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap ${tone}`}>{STATUS_LABEL_AR[r.status] ?? r.status}</span>; } },
              { key: "mutamerId", header: "المعتمر", render: (r) => r.mutamerId ? <Link href={`/umrah/pilgrims/${r.mutamerId}`} className="text-blue-600 hover:underline text-xs">{r.mutamerName ?? `#${r.mutamerId}`}</Link> : "—" },
              { key: "agentId", header: "الوكيل", render: (r) => r.agentId ? <Link href={`/umrah/agents/${r.agentId}`} className="text-blue-600 hover:underline text-xs">{r.agentName ?? `#${r.agentId}`}</Link> : "—" },
              { key: "penaltyAmount", header: "الغرامة", align: "end" as const, render: (r) => <span className="font-mono">{formatCurrency(Number(r.penaltyAmount) || 0)}</span> },
            ] satisfies DataTableColumn<SummaryResp["recent"][number]>[]}
          />
          </div>
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

function BreakdownTable<T extends { count: number; total: number; [k: string]: any }>({
  rows, keyField, labels, tones, testid,
}: {
  rows: T[];
  keyField: keyof T;
  labels?: Record<string, string>;
  tones?: Record<string, string>;
  testid: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">لا بيانات.</p>;
  }
  const totalCount = rows.reduce((acc, r) => acc + r.count, 0);
  const augRows = rows.map((r) => {
    const key = String(r[keyField]);
    return { ...r, _pct: totalCount > 0 ? Math.round((r.count / totalCount) * 100) : 0, _label: labels?.[key] ?? key, _tone: tones?.[key] };
  });
  return (
    <DataTable<typeof augRows[number]>
      data={augRows}
      rowKey={(r) => String(r[keyField as string])}
      noToolbar
      pageSize={0}
      emptyMessage="لا بيانات."
      columns={[
        { key: "_label" as const, header: String(keyField), render: (r) => r._tone ? <span className={`text-[10px] px-2 py-0.5 rounded border ${r._tone}`}>{r._label}</span> : r._label },
        { key: "count" as const, header: "العدد", align: "end" as const, className: "font-mono" },
        { key: "total" as const, header: "إجمالي الغرامة", align: "end" as const, render: (r) => <span className="font-mono">{formatCurrency(Number(r.total) || 0)}</span> },
        { key: "_pct" as const, header: "%", align: "end" as const, render: (r) => <span className="font-mono">{r._pct}%</span> },
      ]}
    />
  );
}