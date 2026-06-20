import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { History, TrendingUp, TrendingDown, ExternalLink, RefreshCw } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { RefreshAction } from "@/components/page-actions";
import { usePrintRows } from "@/hooks/use-print-rows";

interface FxRevaluation {
  id: number;
  currency: string;
  oldRate: number | string | null;
  newRate: number | string | null;
  revaluationDate: string;
  journalEntryId: number | null;
  totalImpact: number | string | null;
  createdBy: number | null;
  createdAt: string | null;
}

const fmtRate = (v: number | string | null) =>
  v == null ? "—" : Number(v).toFixed(6);

export default function FxRevaluationHistoryPage() {
  const [currencyFilter, setCurrencyFilter] = useState<string>("");

  const { data, isLoading, isError, refetch, isFetching } = useApiQuery<{ data: FxRevaluation[] }>(
    ["fx-revaluation-history"],
    `/finance/fx/revaluation`,
  );

  const rows = data?.data ?? [];
  const filtered = currencyFilter
    ? rows.filter((r) => r.currency === currencyFilter)
    : rows;
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;


  const currencies = Array.from(new Set(rows.map((r) => r.currency))).sort();

  const totalImpact = filtered.reduce((s, r) => s + Number(r.totalImpact ?? 0), 0);
  const gainsTotal = filtered.filter((r) => Number(r.totalImpact ?? 0) > 0)
    .reduce((s, r) => s + Number(r.totalImpact ?? 0), 0);
  const lossesTotal = filtered.filter((r) => Number(r.totalImpact ?? 0) < 0)
    .reduce((s, r) => s + Number(r.totalImpact ?? 0), 0);

  const cols: DataTableColumn<FxRevaluation>[] = [
    {
      key: "revaluationDate",
      header: "تاريخ التقييم",
      render: (r) => (
        <span className="font-mono text-xs">
          {r.revaluationDate?.slice(0, 10) ?? "—"}
        </span>
      ),
    },
    {
      key: "currency",
      header: "العملة",
      render: (r) => <Badge variant="outline" className="font-mono text-xs">{r.currency}</Badge>,
    },
    {
      key: "rateMovement",
      header: "حركة السعر",
      render: (r) => {
        const oldR = Number(r.oldRate ?? 0);
        const newR = Number(r.newRate ?? 0);
        const direction = newR > oldR ? "up" : newR < oldR ? "down" : "flat";
        return (
          <span className="font-mono text-xs inline-flex items-center gap-1">
            {fmtRate(r.oldRate)}
            <span className="text-muted-foreground">→</span>
            {fmtRate(r.newRate)}
            {direction === "up" && <TrendingUp className="h-3 w-3 text-emerald-600" />}
            {direction === "down" && <TrendingDown className="h-3 w-3 text-status-error-foreground" />}
          </span>
        );
      },
    },
    {
      key: "totalImpact",
      header: "صافي الأثر (SAR)",
      render: (r) => {
        const v = Number(r.totalImpact ?? 0);
        if (v === 0) return <span className="text-muted-foreground italic">صفر</span>;
        return (
          <span className={`font-mono font-semibold ${v > 0 ? "text-emerald-700" : "text-status-error-foreground"}`}>
            {v > 0 ? "+" : ""}{formatCurrency(v)}
          </span>
        );
      },
    },
    {
      key: "journalEntryId",
      header: "قيد الـ JE",
      render: (r) =>
        r.journalEntryId ? (
          <Link href={`/finance/journal`} className="text-status-info-foreground hover:underline inline-flex items-center gap-1">
            <span className="font-mono text-xs">#{r.journalEntryId}</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <span className="text-muted-foreground italic text-xs">بدون</span>
        ),
    },
    {
      key: "createdAt",
      header: "تاريخ التسجيل",
      render: (r) =>
        r.createdAt ? (
          <span className="text-xs text-muted-foreground">
            {new Date(r.createdAt).toLocaleString("ar-SA")}
          </span>
        ) : (
          <span className="text-muted-foreground italic">—</span>
        ),
    },
  ];

  return (
    <PageShell
      title="سجل إعادة تقييم العملات"
      subtitle="سجل إعادة تقييم العملات — كل قيد إعادة تقييم أُنشئ شهرياً، بأثره على صافي الربح/الخسارة من تذبذب أسعار الصرف"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/fx-revaluation", label: "إعادة التقييم" },
        { label: "السجل" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/finance/fx-revaluation">
              <RefreshCw className="h-4 w-4 me-1" /> تقييم جديد
            </Link></Button>
          <PrintButton
            entityType="report_finance_fx_revaluation_history"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "سجل إعادة تقييم العملات", total: printRows.length },
              items: printRows.map((r) => ({
                "التاريخ": r.revaluationDate?.slice(0, 10) ?? "—",
                "العملة": r.currency,
                "السعر القديم": fmtRate(r.oldRate),
                "السعر الجديد": fmtRate(r.newRate),
                "صافي الأثر (SAR)": Number(r.totalImpact ?? 0),
                "قيد JE": r.journalEntryId ?? "—",
              })),
            })}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <History className="h-4 w-4" /> ليش هذي الصفحة؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            كل ما تشغّل إعادة تقييم العملات في فترة، يُسَجَّل في
            <code className="bg-muted px-1 rounded mx-1">fx_revaluations</code> صف لكل عملة مع السعر القديم
            والسعر الجديد وقيد الـ JE المُرَحَّل. هذي الصفحة تعطيك خلاصة تاريخية للأثر
            على الأرباح/الخسائر من تذبذب أسعار الصرف عبر الفترات — مفيد للمراجع الخارجي
            وكذلك للتنبؤ بأثر فترة جديدة.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي قيود التقييم</p>
            <p className="text-lg font-bold font-mono">{formatNumber(filtered.length)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" /> أرباح تراكمية
            </p>
            <p className="text-lg font-bold font-mono text-emerald-700">
              +{formatCurrency(gainsTotal)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-status-error-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingDown className="h-3 w-3" /> خسائر تراكمية
            </p>
            <p className="text-lg font-bold font-mono text-status-error-foreground">
              {formatCurrency(lossesTotal)}
            </p>
          </CardContent>
        </Card>
        <Card className={totalImpact >= 0 ? "border-emerald-400" : "border-red-400"}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">صافي الأثر</p>
            <p className={`text-lg font-bold font-mono ${totalImpact >= 0 ? "text-emerald-700" : "text-status-error-foreground"}`}>
              {totalImpact > 0 ? "+" : ""}{formatCurrency(totalImpact)}
            </p>
          </CardContent>
        </Card>
      </div>

      {currencies.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-muted-foreground">العملة:</span>
          <Badge
            variant={currencyFilter === "" ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setCurrencyFilter("")}
          >
            الكل ({rows.length})
          </Badge>
          {currencies.map((c) => {
            const count = rows.filter((r) => r.currency === c).length;
            return (
              <Badge
                key={c}
                variant={currencyFilter === c ? "default" : "outline"}
                className="cursor-pointer text-xs font-mono"
                onClick={() => setCurrencyFilter(c)}
              >
                {c} ({count})
              </Badge>
            );
          })}
          <RefreshAction onRefresh={() => refetch()} disabled={isFetching} />
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            القيود {currencyFilter && `· ${currencyFilter}`} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols}
            onSortedDataChange={setPrintRows}
            data={filtered}
            pageSize={30}
            emptyMessage={
              currencyFilter
                ? `لا توجد قيود لإعادة تقييم ${currencyFilter}`
                : "لم تُسَجَّل إعادة تقييم بعد — افتح /finance/fx-revaluation وشغّل تقييماً لفترة"
            }
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
