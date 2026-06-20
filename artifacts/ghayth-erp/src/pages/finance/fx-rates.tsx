import { useState } from "react";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatNumber, formatDateAr, todayLocal } from "@/lib/formatters";
import { Globe, Plus, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface FxRate {
  id: number;
  rateDate: string;
  effectiveDate: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number | string;
  source: string;
  createdAt: string | null;
}

const COMMON_CURRENCIES = [
  { code: "USD", label: "دولار أمريكي" },
  { code: "EUR", label: "يورو" },
  { code: "GBP", label: "جنيه إسترليني" },
  { code: "AED", label: "درهم إماراتي" },
  { code: "KWD", label: "دينار كويتي" },
  { code: "BHD", label: "دينار بحريني" },
  { code: "QAR", label: "ريال قطري" },
  { code: "OMR", label: "ريال عماني" },
  { code: "JOD", label: "دينار أردني" },
  { code: "EGP", label: "جنيه مصري" },
];

const RATE_TYPES = [
  { value: "spot",     label: "فوري (Spot)" },
  { value: "average",  label: "متوسط" },
  { value: "closing",  label: "إقفال" },
  { value: "manual",   label: "يدوي" },
  { value: "central",  label: "البنك المركزي (SAMA)" },
];

const SOURCE_LABEL: Record<string, string> = {
  spot: "فوري", average: "متوسط", closing: "إقفال",
  manual: "يدوي", central: "البنك المركزي", official: "رسمي",
  fixer: "Fixer.io", oer: "OpenExchangeRates",
};

export default function FxRatesPage() {
  const { toast } = useToast();
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("SAR");

  const [form, setForm] = useState({
    rateDate: todayLocal(),
    fromCurrency: "USD",
    toCurrency: "SAR",
    rate: "",
    type: "manual",
  });
  const [showForm, setShowForm] = useState(false);

  const params = new URLSearchParams();
  if (fromFilter) params.set("from", fromFilter);
  if (toFilter) params.set("to", toFilter);
  const qs = params.toString();

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: FxRate[] }>(
    ["fx-rates", fromFilter, toFilter],
    `/finance/fx/rates${qs ? `?${qs}` : ""}`,
  );

  const upsertMut = useApiMutation("/finance/fx/rates", "POST", [["fx-rates"]]);

  const rows = data?.data ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;


  const handleSubmit = async () => {
    if (!form.rate || Number(form.rate) <= 0) {
      toast({ variant: "destructive", title: "السعر يجب أن يكون أكبر من صفر" });
      return;
    }
    if (form.fromCurrency === form.toCurrency) {
      toast({ variant: "destructive", title: "العملتان يجب أن تكونا مختلفتين" });
      return;
    }
    try {
      await upsertMut.mutateAsync({
        rateDate: form.rateDate,
        fromCurrency: form.fromCurrency.toUpperCase(),
        toCurrency: form.toCurrency.toUpperCase(),
        rate: Number(form.rate),
        type: form.type,
      });
      toast({ title: "تم حفظ سعر الصرف" });
      setShowForm(false);
      setForm((f) => ({ ...f, rate: "" }));
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "تعذّر الحفظ",
        description: err?.fix ?? getErrorMessage(err),
      });
    }
  };

  // Latest rate for each currency pair
  const latestByPair = new Map<string, FxRate>();
  for (const r of rows) {
    const key = `${r.fromCurrency}→${r.toCurrency}`;
    const existing = latestByPair.get(key);
    if (!existing || (r.effectiveDate > existing.effectiveDate)) {
      latestByPair.set(key, r);
    }
  }
  const latestPairs = Array.from(latestByPair.values()).slice(0, 6);

  const cols: DataTableColumn<FxRate>[] = [
    { key: "effectiveDate", header: "تاريخ التطبيق",
      render: (r) => <span className="text-xs">{formatDateAr(r.effectiveDate)}</span> },
    { key: "fromCurrency", header: "من",
      render: (r) => <Badge variant="outline" className="font-mono text-xs">{r.fromCurrency}</Badge> },
    { key: "arrow", header: "",
      render: () => <span className="text-muted-foreground">→</span> },
    { key: "toCurrency", header: "إلى",
      render: (r) => <Badge variant="outline" className="font-mono text-xs">{r.toCurrency}</Badge> },
    { key: "rate", header: "السعر",
      render: (r) => <span className="font-mono font-bold">{Number(r.rate).toFixed(6)}</span> },
    { key: "source", header: "المصدر",
      render: (r) => (
        <Badge variant="outline" className="text-[10px]">
          {SOURCE_LABEL[r.source] ?? r.source}
        </Badge>
      ),
    },
  ];

  return (
    <PageShell
      title="أسعار صرف العملات"
      subtitle="إدارة أسعار الصرف للفواتير متعددة العملات + إعادة التقييم الشهري"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "أسعار الصرف" },
      ]}
      actions={
        <>
          <GuardedButton perm="finance:create" onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4 me-1" /> {showForm ? "إلغاء" : "إضافة سعر صرف"}
          </GuardedButton>
          <PrintButton
            entityType="report_finance_fx_rates"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "أسعار صرف العملات", total: printRows.length },
              items: printRows.map((r: any) => ({
                "التاريخ": r.effectiveDate || "—",
                "من": r.fromCurrency || "—",
                "إلى": r.toCurrency || "—",
                "السعر": Number(r.rate ?? 0).toFixed(6),
                "المصدر": SOURCE_LABEL[r.source] ?? r.source ?? "—",
              })),
            })}
          />
        </>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Globe className="h-4 w-4" /> لمَ تحتاج هذه الأسعار؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            عند إصدار فاتورة بعملة غير الريال السعودي، الـ rate يُحتسب من هنا.
            أيضاً، تقرير إعادة تقييم العملات الأجنبية (FX Revaluation) في نهاية
            الشهر يستخدم هذه الأسعار لحساب الفروقات على الفواتير المفتوحة بعملات أجنبية.
          </p>
        </CardContent>
      </Card>

      {showForm && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">إضافة / تحديث سعر صرف</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <Label className="text-xs">التاريخ</Label>
                <Input
                  type="date" dir="ltr"
                  value={form.rateDate}
                  onChange={(e) => setForm((f) => ({ ...f, rateDate: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">من العملة</Label>
                <Select value={form.fromCurrency} onValueChange={(v) => setForm((f) => ({ ...f, fromCurrency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMMON_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} — {c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">إلى العملة</Label>
                <Select value={form.toCurrency} onValueChange={(v) => setForm((f) => ({ ...f, toCurrency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SAR">SAR — ريال سعودي</SelectItem>
                    {COMMON_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} — {c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">السعر</Label>
                <Input
                  type="number" step={0.000001} min={0} dir="ltr"
                  value={form.rate}
                  onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                  placeholder="3.750000"
                />
              </div>
              <div>
                <Label className="text-xs">النوع</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RATE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>إلغاء</Button>
              <GuardedButton perm="finance:create" onClick={handleSubmit}
                disabled={upsertMut.isPending} rateLimitAware size="sm">
                {upsertMut.isPending ? "جاري الحفظ..." : "حفظ السعر"}
              </GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}

      {latestPairs.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> أحدث الأسعار حسب زوج العملة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {latestPairs.map((r) => (
                <div key={r.id} className="border rounded p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">
                    {r.fromCurrency} → {r.toCurrency}
                  </p>
                  <p className="text-base font-bold font-mono">{Number(r.rate).toFixed(4)}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDateAr(r.effectiveDate)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3 mb-3">
        <div>
          <Label className="text-xs text-muted-foreground">من:</Label>
          <Input
            value={fromFilter} onChange={(e) => setFromFilter(e.target.value.toUpperCase())}
            placeholder="USD" dir="ltr" className="w-24"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">إلى:</Label>
          <Input
            value={toFilter} onChange={(e) => setToFilter(e.target.value.toUpperCase())}
            placeholder="SAR" dir="ltr" className="w-24"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="self-end">تحديث</Button>
        <span className="ms-auto text-xs text-muted-foreground">
          {formatNumber(rows.length)} سعر
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={rows}
            onSortedDataChange={setPrintRows}
            pageSize={50}
            emptyMessage="لا توجد أسعار صرف لهذي الفلاتر"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
