import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { exportRowsToCsv } from "@/lib/unified-export";
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
import { Calendar, TrendingUp, TrendingDown, Download } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

// محفظة مواسم العمرة — لوحة CFO تجاوب «أي مواسم تكسب وأيها تخسر». مرافقة
// لـ /finance/umrah-group-portfolio (#1495) لكن على مستوى الموسم. الفرق:
// invoice header يحمل seasonId مباشرة (لا حاجة JOIN عبر items مثل
// الـ group portfolio).

interface SeasonRow {
  id: number;
  title: string;
  status: string;
  hijriYear: string | null;
  startDate: string | null;
  endDate: string | null;
  pilgrimsCount: number;
  groupsCount: number;
  revenue: string | number;
  paid: string | number;
  cost: string | number;
  margin: string | number;
}

interface PortfolioResp {
  data: SeasonRow[];
  total: number;
  totals: { revenue: number; cost: number; paid: number; margin: number };
}

const STATUS_LABELS: Record<string, string> = {
  upcoming: "قادم",
  active: "نشط",
  open: "مفتوح",
  closed: "مغلق",
  completed: "مكتمل",
  cancelled: "ملغى",
};

export default function UmrahSeasonPortfolioDashboard() {
  const [statusFilter, setStatusFilter] = useState("all");

  const qs = statusFilter && statusFilter !== "all" ? `?status=${statusFilter}` : "";
  const { data, isLoading, isError, refetch } = useApiQuery<PortfolioResp>(
    ["umrah-season-portfolio", statusFilter],
    `/umrah/reports/season-portfolio${qs}`,
  );

  const rows = data?.data ?? [];
  const totals = data?.totals ?? { revenue: 0, cost: 0, paid: 0, margin: 0 };

  const { best, worst, winCount, lossCount } = useMemo(() => {
    if (rows.length === 0) return { best: null, worst: null, winCount: 0, lossCount: 0 };
    const sorted = [...rows].sort((a, b) => Number(b.margin) - Number(a.margin));
    const wins = sorted.filter((r) => Number(r.margin) > 0).length;
    const losses = sorted.filter((r) => Number(r.margin) < 0).length;
    return { best: sorted[0], worst: sorted[sorted.length - 1], winCount: wins, lossCount: losses };
  }, [rows]);

  // GAP_MATRIX item #7 — uses the unified export helper for audit + letterhead.
  const exportCsv = () => {
    const pct = (m: number, r: number) => r > 0 ? ((m / r) * 100).toFixed(1) : "0";
    void exportRowsToCsv({
      entityType: "report_umrah_season_portfolio",
      title: "محفظة مواسم العمرة",
      rows: rows as unknown as Record<string, unknown>[],
      columns: [
        { key: "id",             label: "id" },
        { key: "title",          label: "title" },
        { key: "status",         label: "status" },
        { key: "hijriYear",      label: "hijriYear" },
        { key: "startDate",      label: "startDate" },
        { key: "endDate",        label: "endDate" },
        { key: "pilgrimsCount",  label: "pilgrimsCount" },
        { key: "groupsCount",    label: "groupsCount" },
        { key: "revenue",        label: "revenue" },
        { key: "paid",           label: "paid" },
        { key: "cost",           label: "cost" },
        { key: "margin",         label: "margin" },
        { key: "marginPct",      label: "marginPct",
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
      label: "إجمالي التكاليف",
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
      icon: Calendar,
      tone: "text-status-info-foreground bg-status-info-surface",
    },
  ];

  return (
    <PageShell
      title="محفظة مواسم العمرة"
      subtitle="ربحية كل موسم — إيرادات، تكاليف، الهامش"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "محفظة مواسم العمرة" },
      ]}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="gap-1"
            data-testid="season-portfolio-export-csv"
          >
            <Download className="h-3 w-3" /> تصدير CSV
          </Button>
          <PrintButton
            entityType="report_umrah_season_portfolio"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: "محفظة مواسم العمرة", total: rows.length },
              items: rows.map((r) => ({
                "الموسم": r.title,
                "السنة الهجرية": r.hijriYear || "—",
                "البداية": r.startDate || "—",
                "النهاية": r.endDate || "—",
                "عدد المعتمرين": r.pilgrimsCount,
                "عدد المجموعات": r.groupsCount,
                "الإيراد": Number(r.revenue || 0),
                "المدفوع": Number(r.paid || 0),
                "التكلفة": Number(r.cost || 0),
                "الهامش": Number(r.margin || 0),
                "الحالة": STATUS_LABELS[r.status] || r.status,
              })),
            }}
          />
        </>
      }
    >
      <FinanceTabsNav />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الحالة</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]" data-testid="season-portfolio-filter-status">
                <SelectValue placeholder="كل المواسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواسم</SelectItem>
                <SelectItem value="open">مفتوحة فقط</SelectItem>
                <SelectItem value="active">نشطة فقط</SelectItem>
                <SelectItem value="closed">مغلقة فقط</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mr-auto text-sm text-muted-foreground">
            عدد المواسم: <span className="font-bold" data-testid="season-portfolio-total-count">{rows.length}</span>
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
              <p className="text-xl font-bold mt-1" data-testid={`season-portfolio-kpi-${k.label}`}>
                {k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {best && worst && (
        <div className="grid md:grid-cols-2 gap-3">
          <Card className="border-status-success-surface" data-testid="season-portfolio-best-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-status-success-foreground" />
                أنجح موسم
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/umrah/seasons/${best.id}`} className="font-semibold text-blue-600 hover:underline">
                {best.title}
              </Link>
              <p className="text-2xl font-bold text-status-success-foreground mt-2">
                {formatCurrency(Number(best.margin))}
              </p>
              <p className="text-xs text-muted-foreground">
                إيراد {formatCurrency(Number(best.revenue))} — تكلفة {formatCurrency(Number(best.cost))}
              </p>
            </CardContent>
          </Card>

          <Card className={Number(worst.margin) < 0 ? "border-status-error-surface" : ""} data-testid="season-portfolio-worst-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-status-error-foreground" />
                أقل ربحاً
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/umrah/seasons/${worst.id}`} className="font-semibold text-blue-600 hover:underline">
                {worst.title}
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
          {rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm" data-testid="season-portfolio-empty">
              لا توجد مواسم ضمن الفلتر الحالي.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="season-portfolio-table">
                <thead>
                  <tr className="text-right text-muted-foreground border-b bg-surface-subtle">
                    <th className="p-2 font-medium">الموسم</th>
                    <th className="p-2 font-medium">السنة</th>
                    <th className="p-2 font-medium">الحالة</th>
                    <th className="p-2 font-medium">معتمرون</th>
                    <th className="p-2 font-medium">مجموعات</th>
                    <th className="p-2 font-medium">الإيرادات</th>
                    <th className="p-2 font-medium">التكلفة</th>
                    <th className="p-2 font-medium">الهامش</th>
                    <th className="p-2 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const margin = Number(r.margin);
                    const revenue = Number(r.revenue);
                    const pct = revenue > 0 ? (margin / revenue) * 100 : 0;
                    return (
                      <tr
                        key={r.id}
                        className="border-b last:border-b-0 hover:bg-muted/30"
                        data-testid={`season-portfolio-row-${r.id}`}
                      >
                        <td className="p-2">
                          <Link href={`/umrah/seasons/${r.id}`} className="text-blue-600 hover:underline">
                            {r.title}
                          </Link>
                          {r.startDate && (
                            <p className="text-[10px] text-muted-foreground">
                              {formatDateAr(r.startDate)} → {r.endDate ? formatDateAr(r.endDate) : "—"}
                            </p>
                          )}
                        </td>
                        <td className="p-2 text-xs">{r.hijriYear || "—"}</td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[10px]">
                            {STATUS_LABELS[r.status] || r.status}
                          </Badge>
                        </td>
                        <td className="p-2">{r.pilgrimsCount}</td>
                        <td className="p-2">{r.groupsCount}</td>
                        <td className="p-2 font-semibold">{formatCurrency(Number(r.revenue))}</td>
                        <td className="p-2">{formatCurrency(Number(r.cost))}</td>
                        <td
                          className={`p-2 font-bold ${margin < 0 ? "text-status-error-foreground" : "text-status-success-foreground"}`}
                          data-testid={`season-portfolio-margin-${r.id}`}
                        >
                          {formatCurrency(margin)}
                        </td>
                        <td className="p-2 text-xs">
                          {revenue > 0 ? `${pct.toFixed(1)}%` : "—"}
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
