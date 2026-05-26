import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  FormShell,
  FormTextField,
  FormSelectField,
  FormGrid,
} from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, ArrowLeftRight, TrendingUp, AlertCircle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { useToast } from "@/hooks/use-toast";

/**
 * Finance / FX — exchange rates + period revaluation.
 *
 * Phase D / Finance gap #3. Closes 5 unused-backend endpoints:
 *   GET    /finance/fx/rates
 *   POST   /finance/fx/rates
 *   GET    /finance/fx/revaluation/preview
 *   POST   /finance/fx/revaluation/post
 *   GET    /finance/fx/revaluation
 *
 * Why this matters: every multi-currency company in the system uses
 * SAR as the reporting currency but transacts in USD, EUR, AED, …
 * The fx_rates table is fed by a daily cron (lib/fx/jobs.ts) but
 * staff also need to override or seed missing rates manually — and
 * at period close, FX-denominated accounts must be revalued to the
 * spot rate or unrealized gains/losses stay stuck in last month's
 * snapshot. Both flows shipped on the server long ago without UI.
 *
 * Layout:
 *   Tab 1 — Rates: list with filters, create/update dialog
 *   Tab 2 — Revaluation: period picker, preview table, post button,
 *           history
 */

interface FxRate {
  id: number;
  fromCurrency: string;
  toCurrency: string;
  rate: number | string;
  rateDate: string;
  effectiveDate: string;
  source: string;
}

interface RevaluationPreviewRow {
  accountId: number;
  accountCode: string;
  accountName: string;
  currency: string;
  balance: number | string;
  oldRate: number | string;
  newRate: number | string;
  fxGainLoss: number | string;
}

interface RevaluationPreview {
  period: string;
  rows: RevaluationPreviewRow[];
  totalGainLoss: number | string;
  spotRateDate: string;
}

interface RevaluationHistoryRow {
  id: number;
  period: string;
  totalGainLoss: number | string;
  postedAt: string;
  postedByName: string | null;
  journalEntryId: number | null;
}

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD — دولار أمريكي" },
  { value: "EUR", label: "EUR — يورو" },
  { value: "AED", label: "AED — درهم إماراتي" },
  { value: "GBP", label: "GBP — جنيه إسترليني" },
  { value: "KWD", label: "KWD — دينار كويتي" },
  { value: "QAR", label: "QAR — ريال قطري" },
  { value: "BHD", label: "BHD — دينار بحريني" },
  { value: "EGP", label: "EGP — جنيه مصري" },
];

const SOURCE_OPTIONS = [
  { value: "spot", label: "سعر فوري (Spot)" },
  { value: "central_bank", label: "البنك المركزي" },
  { value: "manual", label: "تعديل يدوي" },
];

const SOURCE_LABEL: Record<string, string> = Object.fromEntries(
  SOURCE_OPTIONS.map((s) => [s.value, s.label]),
);

