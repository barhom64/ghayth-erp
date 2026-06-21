import { useState } from "react";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatCurrency, currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";
import { TrendingUp, TrendingDown, Globe, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";

interface RevalDetail {
  kind: "AR" | "AP" | string;
  refType: string;
  refId: number;
  refNumber: string;
  currency: string;
  outstandingFc: number;
  bookedRate: number;
  closingRate: number;
  bookedSar: number;
  revaluedSar: number;
  diff: number;
}

interface PreviewResponse {
  period: string;
  periodEnd: string;
  rates: Record<string, number>;
  totalGain: number;
  totalLoss: number;
  netImpact: number;
  lineCount: number;
  details: RevalDetail[];
}

export default function FxRevaluationPage() {
  const { toast } = useToast();
  const [period, setPeriod] = useState(
    () => `${currentYearRiyadh()}-${currentMonthPaddedRiyadh()}`,
  );

  const { data, isLoading, isError, refetch } = useApiQuery<PreviewResponse>(
    ["fx-revaluation-preview", period],
    `/finance/fx/revaluation/preview?period=${period}`,
  );

  const postMut = useApiMutation("/finance/fx/revaluation/post", "POST", [
    ["fx-revaluation-preview"], ["journal"],
  ]);

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const arRows = data.details.filter((d) => d.kind === "AR");
  const apRows = data.details.filter((d) => d.kind === "AP");

  const missingRates = Object.entries(data.rates).filter(([_, v]) => Number(v) === 0);

  const handlePost = async () => {
    try {
      await postMut.mutateAsync({ period });
      toast({ title: `تم ترحيل قيد إعادة التقييم للفترة ${period}` });
      refetch();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "تعذّر الترحيل",
        description: err?.fix ?? getErrorMessage(err),
      });
    }
  };

  const baseCols: DataTableColumn<RevalDetail>[] = [
    { key: "refNumber", header: "المرجع",
      render: (r) => {
        const href = r.refType === "invoice" ? `/finance/invoices/${r.refId}`
          : r.refType === "purchase_order" ? `/finance/purchase-orders/${r.refId}`
          : null;
        return href
          ? <Link href={href} className="font-mono text-xs text-status-info-foreground hover:underline">{r.refNumber}</Link>
          : <span className="font-mono text-xs">{r.refNumber}</span>;
      },
    },
    { key: "currency", header: "العملة",
      render: (r) => <Badge variant="outline" className="font-mono text-xs">{r.currency}</Badge> },
    { key: "outstandingFc", header: "الرصيد (FC)",
      render: (r) => <span className="font-mono">{Number(r.outstandingFc).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span> },
    { key: "bookedRate", header: "سعر القيد",
      render: (r) => <span className="font-mono text-xs">{Number(r.bookedRate).toFixed(4)}</span> },
    { key: "closingRate", header: "سعر الإقفال",
      render: (r) => <span className="font-mono text-xs text-status-info-foreground font-bold">{Number(r.closingRate).toFixed(4)}</span> },
    { key: "bookedSar", header: "القيد (SAR)",
      render: (r) => <span className="font-mono">{formatCurrency(Number(r.bookedSar))}</span> },
    { key: "revaluedSar", header: "بعد التقييم (SAR)",
      render: (r) => <span className="font-mono">{formatCurrency(Number(r.revaluedSar))}</span> },
    { key: "diff", header: "الفرق",
      render: (r) => {
        const v = Number(r.diff);
        return (
          <span className={`font-mono font-bold ${v >= 0 ? "text-emerald-700" : "text-status-error-foreground"}`}>
            {v >= 0 ? "+" : ""}{formatCurrency(v)}
          </span>
        );
      },
    },
  ];

  return (
    <PageShell
      title="إعادة تقييم العملات الأجنبية"
      subtitle="قيد شهري لتعديل قيمة الفواتير وأوامر الشراء المفتوحة بعملات أجنبية إلى سعر إقفال الفترة"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/fx-rates", label: "أسعار الصرف" },
        { label: "إعادة التقييم" },
      ]}
      actions={
        <PrintButton
          entityType="report_finance_fx_revaluation"
          entityId={period}
          size="icon"
          payload={{
            entity: { title: `إعادة تقييم العملات الأجنبية — ${period}`, total: data.lineCount },
            items: data.details.map((d) => ({
              "النوع": d.kind,
              "المرجع": d.refNumber || "—",
              "العملة": d.currency,
              "الرصيد (FC)": Number(d.outstandingFc || 0),
              "سعر القيد": Number(d.bookedRate || 0).toFixed(4),
              "سعر الإقفال": Number(d.closingRate || 0).toFixed(4),
              "القيد (SAR)": Number(d.bookedSar || 0),
              "بعد التقييم": Number(d.revaluedSar || 0),
              "الفرق": Number(d.diff || 0),
            })),
          }}
        />
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Globe className="h-4 w-4" /> لمَ إعادة التقييم؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            في نهاية كل شهر، الفواتير وأوامر الشراء المفتوحة بعملات أجنبية
            (USD/EUR/إلخ) لا زالت محسوبة بسعر التاريخ. إعادة التقييم تحدّث
            قيمتها بسعر إقفال الفترة وتسجل الفرق كـ "ربح/خسارة فروقات عملة"
            في قيد محاسبي يتم ترحيله مرة واحدة لكل فترة.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-end gap-3 mb-4 flex-wrap">
        <div>
          <Label className="text-xs text-muted-foreground">الفترة (YYYY-MM)</Label>
          <Input
            value={period} onChange={(e) => setPeriod(e.target.value)}
            placeholder="2026-04" dir="ltr" className="w-32"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث المعاينة</Button>
        <div className="flex-1" />
        <Button asChild variant="outline" size="sm"><Link href="/finance/fx-rates">
            <Globe className="h-3.5 w-3.5 me-1" /> أسعار الصرف
          </Link></Button>
        <GuardedButton
          perm="finance:create"
          disabled={postMut.isPending || data.lineCount === 0 || data.netImpact === 0}
          onClick={handlePost}
          rateLimitAware
        >
          {postMut.isPending ? "جاري الترحيل..." : `ترحيل قيد إعادة التقييم (${formatCurrency(data.netImpact)})`}
        </GuardedButton>
      </div>

      {missingRates.length > 0 && (
        <Card className="mb-4 border-status-warning-surface bg-status-warning-surface/30">
          <CardContent className="p-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-status-warning-foreground mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-status-warning-foreground">أسعار إقفال مفقودة لـ {missingRates.length} عملة</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                البنود بالعملات التالية تم تخطّيها لأنه لا يوجد سعر إقفال للفترة:
                {missingRates.map(([c]) => <Badge key={c} variant="outline" className="mx-1 text-xs">{c}</Badge>)}
              </p>
              <Link href="/finance/fx-rates" className="text-xs text-status-info-foreground hover:underline mt-1 inline-block">
                ← أضف الأسعار المفقودة في صفحة أسعار الصرف
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">عدد البنود</p>
            <p className="text-lg font-bold font-mono">{data.lineCount}</p>
            <p className="text-[10px] text-muted-foreground">{arRows.length} AR + {apRows.length} AP</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" /> إجمالي الأرباح
            </p>
            <p className="text-lg font-bold font-mono text-emerald-700">{formatCurrency(data.totalGain)}</p>
          </CardContent>
        </Card>
        <Card className="border-status-error-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingDown className="h-3 w-3" /> إجمالي الخسائر
            </p>
            <p className="text-lg font-bold font-mono text-status-error-foreground">{formatCurrency(data.totalLoss)}</p>
          </CardContent>
        </Card>
        <Card className={data.netImpact >= 0 ? "border-emerald-400" : "border-red-400"}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">صافي الأثر</p>
            <p className={`text-xl font-bold font-mono ${data.netImpact >= 0 ? "text-emerald-700" : "text-status-error-foreground"}`}>
              {data.netImpact >= 0 ? "+" : ""}{formatCurrency(data.netImpact)}
            </p>
          </CardContent>
        </Card>
      </div>

      {arRows.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Badge variant="outline">مدينة</Badge>
                الفواتير (ذمم مدينة)
              </span>
              <Badge>{arRows.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable columns={baseCols} data={arRows} pageSize={25} noToolbar searchPlaceholder={null} emptyMessage="—" />
          </CardContent>
        </Card>
      )}

      {apRows.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Badge variant="outline">دائنة</Badge>
                أوامر الشراء (ذمم دائنة)
              </span>
              <Badge>{apRows.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable columns={baseCols} data={apRows} pageSize={25} noToolbar searchPlaceholder={null} emptyMessage="—" />
          </CardContent>
        </Card>
      )}

      {data.lineCount === 0 && (
        <Card className="border-emerald-300 bg-emerald-50/30">
          <CardContent className="p-4 text-center text-sm">
            ✓ لا يوجد بنود مفتوحة بعملات أجنبية لهذي الفترة — لا حاجة لإعادة تقييم.
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
