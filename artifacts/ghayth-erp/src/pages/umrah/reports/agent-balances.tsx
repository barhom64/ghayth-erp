import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { exportRowsToCsv } from "@/lib/unified-export";
import { PageShell, DataTable, type DataTableColumn, AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { Wallet, TrendingUp, AlertTriangle, Users, Download } from "lucide-react";
import { formatCurrency, formatUmrahDate } from "@/lib/formatters";

// تقرير أرصدة الوكلاء المجمَّع — كل الوكلاء في صف واحد. المحاسب
// يجاوب: «لمن أرسل تنبيه؟ المتأخر بكم؟ آخر فاتورة متى؟» بدون فتح
// صفحة كل وكيل.

interface AgentBalanceRow {
  id: number;
  name: string;
  country: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  nuskAgentNumber: string | null;
  invoiceCount: number;
  totalInvoiced: string | number;
  totalPaid: string | number;
  outstanding: string | number;
  lastInvoiceAt: string | null;
  lastInvoiceRef: string | null;
  pilgrimCount: number;
}

interface BalancesResp {
  data: AgentBalanceRow[];
  total: number;
  totals: { agents: number; totalInvoiced: number; totalPaid: number; outstanding: number };
}

interface SeasonOpt { id: number; title: string }

const STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  inactive: "غير نشط",
  suspended: "موقوف",
  blocked: "محظور",
};