const rateSchema = z.object({
  rateDate: z.string().min(1, "التاريخ مطلوب"),
  fromCurrency: z.string().length(3, "رمز العملة ثلاثة أحرف"),
  toCurrency: z.string().length(3),
  rate: z.coerce.number().positive("السعر يجب أن يكون موجباً"),
  type: z.enum(["spot", "central_bank", "manual"]),
});
type RateForm = z.infer<typeof rateSchema>;

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function FxPage() {
  return (
    <PageShell
      title="إدارة العملات الأجنبية"
      subtitle="أسعار الصرف وإعادة تقييم الأرصدة في نهاية الفترة"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "العملات الأجنبية" }]}
    >
      <FinanceTabsNav />
      <Tabs defaultValue="rates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rates" className="gap-1.5">
            <ArrowLeftRight className="h-4 w-4" /> أسعار الصرف
          </TabsTrigger>
          <TabsTrigger value="revaluation" className="gap-1.5">
            <TrendingUp className="h-4 w-4" /> إعادة التقييم
          </TabsTrigger>
        </TabsList>
        <TabsContent value="rates">
          <RatesTab />
        </TabsContent>
        <TabsContent value="revaluation">
          <RevaluationTab />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function RatesTab() {
  const { data, isLoading, error, refetch } = useApiQuery<{ data: FxRate[] }>(
    ["finance-fx-rates"],
    "/finance/fx/rates",
  );
  const rates: FxRate[] = data?.data ?? [];
  const [showForm, setShowForm] = useState(false);

  const columns: DataTableColumn<FxRate>[] = [
    {
      key: "effectiveDate",
      header: "تاريخ السريان",
      render: (r) => <span className="text-sm">{formatDateAr(r.effectiveDate)}</span>,
    },
    {
      key: "fromCurrency",
      header: "من",
      render: (r) => <Badge variant="outline" className="font-mono">{r.fromCurrency}</Badge>,
    },
    {
      key: "toCurrency",
      header: "إلى",
      render: (r) => <Badge variant="outline" className="font-mono">{r.toCurrency}</Badge>,
    },
    {
      key: "rate",
      header: "السعر",
      render: (r) => (
        <span className="font-mono font-semibold">{Number(r.rate).toFixed(4)}</span>
      ),
    },
    {
      key: "source",
      header: "المصدر",
      render: (r) => (
        <Badge variant="secondary" className="text-xs">
          {SOURCE_LABEL[r.source] ?? r.source}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          الأسعار محدّثة تلقائياً من البنك المركزي عبر مهمة يومية. أضف سعراً يدوياً عند الحاجة.
        </p>
        <GuardedButton
          perm="finance.algorithms:create"
          onClick={() => setShowForm(true)}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> إضافة سعر
        </GuardedButton>
      </div>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        <DataTable
          columns={columns}
          data={rates}
          rowKey={(r) => r.id}
          emptyMessage="لا توجد أسعار صرف مسجلة"
        />
      </PageStateWrapper>

      <RateUpsertDialog
        open={showForm}
        onOpenChange={setShowForm}
        onSaved={() => {
          setShowForm(false);
          refetch();
        }}
      />
    </div>
  );
}

function RateUpsertDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const upsertMut = useApiMutation<{ data: FxRate }, RateForm>(
    "/finance/fx/rates",
    "POST",
    [["finance-fx-rates"]],
    { successMessage: "تم حفظ السعر" },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" /> إضافة/تحديث سعر صرف
          </DialogTitle>
        </DialogHeader>
        <FormShell
          key={open ? "open" : "closed"}
          schema={rateSchema}
          defaultValues={{
            rateDate: todayIso(),
            fromCurrency: "USD",
            toCurrency: "SAR",
            rate: 0,
            type: "manual" as const,
          }}
          submitLabel="حفظ السعر"
          secondaryActions={
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await upsertMut.mutateAsync(values);
            onSaved();
          }}
        >
          <FormTextField name="rateDate" label="تاريخ السريان" type="date" required />
          <FormGrid cols={2}>
            <FormSelectField
              name="fromCurrency"
              label="من عملة"
              required
              options={CURRENCY_OPTIONS}
            />
            <FormSelectField
              name="toCurrency"
              label="إلى عملة"
              required
              options={[{ value: "SAR", label: "SAR — ريال سعودي" }, ...CURRENCY_OPTIONS]}
            />
          </FormGrid>
          <FormGrid cols={2}>
            <FormTextField name="rate" label="السعر" type="number" step="0.0001" required />
            <FormSelectField name="type" label="المصدر" options={SOURCE_OPTIONS} />
          </FormGrid>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function RevaluationTab() {
  const { toast } = useToast();
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [preview, setPreview] = useState<RevaluationPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // History — lists past revaluation postings.
  const historyQ = useApiQuery<{ data: RevaluationHistoryRow[] }>(
    ["finance-fx-revaluation-history"],
    "/finance/fx/revaluation",
  );
  const history: RevaluationHistoryRow[] = historyQ.data?.data ?? [];

  const previewMut = useApiMutation<RevaluationPreview, { period: string }>(
    (b) => `/finance/fx/revaluation/preview?period=${b.period}`,
    "GET",
    [],
    { successMessage: false },
  );
  const postMut = useApiMutation<{ data: { journalEntryId: number } }, { period: string }>(
    "/finance/fx/revaluation/post",
    "POST",
    [["finance-fx-revaluation-history"]],
    { successMessage: "تم ترحيل قيد إعادة التقييم" },
  );

  const loadPreview = async () => {
    setLoadingPreview(true);
    try {
      const res = await previewMut.mutateAsync({ period });
      setPreview(res);
    } catch (e: any) {
      toast({ variant: "destructive", title: e?.message || "تعذر تحميل المعاينة" });
    } finally {
      setLoadingPreview(false);
    }
  };

  const postRevaluation = async () => {
    try {
      await postMut.mutateAsync({ period });
      setPreview(null);
      historyQ.refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e?.message || "تعذر الترحيل" });
    }
  };

  const previewColumns: DataTableColumn<RevaluationPreviewRow>[] = [
    { key: "accountCode", header: "رقم الحساب", className: "font-mono text-xs" },
    { key: "accountName", header: "اسم الحساب" },
    {
      key: "currency",
      header: "العملة",
      render: (r) => <Badge variant="outline" className="font-mono">{r.currency}</Badge>,
    },
    { key: "balance", header: "الرصيد", render: (r) => formatCurrency(Number(r.balance)) },
    {
      key: "oldRate",
      header: "السعر القديم",
      render: (r) => <span className="font-mono text-xs">{Number(r.oldRate).toFixed(4)}</span>,
    },
    {
      key: "newRate",
      header: "السعر الجديد",
      render: (r) => <span className="font-mono text-xs">{Number(r.newRate).toFixed(4)}</span>,
    },
    {
      key: "fxGainLoss",
      header: "فرق التقييم",
      render: (r) => {
        const v = Number(r.fxGainLoss);
        return (
          <span
            className={
              v > 0
                ? "text-status-success-foreground font-semibold"
                : v < 0
                ? "text-status-error-foreground font-semibold"
                : "text-muted-foreground"
            }
          >
            {formatCurrency(v)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">إعادة تقييم العملات الأجنبية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 max-w-xs">
              <label className="text-sm font-medium block mb-1">الفترة</label>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full border rounded-md h-10 px-3 text-sm bg-background"
                dir="ltr"
              />
            </div>
            <Button onClick={loadPreview} disabled={loadingPreview} className="gap-1.5">
              <RefreshCw className={`h-4 w-4 ${loadingPreview ? "animate-spin" : ""}`} />
              معاينة
            </Button>
            {preview && preview.rows.length > 0 && (
              <GuardedButton
                perm="finance.algorithms:create"
                variant="default"
                onClick={postRevaluation}
                disabled={postMut.isPending}
                rateLimitAware
                className="gap-1.5"
              >
                <TrendingUp className="h-4 w-4" /> ترحيل القيد
              </GuardedButton>
            )}
          </div>

          {preview && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  إجمالي فرق التقييم: <strong>{formatCurrency(Number(preview.totalGainLoss))}</strong>
                </span>
                <span className="text-xs text-muted-foreground">
                  استناداً لسعر {formatDateAr(preview.spotRateDate)}
                </span>
              </div>
              <DataTable
                columns={previewColumns}
                data={preview.rows}
                rowKey={(r) => r.accountId}
                emptyMessage="لا توجد أرصدة بعملات أجنبية في هذه الفترة"
              />
            </div>
          )}

          {preview && preview.rows.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border border-dashed rounded">
              <AlertCircle className="h-4 w-4" />
              لا توجد أرصدة تحتاج لإعادة تقييم في هذه الفترة
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">سجل عمليات إعادة التقييم</CardTitle>
        </CardHeader>
        <CardContent>
          <PageStateWrapper
            isLoading={historyQ.isLoading}
            error={historyQ.error}
            onRetry={() => historyQ.refetch()}
          >
            <DataTable
              columns={[
                { key: "period", header: "الفترة", className: "font-mono" },
                {
                  key: "totalGainLoss",
                  header: "إجمالي الفرق",
                  render: (h) => formatCurrency(Number(h.totalGainLoss)),
                },
                { key: "postedByName", header: "بواسطة", render: (h) => h.postedByName ?? "—" },
                {
                  key: "postedAt",
                  header: "التاريخ",
                  render: (h) => formatDateAr(h.postedAt),
                },
                {
                  key: "journalEntryId",
                  header: "قيد",
                  render: (h) => (h.journalEntryId ? `#${h.journalEntryId}` : "—"),
                },
              ] satisfies DataTableColumn<RevaluationHistoryRow>[]}
              data={history}
              rowKey={(h) => h.id}
              emptyMessage="لم يتم ترحيل أي قيد إعادة تقييم بعد"
            />
          </PageStateWrapper>
        </CardContent>
      </Card>
    </div>
  );
}
