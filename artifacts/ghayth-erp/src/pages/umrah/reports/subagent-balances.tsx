import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { exportRowsToCsv } from "@/lib/unified-export";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
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
import { Wallet, TrendingUp, AlertTriangle, Users, Download, Receipt } from "lucide-react";
import { formatCurrency, formatUmrahDate } from "@/lib/formatters";

// تقرير أرصدة الوكلاء الفرعيين — مكمِّل لتقرير الوكلاء. الفرق:
// • paidAmount هنا عمود حقيقي (مش status='paid' فقط)
// • payments جدول مستقل مع تواريخ الدفع
// • subAgentId هو من يدفع فعلياً
//
// يقدِّم رؤيتين:
//   - المُحصَّل على الفواتير (paidAmount)
//   - الـ payments المستقلة (قد لا تتطابق إذا لم تُربط)

interface SubAgentBalanceRow {
  id: number;
  name: string;
  nuskCode: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  isActive: boolean;
  paymentTerms: string | null;
  agentId: number | null;
  agentName: string | null;
  invoiceCount: number;
  totalInvoiced: string | number;
  totalPaidOnInvoices: string | number;
  paymentCount: number;
  totalReceived: string | number;
  outstanding: string | number;
  lastPaymentAt: string | null;
  lastPaymentRef: string | null;
  pilgrimCount: number;
}

interface BalancesResp {
  data: SubAgentBalanceRow[];
  total: number;
  totals: {
    subAgents: number;
    totalInvoiced: number;
    totalPaidOnInvoices: number;
    totalReceived: number;
    outstanding: number;
  };
}

interface SeasonOpt { id: number; title: string }

