import { useMemo } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import {
  Wallet, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Clock, ArrowRight, Banknote, ReceiptText, FileText, Calendar,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { AllocationHealthCard } from "@/components/shared/allocation-health-card";

/**
 * CFO Daily Cockpit — single-pane-of-glass for the CFO's morning review.
 *
 * Fans out 7 endpoint queries in parallel and renders the company's
 * current financial state in one screen:
 *  - Cash position (per-bank + total)
 *  - AR aging buckets with overdue highlight
 *  - AP due this week + payment run pending
 *  - Approvals queue (waiting on me)
 *  - Today's GL activity
 *  - Alert panel (expiring contracts, posting failures, etc.)
 */

interface TreasuryResp {
  cashAccounts: Array<{
    id: number; code: string; name: string;
    currentBalance: number | string;
  }>;
  totalCash: number;
  cashOnHand: number;
  bankBalances: number;
  receivables: number;
}

interface ArAgingBucket {
  bucket: string;
  total: number | string;
  count: number;
}

interface ApAgingBucket {
  bucket: string;
  total: number | string;
  count: number;
}

interface PendingPayable {
  id: number;
  ref: string;
  totalAmount: number | string;
  expectedDelivery: string | null;
  supplierName: string | null;
}

const SUM = (rows: any[], key: string): number =>
  rows.reduce((s, r) => s + Number(r?.[key] ?? 0), 0);

export default function CfoCockpitPage() {
  // ── 1. Treasury / cash position
  const qTreasury = useApiQuery<TreasuryResp>(["cockpit-treasury"], `/finance/treasury`);

  // ── 2. AR Aging
  const qArAging = useApiQuery<{ buckets?: ArAgingBucket[] } | any>(
    ["cockpit-ar-aging"], `/finance/ar-aging`);

  // ── 3. AP Aging
  const qApAging = useApiQuery<{ buckets?: ApAgingBucket[] } | any>(
    ["cockpit-ap-aging"], `/finance/ap-aging`);

  // ── 4. Pending payment run (POs to pay)
  const qPaymentPending = useApiQuery<{ data?: PendingPayable[] } | any>(
    ["cockpit-payment-pending"], `/finance/payment-run/pending`);

  // ── 5. Approvals: pending budget approvals (sample of items waiting)
  const qBudgetAppr = useApiQuery<{ data?: any[] }>(
    ["cockpit-budget-approvals"], `/finance/budget/approval-requests?status=pending`);

  // ── 6. Posting failures (unresolved)
  const qFailures = useApiQuery<{ data?: any[] }>(
    ["cockpit-posting-failures"], `/finance/posting-failures?status=unresolved&limit=20`);

  // ── 7. Overdue invoices needing collection
  const qOverdue = useApiQuery<any[] | { data?: any[] }>(
    ["cockpit-overdue-invoices"], `/finance/collection`);

  const loading =
    qTreasury.isLoading || qArAging.isLoading || qApAging.isLoading ||
    qPaymentPending.isLoading;

  const treasury = qTreasury.data;

  // AR aging — try buckets shape first, otherwise sum data rows
  const arBuckets: ArAgingBucket[] = useMemo(() => {
    const d: any = qArAging.data;
    if (Array.isArray(d?.buckets)) return d.buckets;
    if (Array.isArray(d?.data) && d.data.length > 0 && d.data[0].bucket) return d.data;
    return [];
  }, [qArAging.data]);

  const apBuckets: ApAgingBucket[] = useMemo(() => {
    const d: any = qApAging.data;
    if (Array.isArray(d?.buckets)) return d.buckets;
    if (Array.isArray(d?.data) && d.data.length > 0 && d.data[0].bucket) return d.data;
    return [];
  }, [qApAging.data]);

  const pendingPayables: PendingPayable[] = useMemo(() => {
    const d: any = qPaymentPending.data;
    if (Array.isArray(d?.data)) return d.data;
    if (Array.isArray(d)) return d;
    return [];
  }, [qPaymentPending.data]);

  const overdueInvoices = useMemo(() => {
    const d: any = qOverdue.data;
    return Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
  }, [qOverdue.data]);

  if (loading) return <LoadingSpinner />;

  const totalCash = Number(treasury?.totalCash ?? 0);
  const bankAccounts = treasury?.cashAccounts ?? [];

  const totalAr = SUM(arBuckets, "total");
  const overdueAr = arBuckets
    .filter((b) => b.bucket !== "0-30" && b.bucket !== "current")
    .reduce((s, b) => s + Number(b.total ?? 0), 0);

  const totalAp = SUM(apBuckets, "total");

  const apThisWeek = pendingPayables
    .filter((p) => {
      if (!p.expectedDelivery) return false;
      const due = new Date(p.expectedDelivery);
      const today = new Date();
      // utc-ok: rough "within 7 days" check from today, no timezone sensitivity needed
      const diff = (due.getTime() - today.getTime()) / 86400000;
      return diff <= 7;
    });
  const apThisWeekAmount = SUM(apThisWeek, "totalAmount");

  const pendingApprovals = qBudgetAppr.data?.data?.length ?? 0;
  const failuresCount = qFailures.data?.data?.length ?? 0;
  const overdueCriticalCount = overdueInvoices.filter((o: any) => Number(o.daysOverdue) >= 30).length;

  const netLiquidity = totalCash - apThisWeekAmount;
  const liquidityHealthy = netLiquidity > 0;

  return (
    <PageShell
      title="لوحة المدير المالي اليومية (CFO Cockpit)"
      subtitle="نظرة واحدة لحالة الشركة المالية الآن — نقد + ذمم + التزامات قادمة + اعتمادات تنتظرك"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "لوحة CFO" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/finance/daily-close-checklist">
              فحص اليوم
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/monthly-close-pack">
              إقفال الشهر
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/workflows-hub">
              كل سير العمل
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/reports">
              <FileText className="h-4 w-4 me-1" /> التقارير الكاملة
            </Link></Button>
          <PrintButton
            entityType="report_finance_cfo_cockpit"
            entityId="summary"
            size="icon"
            payload={{
              entity: { title: "لوحة المدير المالي اليومية", total: 6 },
              items: [
                { "البند": "إجمالي النقد", "القيمة": Number(totalCash || 0) },
                { "البند": "إجمالي الذمم المدينة", "القيمة": Number(totalAr || 0) },
                { "البند": "ذمم مدينة متأخرة", "القيمة": Number(overdueAr || 0) },
                { "البند": "إجمالي الذمم الدائنة", "القيمة": Number(totalAp || 0) },
                { "البند": "دفعات معلقة", "القيمة": pendingPayables.length },
                { "البند": "حسابات بنكية", "القيمة": bankAccounts.length },
              ],
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      {/* ── Allocation engine health: enforce flag + coverage + bypass count
           up here on the CFO cockpit so financial-integrity status is one
           glance away from cash + AR + budget. ── */}
      <AllocationHealthCard />

      {/* ── Quick links bar — jump to any 360° or workflow ─────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
        <Link href="/finance/customer-360-sheet" className="border rounded p-2 text-center text-xs hover:bg-muted/30">عميل 360°</Link>
        <Link href="/finance/vendor-360-sheet" className="border rounded p-2 text-center text-xs hover:bg-muted/30">مورد 360°</Link>
        <Link href="/finance/cash-position-calculator" className="border rounded p-2 text-center text-xs hover:bg-muted/30">حاسبة النقد</Link>
        <Link href="/finance/bank-accounts-watch" className="border rounded p-2 text-center text-xs hover:bg-muted/30">مراقبة البنوك</Link>
        <Link href="/finance/ar-collection-workbench" className="border rounded p-2 text-center text-xs hover:bg-muted/30">منضدة التحصيل</Link>
        <Link href="/finance/vendor-settlement-workbench" className="border rounded p-2 text-center text-xs hover:bg-muted/30">منضدة الموردين</Link>
        <Link href="/finance/budget-heatmap" className="border rounded p-2 text-center text-xs hover:bg-muted/30">خريطة الميزانية</Link>
        <Link href="/finance/expense-burn-rate" className="border rounded p-2 text-center text-xs hover:bg-muted/30">معدل الحرق</Link>
      </div>

      {/* ── Headline KPIs ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <Card className="border-emerald-300 bg-emerald-50/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3 w-3" /> النقد المتاح الآن
            </p>
            <p className="text-2xl font-bold font-mono text-emerald-700 mt-1">
              {formatCurrency(totalCash)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              صندوق: {formatCurrency(Number(treasury?.cashOnHand ?? 0))} ·
              بنوك: {formatCurrency(Number(treasury?.bankBalances ?? 0))}
            </p>
          </CardContent>
        </Card>
        <Card className="border-blue-300 bg-blue-50/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> ذمم مدينة (AR)
            </p>
            <p className="text-2xl font-bold font-mono text-blue-700 mt-1">
              {formatCurrency(totalAr)}
            </p>
            {overdueAr > 0 && (
              <p className="text-[10px] text-red-700 mt-1">
                متأخرة: {formatCurrency(overdueAr)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border-amber-300 bg-amber-50/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> ذمم دائنة (AP)
            </p>
            <p className="text-2xl font-bold font-mono text-amber-700 mt-1">
              {formatCurrency(totalAp)}
            </p>
            {apThisWeekAmount > 0 && (
              <p className="text-[10px] text-red-700 mt-1">
                مستحق خلال 7 أيام: {formatCurrency(apThisWeekAmount)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className={liquidityHealthy ? "border-emerald-400" : "border-red-400 bg-red-50/30"}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {liquidityHealthy ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <AlertTriangle className="h-3 w-3 text-red-600" />}
              السيولة الصافية (نقد − AP أسبوع)
            </p>
            <p className={`text-2xl font-bold font-mono mt-1 ${liquidityHealthy ? "text-emerald-700" : "text-red-700"}`}>
              {liquidityHealthy ? "+" : ""}{formatCurrency(netLiquidity)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {liquidityHealthy ? "كافية لتغطية الأسبوع" : "⚠ النقد لا يغطي الالتزامات القادمة"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Alerts strip ────────────────────────────────────────── */}
      {(failuresCount > 0 || overdueCriticalCount > 0 || pendingApprovals > 0) && (
        <Card className="mb-4 border-red-300 bg-red-50/30">
          <CardContent className="p-3">
            <p className="text-sm font-semibold mb-2 flex items-center gap-2 text-red-900">
              <AlertTriangle className="h-4 w-4" /> ⚡ تنبيهات تحتاج تدخلك
            </p>
            <div className="flex flex-wrap gap-2">
              {pendingApprovals > 0 && (
                <Link href="/finance/budget-approvals">
                  <Badge className="cursor-pointer text-xs bg-amber-100 text-amber-800 hover:bg-amber-200">
                    {pendingApprovals} طلب اعتماد ميزانية
                    <ArrowRight className="h-3 w-3 ms-1" />
                  </Badge>
                </Link>
              )}
              {overdueCriticalCount > 0 && (
                <Link href="/finance/collection">
                  <Badge className="cursor-pointer text-xs bg-red-100 text-red-800 hover:bg-red-200">
                    {overdueCriticalCount} فاتورة متأخرة ≥30 يوم
                    <ArrowRight className="h-3 w-3 ms-1" />
                  </Badge>
                </Link>
              )}
              {failuresCount > 0 && (
                <Link href="/admin/posting-failures">
                  <Badge className="cursor-pointer text-xs bg-red-100 text-red-800 hover:bg-red-200">
                    {failuresCount} قيد فشل ترحيله
                    <ArrowRight className="h-3 w-3 ms-1" />
                  </Badge>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* ── Cash by bank ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Banknote className="h-4 w-4" /> الأرصدة النقدية ({bankAccounts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-1.5 max-h-80 overflow-y-auto">
            {bankAccounts.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-4">
                لا توجد حسابات نقدية مفعّلة
              </p>
            ) : (
              bankAccounts.map((a) => (
                <Link key={a.id} href={`/finance/accounts/${a.code}`}>
                  <div className="flex items-center justify-between p-2 rounded hover:bg-muted/40 cursor-pointer">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{a.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{a.code}</span>
                    </div>
                    <span className={`font-mono text-sm font-semibold ${Number(a.currentBalance) < 0 ? "text-red-700" : ""}`}>
                      {formatCurrency(Number(a.currentBalance ?? 0))}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* ── AR aging buckets ──────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4" /> أعمار الذمم المدينة
              </span>
              <Button asChild variant="ghost" size="sm" className="text-xs h-6"><Link href="/finance/ar-aging">تفاصيل <ArrowRight className="h-3 w-3 ms-1" /></Link></Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {arBuckets.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-4">
                لا توجد ذمم مدينة مفتوحة
              </p>
            ) : (
              <div className="space-y-1.5">
                {arBuckets.map((b) => {
                  const total = Number(b.total ?? 0);
                  const isOverdue = b.bucket !== "0-30" && b.bucket !== "current";
                  return (
                    <div key={b.bucket} className="flex items-center justify-between p-2 rounded hover:bg-muted/40">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${isOverdue ? "bg-red-50 border-red-300 text-red-700" : ""}`}>
                          {b.bucket}
                        </Badge>
                        {b.count > 0 && <span className="text-[10px] text-muted-foreground">{b.count} فاتورة</span>}
                      </div>
                      <span className={`font-mono text-sm font-semibold ${isOverdue ? "text-red-700" : ""}`}>
                        {formatCurrency(total)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* ── AP due this week ─────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> مدفوعات مستحقة هذا الأسبوع ({apThisWeek.length})
              </span>
              <Button asChild variant="ghost" size="sm" className="text-xs h-6"><Link href="/finance/payment-run">دفعة جماعية <ArrowRight className="h-3 w-3 ms-1" /></Link></Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-1.5 max-h-80 overflow-y-auto">
            {apThisWeek.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-4">
                ما في مدفوعات مستحقة هذا الأسبوع 🎉
              </p>
            ) : (
              apThisWeek.slice(0, 10).map((p) => (
                <Link key={p.id} href={`/finance/purchase-orders/${p.id}`}>
                  <div className="flex items-center justify-between p-2 rounded hover:bg-muted/40 cursor-pointer">
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium truncate">{p.supplierName ?? "—"}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {p.ref} · {p.expectedDelivery?.slice(0, 10)}
                      </span>
                    </div>
                    <span className="font-mono text-sm font-semibold whitespace-nowrap ms-2">
                      {formatCurrency(Number(p.totalAmount ?? 0))}
                    </span>
                  </div>
                </Link>
              ))
            )}
            {apThisWeek.length > 10 && (
              <p className="text-[10px] text-muted-foreground text-center pt-2">
                + {apThisWeek.length - 10} مدفوعات إضافية
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Approvals waiting ─────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> اعتمادات بانتظارك
              </span>
              <Button asChild variant="ghost" size="sm" className="text-xs h-6"><Link href="/action-center">مركز الإجراءات <ArrowRight className="h-3 w-3 ms-1" /></Link></Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-1.5">
            <Link href="/finance/budget-approvals">
              <div className="flex items-center justify-between p-2 rounded border hover:bg-muted/40 cursor-pointer">
                <span className="text-xs">تجاوزات ميزانية (CFO/GM)</span>
                <Badge className="bg-amber-100 text-amber-800 text-[10px]">{pendingApprovals}</Badge>
              </div>
            </Link>
            <Link href="/finance/purchase-requests">
              <div className="flex items-center justify-between p-2 rounded border hover:bg-muted/40 cursor-pointer">
                <span className="text-xs">طلبات شراء</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/finance/journal-manual?status=pending_review">
              <div className="flex items-center justify-between p-2 rounded border hover:bg-muted/40 cursor-pointer">
                <span className="text-xs">قيود يدوية للمراجعة</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/finance/expenses?status=pending">
              <div className="flex items-center justify-between p-2 rounded border hover:bg-muted/40 cursor-pointer">
                <span className="text-xs">مصاريف لاعتمادها</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/finance/custodies">
              <div className="flex items-center justify-between p-2 rounded border hover:bg-muted/40 cursor-pointer">
                <span className="text-xs">عُهد + سُلف</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* ── Quick links footer ───────────────────────────────────── */}
      <Card className="bg-muted/30">
        <CardContent className="p-3">
          <p className="text-xs font-semibold mb-2">روابط سريعة</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="text-xs h-7"><Link href="/finance/period-close-preflight">إقفال الفترة</Link></Button>
            <Button asChild variant="outline" size="sm" className="text-xs h-7"><Link href="/finance/budget-variance">انحراف الميزانية</Link></Button>
            <Button asChild variant="outline" size="sm" className="text-xs h-7"><Link href="/finance/fx-revaluation">إعادة تقييم العملات</Link></Button>
            <Button asChild variant="outline" size="sm" className="text-xs h-7"><Link href="/finance/cash-flow-forecast">توقع التدفق النقدي</Link></Button>
            <Button asChild variant="outline" size="sm" className="text-xs h-7"><Link href="/finance/reports/vat-reconciliation">تطابق VAT</Link></Button>
            <Button asChild variant="outline" size="sm" className="text-xs h-7"><Link href="/finance/settings">إعدادات المالي</Link></Button>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
