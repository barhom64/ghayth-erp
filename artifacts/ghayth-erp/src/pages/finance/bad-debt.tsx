import { useState } from "react";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";
import { AlertTriangle, Calculator, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { BadDebtWriteOffCandidates } from "@/components/finance/bad-debt-writeoff-candidates";
import { PrintButton } from "@/components/shared/print-button";
interface PreviewResponse {
  asOf: string;
  rates: { current: number; d30: number; d60: number; d90: number; d90plus: number };
  buckets: { current: number; d30: number; d60: number; d90: number; d90plus: number };
  provision: { current: number; d30: number; d60: number; d90: number; d90plus: number };
  totalProvision: number;
  invoiceCount: number;
}

const DEFAULT_RATES = {
  current: 0,
  d30: 0.05,
  d60: 0.25,
  d90: 0.5,
  d90plus: 0.75,
};

export default function BadDebtPage() {
  const { toast } = useToast();
  const [asOf, setAsOf] = useState(todayLocal());
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [notes, setNotes] = useState("");

  const params = new URLSearchParams({
    asOf,
    rateCurrent: String(rates.current),
    rate30: String(rates.d30),
    rate60: String(rates.d60),
    rate90: String(rates.d90),
    rate90plus: String(rates.d90plus),
  }).toString();

  const { data, isLoading, isError, refetch } = useApiQuery<PreviewResponse>(
    ["bad-debt-preview", params],
    `/finance/bad-debt/preview?${params}`,
  );

  const postMut = useApiMutation("/finance/bad-debt/post", "POST", [
    ["bad-debt-preview"], ["journal"],
  ]);

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const bucketLabel: Record<keyof PreviewResponse["buckets"], string> = {
    current: "جاري (لم يستحق)",
    d30: "1-30 يوم",
    d60: "31-60 يوم",
    d90: "61-90 يوم",
    d90plus: "أكثر من 90 يوم",
  };

  const bucketTone: Record<keyof PreviewResponse["buckets"], string> = {
    current: "bg-emerald-50 text-emerald-700",
    d30: "bg-status-warning-surface text-yellow-700",
    d60: "bg-orange-50 text-orange-700",
    d90: "bg-status-error-surface text-status-error-foreground",
    d90plus: "bg-red-100 text-red-900",
  };

  const periodFromAsOf = asOf.slice(0, 7); // YYYY-MM

  // One row per aging bucket for the detail DataTable.
  const bucketKeys = ["current", "d30", "d60", "d90", "d90plus"] as const;
  const totalOpen =
    data.buckets.current + data.buckets.d30 + data.buckets.d60
    + data.buckets.d90 + data.buckets.d90plus;
  const bucketRows = bucketKeys.map((k) => ({
    key: k,
    label: bucketLabel[k],
    tone: bucketTone[k],
    balance: data.buckets[k],
    rate: rates[k],
    provision: data.provision[k],
  }));

  const handlePost = async () => {
    try {
      await postMut.mutateAsync({
        period: periodFromAsOf,
        asOf,
        rates,
        notes: notes || undefined,
      });
      toast({ title: "تم تسجيل قيد مخصص الديون المشكوك فيها بنجاح" });
      setNotes("");
      refetch();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "تعذّر التسجيل",
        description: err?.fix ?? getErrorMessage(err),
      });
    }
  };

  return (
    <PageShell
      title="مخصص الديون المشكوك في تحصيلها"
      subtitle="مخصص الديون المشكوك في تحصيلها — تقدير المبلغ المعرَّض للخسارة بناءً على عمر الذمم مع قيد شهري"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/receivables", label: "التحصيل" },
        { label: "مخصص ديون" },
      ]}
      actions={
        <PrintButton
          entityType="report_finance_bad_debt"
          entityId="list"
          size="icon"
          payload={{
            entity: { title: "مخصص الديون المشكوك في تحصيلها", total: data.invoiceCount ?? 0 },
            items: (["current", "d30", "d60", "d90", "d90plus"] as const).map((k) => ({
              "الشريحة": bucketLabel[k],
              "الرصيد المفتوح": Number(data.buckets[k] ?? 0),
              "النسبة %": (Number(rates[k] ?? 0) * 100).toFixed(1),
              "المخصص": Number(data.provision[k] ?? 0),
            })),
          }}
        />
      }
    >
      <FinanceTabsNav />
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-1">
            <Calculator className="h-4 w-4" /> كيف يعمل المخصص؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            الـ aging buckets للذمم المفتوحة تُضرب بنسبة احتمال عدم التحصيل لكل شريحة.
            القيد الناتج: <span className="font-mono">5170 — مصروف ديون مشكوك (مدين) / 1210 — مخصص ديون (دائن)</span>.
            الـ allowance حساب مقابل لـ AR — يقلل قيمة الذمم في الميزانية ولا يحذف الفواتير.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تاريخ التقدير + نسب المخصص</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">تاريخ كشف الأرصدة</Label>
            <Input
              type="date" value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="w-48" dir="ltr"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              الفترة المُستهدفة للقيد: <span className="font-mono">{periodFromAsOf}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {(["current", "d30", "d60", "d90", "d90plus"] as const).map((k) => (
              <div key={k}>
                <Label className="text-xs">{bucketLabel[k]} %</Label>
                <Input
                  type="number" min={0} max={1} step={0.01}
                  value={rates[k]}
                  onChange={(e) => setRates((r) => ({ ...r, [k]: Number(e.target.value) || 0 }))}
                  dir="ltr"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {(rates[k] * 100).toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setRates(DEFAULT_RATES)}>
            استعادة النسب الافتراضية
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">عدد الفواتير المفتوحة</p>
            <p className="text-lg font-bold font-mono">{formatNumber(data.invoiceCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الذمم المفتوحة</p>
            <p className="text-lg font-bold font-mono">
              {formatCurrency(
                data.buckets.current + data.buckets.d30 + data.buckets.d60
                + data.buckets.d90 + data.buckets.d90plus,
              )}
            </p>
          </CardContent>
        </Card>
        <Card className="border-status-error-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> إجمالي المخصص المقترح
            </p>
            <p className="text-2xl font-bold font-mono text-status-error-foreground">{formatCurrency(data.totalProvision)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تفصيل المخصص حسب شرائح العمر</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            noToolbar
            pageSize={0}
            data={bucketRows}
            rowKey={(r) => r.key}
            columns={[
              {
                key: "label", header: "الشريحة",
                render: (r) => <Badge className={`text-xs ${r.tone}`}>{r.label}</Badge>,
                exportValue: (r) => r.label,
                footer: () => "الإجمالي",
              },
              {
                key: "balance", header: "الرصيد المفتوح", align: "end", className: "font-mono",
                render: (r) => formatCurrency(r.balance),
                footer: () => formatCurrency(totalOpen),
              },
              {
                key: "rate", header: "النسبة", align: "end", className: "text-muted-foreground",
                render: (r) => `${(r.rate * 100).toFixed(1)}%`,
              },
              {
                key: "provision", header: "المخصص", align: "end",
                className: "font-mono font-bold text-status-error-foreground",
                render: (r) => formatCurrency(r.provision),
                footer: () => formatCurrency(data.totalProvision),
              },
            ] satisfies DataTableColumn<(typeof bucketRows)[number]>[]}
          />
        </CardContent>
      </Card>

      {data.totalProvision > 0 && (
        <Card className="mb-4 bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> معاينة القيد المُولّد
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs space-y-1 font-mono">
              <div className="flex justify-between">
                <span>5170 — مصروف ديون مشكوك في تحصيلها</span>
                <span className="text-orange-700">مدين {formatCurrency(data.totalProvision)}</span>
              </div>
              <div className="flex justify-between">
                <span>1210 — مخصص الديون المشكوك في تحصيلها</span>
                <span className="text-emerald-700">دائن {formatCurrency(data.totalProvision)}</span>
              </div>
              <p className="text-muted-foreground text-[10px] mt-2">
                المرجع: <span className="font-mono">BAD-DEBT-{periodFromAsOf}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تسجيل القيد</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">ملاحظات (تظهر على القيد)</Label>
            <Textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2} placeholder="اختياري — مثلاً: مراجعة ربع سنوية / موافقة المراجع"
            />
          </div>
          <div className="flex justify-end gap-2">
            <GuardedButton
              perm="finance:create"
              disabled={postMut.isPending || data.totalProvision <= 0}
              onClick={handlePost}
              rateLimitAware
            >
              {postMut.isPending ? "جاري التسجيل..." : `تسجيل قيد مخصص ${formatCurrency(data.totalProvision)}`}
            </GuardedButton>
          </div>
          <p className="text-[10px] text-muted-foreground">
            ⓘ القيد يُسجَّل مرة واحدة فقط لكل فترة (BAD-DEBT-YYYY-MM فريد).
          </p>
        </CardContent>
      </Card>

      <BadDebtWriteOffCandidates />
    </PageShell>
  );
}