export default function UmrahAgentBalancesReport() {
  const [filters, setFilters] = useFilters({ status: "active" });

  const qs = useMemo(() => {
    const parts: string[] = [];
    if (filters.seasonId) parts.push(`seasonId=${filters.seasonId}`);
    if (filters.status) parts.push(`status=${filters.status}`);
    if (filters.hasOutstanding) parts.push("hasOutstanding=true");
    return parts.length ? `?${parts.join("&")}` : "";
  }, [filters]);

  const { data, isLoading, isError, refetch } = useApiQuery<BalancesResp>(
    ["umrah-agent-balances", filters.seasonId, filters.status, filters.hasOutstanding],
    `/umrah/reports/agent-balances${qs}`,
  );
  const { data: seasonsResp } = useApiQuery<{ data: SeasonOpt[] }>(
    ["umrah-seasons-select"],
    "/umrah/seasons",
  );

  const rows = data?.data ?? [];
  const totals = data?.totals ?? { agents: 0, totalInvoiced: 0, totalPaid: 0, outstanding: 0 };
  const seasons = seasonsResp?.data ?? [];

  // Client-side search filter — يطبَّق على الصفوف اللي رجعت من الـ server
  // (الـ server يقدر يعمل filter لكن الـ search box يتكلم بنص حر؛ أبسط
  // و أسرع نخليه local على الـ payload المحدود مسبقاً).
  const visibleRows = useMemo(
    () => applyFilters(rows, filters, { searchFields: ["name", "nuskAgentNumber", "country"] }),
    [rows, filters],
  );

  const exportCsv = () => {
    void exportRowsToCsv({
      entityType: "report_umrah_agent_balances",
      title: "أرصدة الوكلاء",
      rows: visibleRows as unknown as Record<string, unknown>[],
      columns: [
        { key: "id",                label: "id" },
        { key: "name",              label: "name" },
        { key: "nuskAgentNumber",   label: "رقم وكيل نُسُك" },
        { key: "country",           label: "country" },
        { key: "phone",             label: "phone" },
        { key: "status",            label: "status" },
        { key: "pilgrimCount",      label: "pilgrimCount" },
        { key: "invoiceCount",      label: "invoiceCount" },
        { key: "totalInvoiced",     label: "totalInvoiced" },
        { key: "totalPaid",         label: "totalPaid" },
        { key: "outstanding",       label: "outstanding" },
        { key: "lastInvoiceAt",     label: "lastInvoiceAt" },
        { key: "lastInvoiceRef",    label: "lastInvoiceRef" },
      ],
    }).catch((err) => console.error("[export] failed", err));
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const kpis = [
    { label: "عدد الوكلاء", value: String(totals.agents), icon: Users, tone: "text-status-info-foreground bg-status-info-surface" },
    { label: "إجمالي المُفوتر", value: formatCurrency(totals.totalInvoiced), icon: TrendingUp, tone: "text-status-success-foreground bg-status-success-surface" },
    { label: "إجمالي المُحصَّل", value: formatCurrency(totals.totalPaid), icon: Wallet, tone: "text-status-info-foreground bg-status-info-surface" },
    { label: "إجمالي المستحق", value: formatCurrency(totals.outstanding), icon: AlertTriangle, tone: totals.outstanding > 0 ? "text-status-error-foreground bg-status-error-surface" : "text-status-neutral-foreground bg-status-neutral-surface" },
  ];

  return (
    <PageShell
      title="أرصدة الوكلاء — تقرير مجمَّع"
      subtitle="كل وكلاء العمرة في شاشة واحدة مع المستحق والمحصَّل وآخر فاتورة"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "أرصدة الوكلاء" }]}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={visibleRows.length === 0}
          className="gap-1"
          data-testid="agent-balances-export-csv"
        >
          <Download className="h-3 w-3" /> تصدير CSV
        </Button>
      }
    >
      <UmrahTabsNav />

      <AdvancedFilters
        config={{
          searchPlaceholder: "اسم / رقم نسك / دولة...",
          statuses: [
            { value: "active", label: "نشط" },
            { value: "inactive", label: "غير نشط" },
            { value: "suspended", label: "موقوف" },
            { value: "blocked", label: "محظور" },
          ],
          extraFilters: [
            { key: "seasonId", label: "الموسم", options: seasons.map((s) => ({ value: String(s.id), label: s.title })) },
            { key: "hasOutstanding", label: "الرصيد", options: [{ value: "true", label: "الذين عليهم رصيد فقط" }] },
          ],
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={visibleRows.length}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className={`inline-flex h-8 w-8 items-center justify-center rounded ${k.tone}`}>
                <k.icon className="h-4 w-4" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{k.label}</p>
              <p className="text-xl font-bold mt-1" data-testid={`agent-balances-kpi-${k.label}`}>
                {k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card data-testid="agent-balances-table">
        <CardContent className="p-0">
          <DataTable
            data={visibleRows}
            rowKey={(r) => String(r.id)}
            noToolbar
            pageSize={0}
            emptyMessage="لا يوجد وكلاء ضمن الفلتر الحالي."
            columns={[
              {
                key: "name", header: "الوكيل",
                render: (r) => (
                  <div data-testid={`agent-balances-row-${r.id}`}>
                    <Link href={`/umrah/agents/${r.id}`} className="text-blue-600 hover:underline font-medium">{r.name}</Link>
                    {r.phone && <p className="text-[10px] text-muted-foreground" dir="ltr">{r.phone}</p>}
                  </div>
                ),
              },
              { key: "nuskAgentNumber", header: "رقم نسك", className: "font-mono text-[10px]", render: (r) => r.nuskAgentNumber || "—" },
              { key: "country", header: "الدولة", render: (r) => r.country || "—" },
              { key: "pilgrimCount", header: "معتمرون", align: "end" as const },
              { key: "invoiceCount", header: "فواتير", align: "end" as const },
              { key: "totalInvoiced", header: "المُفوتر", align: "end" as const, render: (r) => <span className="font-semibold">{formatCurrency(Number(r.totalInvoiced))}</span> },
              { key: "totalPaid", header: "المُحصَّل", align: "end" as const, render: (r) => <span className="text-status-success-foreground">{formatCurrency(Number(r.totalPaid))}</span> },
              {
                key: "outstanding", header: "المستحق", align: "end" as const,
                render: (r) => {
                  const outstanding = Number(r.outstanding ?? 0);
                  return <span data-testid={`agent-balances-outstanding-${r.id}`} className={`font-bold ${outstanding > 0 ? "text-status-error-foreground" : ""}`}>{formatCurrency(outstanding)}</span>;
                },
              },
              {
                key: "lastInvoiceAt", header: "آخر فاتورة",
                render: (r) => r.lastInvoiceAt ? (
                  <>
                    <span className="text-[11px]">{formatUmrahDate(r.lastInvoiceAt)}</span>
                    {r.lastInvoiceRef && <p className="text-[10px] font-mono text-muted-foreground">{r.lastInvoiceRef}</p>}
                  </>
                ) : "—",
              },
              { key: "status", header: "الحالة", render: (r) => <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[r.status] || r.status}</Badge> },
            ] satisfies DataTableColumn<AgentBalanceRow>[]}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