export default function UmrahSubAgentBalancesReport() {
  const [seasonFilter, setSeasonFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("true");
  const [onlyOutstanding, setOnlyOutstanding] = useState(false);
  const [search, setSearch] = useState("");

  const qs = useMemo(() => {
    const parts: string[] = [];
    if (seasonFilter !== "all") parts.push(`seasonId=${seasonFilter}`);
    if (activeFilter !== "all") parts.push(`isActive=${activeFilter}`);
    if (onlyOutstanding) parts.push("hasOutstanding=true");
    return parts.length ? `?${parts.join("&")}` : "";
  }, [seasonFilter, activeFilter, onlyOutstanding]);

  const { data, isLoading, isError, refetch } = useApiQuery<BalancesResp>(
    ["umrah-subagent-balances", seasonFilter, activeFilter, String(onlyOutstanding)],
    `/umrah/reports/subagent-balances${qs}`,
  );
  const { data: seasonsResp } = useApiQuery<{ data: SeasonOpt[] }>(
    ["umrah-seasons-select"],
    "/umrah/seasons",
  );

  const rows = data?.data ?? [];
  const totals = data?.totals ?? { subAgents: 0, totalInvoiced: 0, totalPaidOnInvoices: 0, totalReceived: 0, outstanding: 0 };
  const seasons = seasonsResp?.data ?? [];

  const visibleRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      r.name?.toLowerCase().includes(q) ||
      r.nuskCode?.toLowerCase().includes(q) ||
      r.agentName?.toLowerCase().includes(q) ||
      r.country?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const exportCsv = () => {
    void exportRowsToCsv({
      entityType: "report_umrah_subagent_balances",
      title: "أرصدة الوكلاء الفرعيين",
      rows: visibleRows as unknown as Record<string, unknown>[],
      columns: [
        { key: "id",                   label: "id" },
        { key: "name",                 label: "name" },
        { key: "nuskCode",             label: "nuskCode" },
        { key: "agentName",            label: "agentName" },
        { key: "country",              label: "country" },
        { key: "phone",                label: "phone" },
        { key: "isActive",             label: "isActive" },
        { key: "paymentTerms",         label: "paymentTerms" },
        { key: "pilgrimCount",         label: "pilgrimCount" },
        { key: "invoiceCount",         label: "invoiceCount" },
        { key: "totalInvoiced",        label: "totalInvoiced" },
        { key: "totalPaidOnInvoices",  label: "totalPaidOnInvoices" },
        { key: "totalReceived",        label: "totalReceived" },
        { key: "outstanding",          label: "outstanding" },
        { key: "lastPaymentAt",        label: "lastPaymentAt" },
        { key: "lastPaymentRef",       label: "lastPaymentRef" },
      ],
    }).catch((err) => console.error("[export] failed", err));
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const kpis = [
    {
      label: "عدد الوكلاء الفرعيين",
      value: String(totals.subAgents),
      icon: Users,
      tone: "text-status-info-foreground bg-status-info-surface",
    },
    {
      label: "إجمالي المُفوتر",
      value: formatCurrency(totals.totalInvoiced),
      icon: TrendingUp,
      tone: "text-status-success-foreground bg-status-success-surface",
    },
    {
      label: "إجمالي المُحصَّل (دفعات)",
      value: formatCurrency(totals.totalReceived),
      icon: Wallet,
      tone: "text-status-info-foreground bg-status-info-surface",
    },
    {
      label: "الرصيد المستحق",
      value: formatCurrency(totals.outstanding),
      icon: AlertTriangle,
      tone: totals.outstanding > 0
        ? "text-status-error-foreground bg-status-error-surface"
        : "text-status-neutral-foreground bg-status-neutral-surface",
    },
  ];

  return (
    <PageShell
      title="أرصدة الوكلاء الفرعيين — تقرير مجمَّع"
      subtitle="كل الوكلاء الفرعيين مع المُفوتر / المُحصَّل / المستحق + سجل الدفعات"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "أرصدة الوكلاء الفرعيين" }]}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          disabled={visibleRows.length === 0}
          className="gap-1"
          data-testid="subagent-balances-export-csv"
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
              <SelectTrigger className="w-[200px]" data-testid="subagent-balances-filter-season">
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
            <label className="text-xs text-muted-foreground">الحالة</label>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-[160px]" data-testid="subagent-balances-filter-active">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="true">نشط فقط</SelectItem>
                <SelectItem value="false">غير نشط فقط</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">بحث</label>
            <Input
              type="text"
              placeholder="اسم / رمز نسك / وكيل / دولة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[220px]"
              data-testid="subagent-balances-search"
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={onlyOutstanding}
              onCheckedChange={(v) => setOnlyOutstanding(!!v)}
              data-testid="subagent-balances-filter-outstanding"
            />
            الذين عليهم رصيد فقط
          </label>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className={`inline-flex h-8 w-8 items-center justify-center rounded ${k.tone}`}>
                <k.icon className="h-4 w-4" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{k.label}</p>
              <p className="text-xl font-bold mt-1" data-testid={`subagent-balances-kpi-${k.label}`}>
                {k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card data-testid="subagent-balances-table">
        <CardContent className="p-0">
          <DataTable<SubAgentBalanceRow>
            data={visibleRows}
            rowKey={(r) => String(r.id)}
            noToolbar
            pageSize={0}
            emptyMessage="لا يوجد وكلاء فرعيون ضمن الفلتر الحالي."
            columns={[
              {
                key: "name", header: "الوكيل الفرعي",
                render: (r) => (
                  <div data-testid={`subagent-balances-row-${r.id}`}>
                    <Link href={`/umrah/sub-agents/${r.id}`} className="text-blue-600 hover:underline font-medium">{r.name}</Link>
                    {!r.isActive && <Badge variant="outline" className="mr-1 text-[9px]">غير نشط</Badge>}
                    {r.phone && <p className="text-[10px] text-muted-foreground" dir="ltr">{r.phone}</p>}
                  </div>
                ),
              },
              { key: "nuskCode", header: "رمز نسك", className: "font-mono text-[10px]", render: (r) => r.nuskCode || "—" },
              { key: "agentId", header: "الوكيل الرئيسي", render: (r) => r.agentId ? <Link href={`/umrah/agents/${r.agentId}`} className="text-blue-600 hover:underline text-[11px]">{r.agentName || `#${r.agentId}`}</Link> : "—" },
              { key: "paymentTerms", header: "شروط الدفع", render: (r) => <Badge variant="outline" className="text-[10px]">{r.paymentTerms === "prepaid" ? "مقدم" : r.paymentTerms === "postpaid" ? "آجل" : (r.paymentTerms || "—")}</Badge> },
              { key: "pilgrimCount", header: "معتمرون", align: "end" as const },
              { key: "invoiceCount", header: "فواتير", align: "end" as const },
              { key: "totalInvoiced", header: "المُفوتر", align: "end" as const, render: (r) => <span className="font-semibold">{formatCurrency(Number(r.totalInvoiced))}</span> },
              {
                key: "totalReceived", header: "المُحصَّل", align: "end" as const,
                render: (r) => (
                  <span className="text-status-success-foreground">
                    <div className="flex items-center gap-1"><Wallet className="h-3 w-3" />{formatCurrency(Number(r.totalReceived))}</div>
                    {Number(r.paymentCount ?? 0) > 0 && <p className="text-[10px] text-muted-foreground">{r.paymentCount} دفعة · فاتورة: {formatCurrency(Number(r.totalPaidOnInvoices))}</p>}
                  </span>
                ),
              },
              {
                key: "outstanding", header: "المستحق", align: "end" as const,
                render: (r) => {
                  const outstanding = Number(r.outstanding ?? 0);
                  return <span data-testid={`subagent-balances-outstanding-${r.id}`} className={`font-bold ${outstanding > 0 ? "text-status-error-foreground" : ""}`}>{formatCurrency(outstanding)}</span>;
                },
              },
              {
                key: "lastPaymentAt", header: "آخر دفعة",
                render: (r) => r.lastPaymentAt ? (
                  <>
                    <div className="flex items-center gap-1 text-[11px]"><Receipt className="h-3 w-3" />{formatUmrahDate(r.lastPaymentAt)}</div>
                    {r.lastPaymentRef && <p className="text-[10px] font-mono text-muted-foreground">{r.lastPaymentRef}</p>}
                  </>
                ) : <span className="text-muted-foreground text-[11px]">لا توجد دفعات</span>,
              },
            ] satisfies DataTableColumn<SubAgentBalanceRow>[]}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
