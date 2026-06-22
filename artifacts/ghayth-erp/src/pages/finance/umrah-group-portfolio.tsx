import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Layers, TrendingUp, TrendingDown, Download } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

// محفظة مجموعات العمرة — مرآة للوحات الـ portfolio الأخرى (مشاريع/مركبات/
// عقارات/وكلاء) لكن على مستوى المجموعة. تجيب على سؤال CFO: «أي مجموعات
// تكسب وأيها تخسر؟» دون الحاجة لفتح كل مجموعة على حدة.
//
// مدخل: GET /umrah/reports/group-portfolio  (تجميعات في طلب واحد — لا
// fan-out بحجم N مثل لوحة المركبات).

interface GroupRow {
  id: number;
  name: string | null;
  nuskGroupNumber: string;
  status: string;
  seasonId: number | null;
  seasonTitle: string | null;
  agentId: number | null;
  agentName: string | null;
  expectedPilgrims: number | null;
  actualPilgrims: number;
  revenue: string | number;
  paid: string | number;
  cost: string | number;
  margin: string | number;
}

interface PortfolioResp {
  data: GroupRow[];
  total: number;
  totals: { revenue: number; cost: number; paid: number; margin: number };
}

interface SeasonOpt { id: number; title: string }

const STATUS_LABELS: Record<string, string> = {
  imported: "مستوردة",
  pending: "قيد التجهيز",
  active: "نشطة",
  closed: "مغلقة",
  cancelled: "ملغاة",
};

