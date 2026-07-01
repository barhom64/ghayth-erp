import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { PageShell, DataTable } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { RefreshAction } from "@/components/page-actions";
import {
  AlertTriangle, TrendingDown, FileSignature, RefreshCw,
  Info, CheckCircle2, Lock,
} from "lucide-react";
import { formatCurrency, todayLocal, currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";

/**
 * Bad Debt Provision Workbench
 *
 * Month-end provisioning UI for "doubtful debts allowance". The auditor and
 * CFO need to (a) view AR aging buckets, (b) apply tunable provision rates
 * per bucket, (c) preview the resulting allowance, and (d) post the JE.
 *
 * Endpoints:
 *   GET  /finance/bad-debt/preview?asOf&rateCurrent&rate30&rate60&rate90&rate90plus
 *   POST /finance/bad-debt/post   { period, asOf, rates, notes }
 */

interface Buckets {
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d90plus: number;
}
interface Rates {
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d90plus: number;
}
interface PreviewResp {
  asOf: string;
  rates: Rates;
  buckets: Buckets;
  provision: Buckets;
  totalProvision: number;
  invoiceCount: number;
}

const DEFAULT_RATES: Rates = { current: 0, d30: 0.05, d60: 0.25, d90: 0.5, d90plus: 0.75 };

const BUCKET_DEFS: Array<{ key: keyof Buckets; label: string; help: string; color: string }> = [
  { key: "current",  label: "حالي (لم يستحق)",  help: "فواتير لم يحن أجل سدادها",  color: "bg-status-info-foreground" },
  { key: "d30",      label: "1-30 يوم متأخر",   help: "تأخير بسيط",                 color: "bg-status-success-foreground" },
  { key: "d60",      label: "31-60 يوم متأخر",  help: "تأخير متوسط — متابعة لازمة", color: "bg-status-warning-foreground" },
  { key: "d90",      label: "61-90 يوم متأخر",  help: "تأخير حرج — تصعيد",          color: "bg-status-warning-foreground" },
  { key: "d90plus",  label: "أكثر من 90 يوم",   help: "خطر تعثّر مرتفع",            color: "bg-status-danger-foreground" },
];

export default function BadDebtProvisionPage() {
  const [year, setYear] = useState<number>(currentYearRiyadh());
  const [month, setMonth] = useState<string>(currentMonthPaddedRiyadh());
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);
  const [notes, setNotes] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const asOf = useMemo(() => {
    const lastDay = new Date(Date.UTC(year, Number(month), 0)).getUTCDate();
    return `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  }, [year, month]);

  const period = `${year}-${month}`;

  const queryString = useMemo(() => {
    const p = new URLSearchParams({
      asOf,
      rateCurrent: String(rates.current),
      rate30: String(rates.d30),
      rate60: String(rates.d60),
      rate90: String(rates.d90),
      rate90plus: String(rates.d90plus),
    });
    return p.toString();
  }, [asOf, rates]);

  const { data, isLoading, refetch } = useApiQuery<PreviewResp>(
    ["bad-debt-preview", asOf, String(rates.current), String(rates.d30), String(rates.d60), String(rates.d90), String(rates.d90plus)],
    `/finance/bad-debt/preview?${queryString}`,
  );

  const postMutation = useApiMutation<{ journalId: number; total: number }>(
    "/finance/bad-debt/post",
    "POST",
    [["bad-debt-preview"], ["journal"]],
  );

  const totalOutstanding = useMemo(() => {
    if (!data) return 0;
    return data.buckets.current + data.buckets.d30 + data.buckets.d60 + data.buckets.d90 + data.buckets.d90plus;
  }, [data]);

  const handlePost = () => {
    postMutation.mutate(
      { period, asOf, rates, notes },
      { onSuccess: () => setShowConfirm(false) },
    );
  };

  const updateRate = (key: keyof Rates, pct: string) => {
    const v = Number(pct) / 100;
    if (Number.isFinite(v) && v >= 0 && v <= 1) {
      setRates(r => ({ ...r, [key]: v }));
    }
  };

  return (
    <PageShell
      title="ورقة عمل مخصص الديون"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "مخصص ديون مشكوك فيها" },
      ]}
      subtitle={`ورقة عمل الإقفال الشهري — نسب قابلة للتعديل لكل سطل عمر`}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/finance/ar-collection-workbench">
              منضدة التحصيل
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/customer-risk">
              مخاطر العملاء
            </Link></Button>
          <PrintButton
            entityType="report_finance_bad_debt_provision"
            entityId={period}
            size="icon"
            payload={{
              entity: { title: `مخصص ديون مشكوك فيها — ${period}`, total: data?.invoiceCount ?? 0 },
              items: data ? BUCKET_DEFS.map((b) => ({
                "الشريحة": b.label,
                "الرصيد المفتوح": Number(data.buckets[b.key] || 0),
                "النسبة %": (Number(rates[b.key] || 0) * 100).toFixed(1),
                "المخصص": Number(data.provision[b.key] || 0),
              })) : [],
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      {/* Period + rates control */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">الفترة والنسب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">السنة</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border rounded px-3 py-1.5 text-sm bg-background"
              >
                {[currentYearRiyadh(), currentYearRiyadh() - 1, currentYearRiyadh() - 2].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الشهر</label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm bg-background"
              >
                {["01","02","03","04","05","06","07","08","09","10","11","12"].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">كما في</label>
              <div className="px-3 py-1.5 border rounded bg-muted text-sm tabular-nums">{asOf}</div>
            </div>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => setRates(DEFAULT_RATES)}>
              <RefreshCw className="w-4 h-4 ml-1" />
              نسب افتراضية
            </Button>
            <RefreshAction onRefresh={() => refetch()} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {BUCKET_DEFS.map(b => (
              <div key={b.key} className="border rounded p-2">
                <div className="text-[11px] text-muted-foreground mb-1">{b.label}</div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={(rates[b.key] * 100).toFixed(0)}
                    onChange={(e) => updateRate(b.key, e.target.value)}
                    className="text-sm h-8"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : !data ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد بيانات</CardContent></Card>
      ) : (
        <>
          {/* Top summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">إجمالي AR المستحق</div>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(totalOutstanding)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{data.invoiceCount} فاتورة</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-status-danger-foreground" />
                  إجمالي المخصص المقترح
                </div>
                <div className="text-2xl font-bold tabular-nums text-status-danger-foreground">
                  {formatCurrency(data.totalProvision)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">نسبة المخصص</div>
                <div className="text-2xl font-bold tabular-nums">
                  {totalOutstanding > 0 ? ((data.totalProvision / totalOutstanding) * 100).toFixed(1) : "0.0"}%
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">من إجمالي AR</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">الفترة المحاسبية</div>
                <div className="text-2xl font-bold tabular-nums">{period}</div>
                <div className="text-[11px] text-muted-foreground mt-1">قيد المخصص: BAD-DEBT-{period}</div>
              </CardContent>
            </Card>
          </div>

          {/* Buckets × rates table */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">سطول العمر مع المخصص المحسوب</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable<{ key: keyof Buckets; label: string; help: string; color: string; amt: number; prov: number; pctOfTotal: number }>
                noToolbar
                pageSize={0}
                rowKey={(b) => b.key}
                rowClassName={() => "hover:bg-muted/30"}
                data={BUCKET_DEFS.map(b => {
                  const amt = data.buckets[b.key];
                  const prov = data.provision[b.key];
                  const pctOfTotal = totalOutstanding > 0 ? (amt / totalOutstanding) * 100 : 0;
                  return { ...b, amt, prov, pctOfTotal };
                })}
                columns={[
                  {
                    key: "label", header: "السطل", sortable: false,
                    render: (b) => (
                      <>
                        <div className="font-medium">{b.label}</div>
                        <div className="text-[11px] text-muted-foreground">{b.help}</div>
                      </>
                    ),
                    footer: () => "الإجمالي",
                  },
                  { key: "amount", header: "المبلغ المستحق", sortable: false, align: "end", className: "tabular-nums font-semibold", render: (b) => formatCurrency(b.amt), footer: () => formatCurrency(totalOutstanding) },
                  { key: "pctOfTotal", header: "% من الإجمالي", sortable: false, align: "end", className: "tabular-nums text-muted-foreground", render: (b) => `${b.pctOfTotal.toFixed(1)}%`, footer: () => "100%" },
                  {
                    key: "rate", header: "نسبة المخصص", sortable: false, align: "end", className: "tabular-nums",
                    render: (b) => (
                      <Badge variant="outline" className="font-mono">
                        {(rates[b.key] * 100).toFixed(0)}%
                      </Badge>
                    ),
                    footer: () => <span className="text-muted-foreground">— متوسط مرجح —</span>,
                  },
                  { key: "provision", header: "المخصص", sortable: false, align: "end", className: "tabular-nums font-semibold text-status-danger-foreground", render: (b) => formatCurrency(b.prov), footer: () => formatCurrency(data.totalProvision) },
                  {
                    key: "indicator", header: "المؤشر", sortable: false, className: "w-32",
                    render: (b) => (
                      <div className="h-2 bg-muted rounded overflow-hidden">
                        <div
                          className={b.color}
                          style={{ width: `${Math.min(b.pctOfTotal, 100)}%`, height: "100%" }}
                        />
                      </div>
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>

          {/* JE preview */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSignature className="w-4 h-4" />
                معاينة قيد المخصص
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-start py-2 px-2">الحساب</th>
                    <th className="text-end py-2 px-2">مدين</th>
                    <th className="text-end py-2 px-2">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-2">5820 — مصروف ديون مشكوك فيها</td>
                    <td className="py-2 px-2 text-end tabular-nums font-semibold">
                      {formatCurrency(data.totalProvision)}
                    </td>
                    <td className="py-2 px-2 text-end tabular-nums">—</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-2">1135 — مخصص ديون مشكوك فيها (مقابل)</td>
                    <td className="py-2 px-2 text-end tabular-nums">—</td>
                    <td className="py-2 px-2 text-end tabular-nums font-semibold">
                      {formatCurrency(data.totalProvision)}
                    </td>
                  </tr>
                </tbody>
              </table></div>
              <div className="mt-3 text-[11px] text-muted-foreground flex items-start gap-2 bg-status-info-surface p-2 rounded">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-status-info-foreground" />
                <div>
                  المرجع: <code className="font-mono">BAD-DEBT-{period}</code> — يُمنع التسجيل مرتين لنفس الفترة.
                  المخصص يقلل صافي AR في الميزانية دون شطب الفواتير الفعلي (للشطب راجع نافذة Write-Off للفواتير الفردية).
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes + post */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الترحيل</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">ملاحظات (تظهر في القيد)</label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: مراجعة شهرية — وافق عليها CFO"
                />
              </div>

              {data.totalProvision <= 0 ? (
                <div className="flex items-center gap-2 text-sm bg-status-warning-surface text-status-warning-foreground p-3 rounded">
                  <AlertTriangle className="w-4 h-4" />
                  المخصص = 0 — لا يوجد قيد لترحيله. اضبط النسب أو راجع الفواتير المعلّقة.
                </div>
              ) : !showConfirm ? (
                <GuardedButton
                  perm="finance.collection.create"
                  onClick={() => setShowConfirm(true)}
                  className="w-full"
                  size="lg"
                >
                  <FileSignature className="w-4 h-4 ml-2" />
                  ترحيل قيد المخصص
                </GuardedButton>
              ) : (
                <div className="border-2 border-status-warning-foreground rounded p-4 bg-status-warning-surface">
                  <div className="flex items-start gap-2 mb-3">
                    <Lock className="w-5 h-5 text-status-warning-foreground" />
                    <div>
                      <div className="font-semibold">تأكيد الترحيل</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        سيتم ترحيل قيد <code>BAD-DEBT-{period}</code> بمبلغ{" "}
                        <strong className="text-status-danger-foreground">{formatCurrency(data.totalProvision)}</strong>.
                        لا يمكن إلغاؤه إلا بقيد عكسي.
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handlePost}
                      disabled={postMutation.isPending}
                      className="flex-1"
                      rateLimitAware
                    >
                      {postMutation.isPending ? "جاري الترحيل..." : "تأكيد وترحيل"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowConfirm(false)}
                      disabled={postMutation.isPending}
                    >
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}

              {postMutation.isSuccess && postMutation.data && (
                <div className="bg-status-success-surface text-status-success-foreground p-3 rounded flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  تم ترحيل القيد بنجاح — JE #{postMutation.data.journalId} بمبلغ {formatCurrency(postMutation.data.total)}
                </div>
              )}
              {postMutation.isError && (
                <div className="bg-status-danger-surface text-status-danger-foreground p-3 rounded flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-5 h-5" />
                  فشل الترحيل: {(postMutation.error as Error)?.message ?? "خطأ غير معروف"}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
