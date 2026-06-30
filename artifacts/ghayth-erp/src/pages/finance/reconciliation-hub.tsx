import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatNumber, currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";
import {
  Scale, CheckCircle2, AlertCircle, ArrowRight, Banknote, ReceiptText,
  Package, Percent, Loader2, ChevronRight, FileText,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { DateRangePresets } from "@/components/shared/date-range-presets";
import { PrintButton } from "@/components/shared/print-button";
import { RefreshAction } from "@/components/page-actions";

/**
 * Reconciliation Hub — central tie-out screen.
 *
 * Each accounting control answers: "does the sub-ledger total match the
 * GL control account balance?" If not, there is a posting error and the
 * accountant must investigate.
 *
 *  • Cash: GL cash account (11x) vs Treasury current balance per bank
 *  • AR: GL AR control (12x) vs sum of open AR aging
 *  • AP: GL AP control (21x) vs sum of open AP aging
 *  • VAT Output: GL VAT control (213x) vs sum of VAT on sales invoices
 *  • Inventory: GL inventory (13x) vs warehouse valuation
 *
 * Each row turns green when balanced, red when out-of-balance, with the
 * variance amount + a deep-link to the GL ledger for that account.
 */

interface TrialBalanceRow {
  id: number;
  code: string;
  name: string;
  type: string;
  totalDebit: number | string;
  totalCredit: number | string;
  balance: number | string;
  allowPosting: boolean;
}

interface TrialBalanceResp {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  byType: Record<string, any>;
}

const TOLERANCE = 0.5; // currency units — ignore sub-riyal rounding

interface ReconRowConfig {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  glCodePrefix: string;
  subledgerHref: string;
  subledgerLabel: string;
}

const RECON_ROWS: ReconRowConfig[] = [
  {
    key: "cash",
    label: "النقد والبنوك",
    description: "حسابات النقدية (11x) مقابل الخزينة",
    icon: Banknote,
    glCodePrefix: "11",
    subledgerHref: "/finance/treasury",
    subledgerLabel: "الخزينة",
  },
  {
    key: "ar",
    label: "ذمم العملاء (AR)",
    description: "حسابات الذمم المدينة (12x) مقابل أعمار الذمم المدينة",
    icon: ReceiptText,
    glCodePrefix: "12",
    subledgerHref: "/finance/ar-aging",
    subledgerLabel: "أعمار الذمم المدينة",
  },
  {
    key: "ap",
    label: "ذمم الموردين (AP)",
    description: "حسابات الذمم الدائنة (21x) مقابل أعمار الذمم الدائنة",
    icon: ReceiptText,
    glCodePrefix: "21",
    subledgerHref: "/finance/ap-aging",
    subledgerLabel: "أعمار الذمم الدائنة",
  },
  {
    key: "vat",
    label: "ضريبة القيمة المضافة",
    description: "حساب ضريبة القيمة المضافة الإجمالي مقابل مجموعها في الفواتير",
    icon: Percent,
    glCodePrefix: "213",
    subledgerHref: "/finance/reports/vat-reconciliation",
    subledgerLabel: "تطابق VAT",
  },
  {
    key: "inventory",
    label: "المخزون",
    description: "حسابات المخزون (13x) مقابل تقييم المخزون",
    icon: Package,
    glCodePrefix: "13",
    subledgerHref: "/finance/inventory-valuation",
    subledgerLabel: "تقييم المخزون",
  },
];

const SUM = (rows: any[], key: string): number =>
  rows.reduce((s, r) => s + Number(r?.[key] ?? 0), 0);

export default function ReconciliationHubPage() {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>(() => {
    const y = currentYearRiyadh();
    const m = currentMonthPaddedRiyadh();
    // utc-ok: simple "today as YYYY-MM-DD" for default end date
    const today = new Date();
    return `${y}-${m}-${String(today.getDate()).padStart(2, "0")}`;
  });

  const dateQs = useMemo(() => {
    const parts: string[] = [];
    if (startDate) parts.push(`startDate=${startDate}`);
    if (endDate) parts.push(`endDate=${endDate}`);
    return parts.join("&");
  }, [startDate, endDate]);

  // ── GL trial balance (single source of truth for all GL balances)
  const qTb = useApiQuery<TrialBalanceResp>(
    ["recon-tb", dateQs],
    `/finance/reports/trial-balance${dateQs ? `?${dateQs}` : ""}`,
  );

  // ── Sub-ledger queries
  const qTreasury = useApiQuery<any>(["recon-treasury"], `/finance/treasury`);
  const qAr = useApiQuery<any>(["recon-ar"], `/finance/ar-aging`);
  const qAp = useApiQuery<any>(["recon-ap"], `/finance/ap-aging`);
  const qVat = useApiQuery<any>(
    ["recon-vat", dateQs],
    `/finance/reports/vat-reconciliation${dateQs ? `?${dateQs}` : ""}`,
  );
  const qInv = useApiQuery<any>(["recon-inventory"], `/finance/inventory-costing`);

  if (qTb.isLoading || qTreasury.isLoading) return <LoadingSpinner />;

  // ── Aggregate GL balances by prefix
  const tbRows: TrialBalanceRow[] = qTb.data?.rows ?? [];
  const glBalanceByPrefix = (prefix: string) =>
    tbRows
      .filter((r) => r.allowPosting && r.code?.startsWith(prefix))
      .reduce((s, r) => s + Math.abs(Number(r.balance ?? 0)), 0);

  // ── Sub-ledger totals
  const cashSubledger = Number(qTreasury.data?.totalCash ?? 0);

  const arData: any = qAr.data;
  const arSubledger = Array.isArray(arData?.buckets)
    ? SUM(arData.buckets, "total")
    : Array.isArray(arData?.data)
      ? SUM(arData.data, "outstandingAmount") || SUM(arData.data, "total")
      : Number(arData?.totalOpen ?? 0);

  const apData: any = qAp.data;
  const apSubledger = Array.isArray(apData?.buckets)
    ? SUM(apData.buckets, "total")
    : Array.isArray(apData?.data)
      ? SUM(apData.data, "outstandingAmount") || SUM(apData.data, "total")
      : Number(apData?.totalOpen ?? 0);

  const vatData: any = qVat.data;
  const vatSubledger = Number(vatData?.actualOutputBalance ?? vatData?.outputTax ?? 0);
  const vatGl = Number(vatData?.expectedOutputBalance ?? glBalanceByPrefix("213"));

  const invData: any = qInv.data;
  const invSubledger = Array.isArray(invData)
    ? SUM(invData, "totalValue")
    : Number(invData?.totalValue ?? invData?.totalInventoryValue ?? 0);

  type ReconRow = {
    cfg: ReconRowConfig;
    glBalance: number;
    subledger: number;
    variance: number;
    isBalanced: boolean;
    loading: boolean;
    available: boolean;
  };

  const rows: ReconRow[] = RECON_ROWS.map((cfg) => {
    let glBalance: number;
    let subledger: number;
    let loading: boolean;
    let available = true;

    switch (cfg.key) {
      case "cash":
        glBalance = glBalanceByPrefix("11");
        subledger = cashSubledger;
        loading = qTreasury.isLoading;
        break;
      case "ar":
        glBalance = glBalanceByPrefix("12");
        subledger = arSubledger;
        loading = qAr.isLoading;
        available = !qAr.isError && (arData != null);
        break;
      case "ap":
        glBalance = glBalanceByPrefix("21");
        subledger = apSubledger;
        loading = qAp.isLoading;
        available = !qAp.isError && (apData != null);
        break;
      case "vat":
        glBalance = vatGl;
        subledger = vatSubledger;
        loading = qVat.isLoading;
        available = !qVat.isError && (vatData != null);
        break;
      case "inventory":
        glBalance = glBalanceByPrefix("13");
        subledger = invSubledger;
        loading = qInv.isLoading;
        available = !qInv.isError && (invData != null);
        break;
      default:
        glBalance = 0; subledger = 0; loading = false;
    }
    const variance = glBalance - subledger;
    const isBalanced = Math.abs(variance) <= TOLERANCE;
    return { cfg, glBalance, subledger, variance, isBalanced, loading, available };
  });

  const totalChecks = rows.length;
  const balancedCount = rows.filter((r) => r.available && r.isBalanced && !r.loading).length;
  const outOfBalanceCount = rows.filter((r) => r.available && !r.isBalanced && !r.loading).length;
  const loadingCount = rows.filter((r) => r.loading).length;
  const totalVariance = rows
    .filter((r) => r.available && !r.loading)
    .reduce((s, r) => s + Math.abs(r.variance), 0);

  const refreshAll = () => {
    qTb.refetch();
    qTreasury.refetch();
    qAr.refetch();
    qAp.refetch();
    qVat.refetch();
    qInv.refetch();
  };

  return (
    <PageShell
      title="مركز التسوية المحاسبية"
      subtitle="فحص تطابق دفتر الأستاذ العام (GL) مع الدفاتر الفرعية — لكل ضابط محاسبي: هل دفتر الأستاذ يطابق المصدر الفرعي؟"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "التسوية المحاسبية" },
      ]}
      actions={
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">من</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 w-36" />
          </div>
          <div>
            <Label className="text-xs">إلى</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 w-36" />
          </div>
          <RefreshAction onRefresh={refreshAll} />
          <PrintButton
            entityType="report_finance_reconciliation_hub"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: "مركز التسوية المحاسبية", total: rows.length },
              items: rows.map((r) => ({
                "الضابط": r.cfg.label,
                "رصيد GL": Number(r.glBalance || 0),
                "رصيد المصدر الفرعي": Number(r.subledger || 0),
                "الفرق": Number(r.variance || 0),
                "متوازن": r.isBalanced ? "نعم" : "لا",
              })),
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-3">
        <CardContent className="p-3">
          <DateRangePresets
            value={{ from: startDate, to: endDate }}
            onChange={(r) => { setStartDate(r.from); setEndDate(r.to); }}
            testidPrefix="reconciliation-hub-preset"
            hideAllTime
          />
        </CardContent>
      </Card>

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Scale className="h-4 w-4" /> فكرة التطابق المحاسبي
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            لكل ضابط محاسبي (control account) في الـ GL، هناك مصدر فرعي مفصل
            (sub-ledger). إذا الـ GL يقول AR = 1.2M والـ AR aging يقول 1.18M،
            هناك <strong>20K</strong> فرق يجب التحقيق فيه — قيد لم يُرحَّل، فاتورة محذوفة
            قسرياً، أو ترحيل لحساب خاطئ. هذي الصفحة تُظهر كل الفروقات في مكان واحد.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>التسامح:</strong> فروقات ≤ {TOLERANCE} ر.س تُعتبر مقبولة (تقريب).
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الفحوصات</p>
            <p className="text-lg font-bold font-mono">{formatNumber(totalChecks)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> متطابقة
            </p>
            <p className="text-lg font-bold font-mono text-emerald-700">{formatNumber(balancedCount)}</p>
          </CardContent>
        </Card>
        <Card className={outOfBalanceCount > 0 ? "border-red-400" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertCircle className="h-3 w-3" /> غير متطابقة
            </p>
            <p className={`text-lg font-bold font-mono ${outOfBalanceCount > 0 ? "text-red-700" : ""}`}>
              {formatNumber(outOfBalanceCount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الفروقات</p>
            <p className={`text-lg font-bold font-mono ${totalVariance > TOLERANCE ? "text-red-700" : "text-emerald-700"}`}>
              {formatCurrency(totalVariance)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">قائمة التسويات</CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-2">
          {rows.map(({ cfg, glBalance, subledger, variance, isBalanced, loading, available }) => {
            const Icon = cfg.icon;
            const rowClass = loading
              ? "border-muted bg-muted/30"
              : !available
                ? "border-muted bg-muted/10"
                : isBalanced
                  ? "border-emerald-300 bg-emerald-50/30"
                  : "border-red-300 bg-red-50/30";
            return (
              <div key={cfg.key} className={`p-3 rounded-lg border ${rowClass}`}>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 p-2 rounded bg-white border">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm">{cfg.label}</span>
                      {loading
                        ? <Badge variant="outline" className="text-[10px]"><Loader2 className="h-2.5 w-2.5 animate-spin me-1" /> جاري الفحص</Badge>
                        : !available
                          ? <Badge variant="outline" className="text-[10px]">المصدر غير متاح</Badge>
                          : isBalanced
                            ? <Badge className="bg-emerald-100 text-emerald-800 text-[10px]"><CheckCircle2 className="h-2.5 w-2.5 me-0.5" /> متطابق</Badge>
                            : <Badge className="bg-red-100 text-red-800 text-[10px]"><AlertCircle className="h-2.5 w-2.5 me-0.5" /> غير متطابق</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-2">{cfg.description}</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-white border rounded p-2">
                        <p className="text-[10px] text-muted-foreground">رصيد GL (حسابات {cfg.glCodePrefix}x)</p>
                        <p className="font-mono font-semibold mt-0.5">
                          {loading ? "—" : formatCurrency(glBalance)}
                        </p>
                      </div>
                      <div className="bg-white border rounded p-2">
                        <p className="text-[10px] text-muted-foreground">المصدر الفرعي</p>
                        <p className="font-mono font-semibold mt-0.5">
                          {loading ? "—" : available ? formatCurrency(subledger) : "—"}
                        </p>
                      </div>
                      <div className={`border rounded p-2 ${isBalanced ? "bg-emerald-50 border-emerald-300" : "bg-red-50 border-red-300"}`}>
                        <p className="text-[10px] text-muted-foreground">الفرق</p>
                        <p className={`font-mono font-bold mt-0.5 ${isBalanced ? "text-emerald-700" : "text-red-700"}`}>
                          {loading ? "—" : (variance >= 0 ? "+" : "") + formatCurrency(variance)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button asChild variant="outline" size="sm" className="h-7 text-xs whitespace-nowrap"><Link href={cfg.subledgerHref}>
                        {cfg.subledgerLabel}
                        <ChevronRight className="h-3 w-3 ms-1" />
                      </Link></Button>
                    {!isBalanced && !loading && available && (
                      <Button asChild variant="ghost" size="sm" className="h-7 text-xs whitespace-nowrap text-red-700"><Link href={`/finance/journal?accountCode=${cfg.glCodePrefix}`}>
                          <FileText className="h-3 w-3 me-1" />
                          فحص GL
                        </Link></Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="mt-4 bg-muted/30">
        <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">قائمة فحص أسبوعية مقترحة للمحاسب:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>افتح هذه الصفحة وحدّد الفترة (الأسبوع الماضي مثلاً)</li>
            <li>أي ضابط بفرق ≠ 0 → افتح "فحص GL" + المصدر الفرعي للمقارنة</li>
            <li>سجّل قيد تسوية لإصلاح الانحراف (لا تتجاهل! ينمو شهرياً)</li>
            <li>قبل إقفال الفترة، تأكد أن كل المراقبات خضراء</li>
          </ul>
        </CardContent>
      </Card>
    </PageShell>
  );
}