export default function UmrahGroupPortfolioDashboard() {
  const [seasonFilter, setSeasonFilter] = useState("all");

  const qs = seasonFilter && seasonFilter !== "all" ? `?seasonId=${seasonFilter}` : "";
  const { data, isLoading, isError, refetch } = useApiQuery<PortfolioResp>(
    ["umrah-group-portfolio", seasonFilter],
    `/umrah/reports/group-portfolio${qs}`,
  );

  const { data: seasonsResp } = useApiQuery<{ data: SeasonOpt[] }>(
    ["umrah-seasons-select"],
    "/umrah/seasons",
  );

  const rows = data?.data ?? [];
  const totals = data?.totals ?? { revenue: 0, cost: 0, paid: 0, margin: 0 };
  const seasons = seasonsResp?.data ?? [];

  // أفضل وأسوأ مجموعة — للبطاقات السريعة في الأعلى. تستخرَج من الـ rows
  // (مرتبة DESC by margin من الخادم لكن نقرأها من الطرفين بدل الاعتماد
  // على ترتيب الرد — يحمي من إعادة ترتيب لاحقة في الـ UI).
  const { best, worst, winCount, lossCount } = useMemo(() => {
    if (rows.length === 0) return { best: null, worst: null, winCount: 0, lossCount: 0 };
    const sorted = [...rows].sort((a, b) => Number(b.margin) - Number(a.margin));
    const wins = sorted.filter((r) => Number(r.margin) > 0).length;
    const losses = sorted.filter((r) => Number(r.margin) < 0).length;
    return { best: sorted[0], worst: sorted[sorted.length - 1], winCount: wins, lossCount: losses };
  }, [rows]);

  // GAP_MATRIX item #7 — uses the unified export helper so the
  // download appears in /reports/print-log with audit + letterhead.
  const exportCsv = () => {
    const pct = (m: number, r: number) => r > 0 ? ((m / r) * 100).toFixed(1) : "0";
    void exportRowsToCsv({
      entityType: "report_umrah_group_portfolio",
      title: "محفظة مجموعات العمرة",
      rows: rows as unknown as Record<string, unknown>[],
      columns: [
        { key: "id",                label: "id" },
        { key: "name",              label: "name" },
        { key: "nuskGroupNumber",   label: "رقم المجموعة في نُسُك" },
        { key: "status",            label: "status" },
        { key: "seasonTitle",       label: "seasonTitle" },
        { key: "agentName",         label: "agentName" },
        { key: "expectedPilgrims",  label: "expectedPilgrims" },
        { key: "actualPilgrims",    label: "actualPilgrims" },
        { key: "revenue",           label: "revenue" },
        { key: "paid",              label: "paid" },
        { key: "cost",              label: "cost" },
        { key: "margin",            label: "margin" },
        { key: "marginPct",         label: "marginPct",
          format: (_, row: any) => pct(Number(row.margin), Number(row.revenue)) },
      ],
    }).catch((err) => console.error("[export] failed", err));
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const kpis = [
    {
      label: "إجمالي الإيرادات",
      value: formatCurrency(totals.revenue),
      icon: TrendingUp,
      tone: "text-status-success-foreground bg-status-success-surface",
    },
    {
      label: "إجمالي التكاليف (نسك)",
      value: formatCurrency(totals.cost),
      icon: TrendingDown,
      tone: "text-status-warning-foreground bg-status-warning-surface",
    },
    {
      label: "الهامش الكلي",
      value: formatCurrency(totals.margin),
      icon: totals.margin < 0 ? TrendingDown : TrendingUp,
      tone: totals.margin < 0
        ? "text-status-error-foreground bg-status-error-surface"
        : "text-status-success-foreground bg-status-success-surface",
    },
    {
      label: "رابحة / خاسرة",
      value: `${winCount} / ${lossCount}`,
      icon: Layers,
      tone: "text-status-info-foreground bg-status-info-surface",
    },
  ];

  return (
    <PageShell
      title="محفظة مجموعات العمرة"
      subtitle="ربحية كل مجموعة على حدة — إيرادات، تكاليف نسك، الهامش"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "محفظة مجموعات العمرة" },
      ]}
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="gap-1"
            data-testid="group-portfolio-export-csv"
          >
            <Download className="h-3 w-3" /> تصدير CSV
          </Button>
          <PrintButton
            entityType="report_umrah_group_portfolio"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: "محفظة مجموعات العمرة", total: rows.length },
              items: rows.map((r) => ({
                "المجموعة": r.name || r.nuskGroupNumber,
                "نسك": r.nuskGroupNumber,
                "الموسم": r.seasonTitle || "—",
                "المرشد": r.agentName || "—",
                "متوقع": r.expectedPilgrims ?? 0,
                "فعلي": r.actualPilgrims,
                "الإيراد": Number(r.revenue || 0),
                "المدفوع": Number(r.paid || 0),
                "التكلفة": Number(r.cost || 0),
                "الهامش": Number(r.margin || 0),
                "الحالة": STATUS_LABELS[r.status] || r.status,
              })),
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الموسم</label>
            <Select value={seasonFilter} onValueChange={setSeasonFilter}>
              <SelectTrigger className="w-[220px]" data-testid="group-portfolio-filter-season">
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
          <div className="mr-auto text-sm text-muted-foreground">
            عدد المجموعات: <span className="font-bold" data-testid="group-portfolio-total-count">{rows.length}</span>
          </div>
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
              <p className="text-xl font-bold mt-1" data-testid={`group-portfolio-kpi-${k.label}`}>
                {k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {best && worst && (
        <div className="grid md:grid-cols-2 gap-3">
          <Card className="border-status-success-surface" data-testid="group-portfolio-best-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-status-success-foreground" />
                أنجح مجموعة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/umrah/groups/${best.id}`} className="font-semibold text-blue-600 hover:underline">
                {best.name || best.nuskGroupNumber}
              </Link>
              <p className="text-2xl font-bold text-status-success-foreground mt-2">
                {formatCurrency(Number(best.margin))}
              </p>
              <p className="text-xs text-muted-foreground">
                إيراد {formatCurrency(Number(best.revenue))} — تكلفة {formatCurrency(Number(best.cost))}
              </p>
            </CardContent>
          </Card>

          <Card className={Number(worst.margin) < 0 ? "border-status-error-surface" : ""} data-testid="group-portfolio-worst-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-status-error-foreground" />
                أقل ربحاً
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/umrah/groups/${worst.id}`} className="font-semibold text-blue-600 hover:underline">
                {worst.name || worst.nuskGroupNumber}
              </Link>
              <p className={`text-2xl font-bold mt-2 ${Number(worst.margin) < 0 ? "text-status-error-foreground" : ""}`}>
                {formatCurrency(Number(worst.margin))}
              </p>
              <p className="text-xs text-muted-foreground">
                إيراد {formatCurrency(Number(worst.revenue))} — تكلفة {formatCurrency(Number(worst.cost))}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <DataTable
            data={rows}
            rowKey={(r) => r.id}
            noToolbar
            pageSize={0}
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            emptyMessage="لا توجد مجموعات ضمن الفلتر الحالي."
            columns={[
              {
                key: "name",
                header: "المجموعة",
                render: (r) => (
                  <>
                    <Link href={`/umrah/groups/${r.id}`} className="text-blue-600 hover:underline">
                      {r.name || r.nuskGroupNumber}
                    </Link>
                    <p className="text-[10px] text-muted-foreground font-mono">{r.nuskGroupNumber}</p>
                  </>
                ),
                exportValue: (r) => r.name || r.nuskGroupNumber,
              },
              {
                key: "seasonTitle",
                header: "الموسم",
                className: "text-xs",
                render: (r) =>
                  r.seasonId ? (
                    <Link href={`/umrah/seasons/${r.seasonId}`} className="text-blue-600 hover:underline">
                      {r.seasonTitle || `#${r.seasonId}`}
                    </Link>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "agentName",
                header: "الوكيل",
                className: "text-xs",
                render: (r) =>
                  r.agentId ? (
                    <Link href={`/umrah/agents/${r.agentId}`} className="text-blue-600 hover:underline">
                      {r.agentName || `#${r.agentId}`}
                    </Link>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "status",
                header: "الحالة",
                render: (r) => (
                  <Badge variant="outline" className="text-[10px]">
                    {STATUS_LABELS[r.status] || r.status}
                  </Badge>
                ),
                exportValue: (r) => STATUS_LABELS[r.status] || r.status,
              },
              {
                key: "actualPilgrims",
                header: "معتمرون",
                render: (r) => `${r.actualPilgrims} / ${r.expectedPilgrims ?? "?"}`,
              },
              {
                key: "revenue",
                header: "الإيرادات",
                render: (r) => <span className="font-semibold">{formatCurrency(Number(r.revenue))}</span>,
                exportValue: (r) => Number(r.revenue),
              },
              {
                key: "cost",
                header: "التكلفة",
                render: (r) => formatCurrency(Number(r.cost)),
                exportValue: (r) => Number(r.cost),
              },
              {
                key: "margin",
                header: "الهامش",
                render: (r) => {
                  const margin = Number(r.margin);
                  return (
                    <span
                      className={`font-bold ${margin < 0 ? "text-status-error-foreground" : "text-status-success-foreground"}`}
                      data-testid={`group-portfolio-margin-${r.id}`}
                    >
                      {formatCurrency(margin)}
                    </span>
                  );
                },
                exportValue: (r) => Number(r.margin),
              },
              {
                key: "marginPct",
                header: "%",
                className: "text-xs",
                sortable: false,
                render: (r) => {
                  const revenue = Number(r.revenue);
                  const pct = revenue > 0 ? (Number(r.margin) / revenue) * 100 : 0;
                  return revenue > 0 ? `${pct.toFixed(1)}%` : "—";
                },
              },
            ] satisfies DataTableColumn<GroupRow>[]}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
