import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import {
  AlertTriangle, ShieldAlert, Users, TrendingUp,
  ChevronRight, Phone, Megaphone, Clock, FileWarning,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { ParetoMarker, computeParetoCumulative } from "@/components/shared/pareto-marker";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

/**
 * Customer Risk Dashboard — concentration + behavior analysis
 *
 * Answers three credit-risk questions:
 *
 * 1. CONCENTRATION: "What % of my AR is from the top 5 customers?"
 *    A top-heavy AR portfolio = a single default could be catastrophic.
 *
 * 2. CHRONIC LATENESS: "Which customers always pay late?" — these are
 *    the ones to put on hold or require prepayment.
 *
 * 3. OUTSTANDING + AGING: For each customer in the top list, how much
 *    is outstanding and how old.
 *
 * Combines:
 *  - GET /finance/receivables (open AR per customer)
 *  - GET /finance/collection  (overdue invoices with daysOverdue)
 */

interface ArReceivableRow {
  clientId?: number;
  clientName?: string;
  totalOutstanding?: number | string;
  // shape may vary; treat as best-effort
  [k: string]: any;
}

interface OverdueInvoice {
  id: number;
  ref: string;
  clientName: string | null;
  clientPhone: string | null;
  total: number | string;
  paidAmount: number | string;
  daysOverdue: number;
  currentStage: number;
}

interface CustomerAggregate {
  clientName: string;
  outstandingAmount: number;
  overdueAmount: number;
  invoiceCount: number;
  overdueCount: number;
  maxDaysOverdue: number;
  avgDaysOverdue: number;
  phone: string | null;
  shareOfTotal: number;
  riskScore: number;        // 0-100; 100 = highest risk
  riskBand: "low" | "med" | "high" | "critical";
}

function classifyRisk(c: Pick<CustomerAggregate, "overdueAmount" | "outstandingAmount" | "maxDaysOverdue" | "overdueCount">): { score: number; band: CustomerAggregate["riskBand"] } {
  const overduePct = c.outstandingAmount > 0 ? (c.overdueAmount / c.outstandingAmount) * 100 : 0;
  // Score combines: % overdue (40%) + maxDays (40%) + count (20%)
  const overdueScore = Math.min(40, overduePct * 0.4);
  const daysScore = Math.min(40, c.maxDaysOverdue * 0.5);
  const countScore = Math.min(20, c.overdueCount * 4);
  const score = Math.round(overdueScore + daysScore + countScore);
  const band: CustomerAggregate["riskBand"] =
    score >= 70 ? "critical"
    : score >= 40 ? "high"
    : score >= 20 ? "med"
    : "low";
  return { score, band };
}

const BAND_LABEL: Record<CustomerAggregate["riskBand"], string> = {
  low: "منخفض",
  med: "متوسط",
  high: "مرتفع",
  critical: "حرج",
};

const BAND_COLOR: Record<CustomerAggregate["riskBand"], string> = {
  low:      "bg-emerald-100 text-emerald-800",
  med:      "bg-blue-100 text-blue-800",
  high:     "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
};

export default function CustomerRiskPage() {
  const [bandFilter, setBandFilter] = useState<string>("");

  const { data: receivablesResp, isLoading: arLoading } =
    useApiQuery<any>(["customer-risk-ar"], `/finance/receivables`);

  const { data: collectionData, isLoading: collLoading } =
    useApiQuery<any>(["customer-risk-overdue"], `/finance/collection`);

  // ── Aggregate per-customer
  const customers: CustomerAggregate[] = useMemo(() => {
    const overdueList: OverdueInvoice[] = Array.isArray(collectionData?.data)
      ? collectionData.data
      : Array.isArray(collectionData)
        ? collectionData
        : [];

    // Try to read AR receivables shape — fall back to empty
    const arList: ArReceivableRow[] = Array.isArray(receivablesResp?.data)
      ? receivablesResp.data
      : Array.isArray(receivablesResp)
        ? receivablesResp
        : [];

    const map = new Map<string, CustomerAggregate>();

    // Seed from AR list (open balances)
    for (const r of arList) {
      const name = String(r.clientName ?? r.name ?? `#${r.clientId ?? "?"}`);
      const outstanding = Number(r.totalOutstanding ?? r.outstandingAmount ?? r.balance ?? 0);
      if (!map.has(name)) {
        map.set(name, {
          clientName: name,
          outstandingAmount: 0,
          overdueAmount: 0,
          invoiceCount: 0,
          overdueCount: 0,
          maxDaysOverdue: 0,
          avgDaysOverdue: 0,
          phone: r.clientPhone ?? null,
          shareOfTotal: 0,
          riskScore: 0,
          riskBand: "low",
        });
      }
      const cur = map.get(name)!;
      cur.outstandingAmount += outstanding;
      cur.invoiceCount += 1;
    }

    // Overlay overdue facts
    const daysAccumByCustomer = new Map<string, number[]>();
    for (const inv of overdueList) {
      const name = inv.clientName ?? "—";
      const outstanding = Number(inv.total ?? 0) - Number(inv.paidAmount ?? 0);
      if (outstanding <= 0) continue;
      if (!map.has(name)) {
        map.set(name, {
          clientName: name,
          outstandingAmount: 0,
          overdueAmount: 0,
          invoiceCount: 0,
          overdueCount: 0,
          maxDaysOverdue: 0,
          avgDaysOverdue: 0,
          phone: inv.clientPhone,
          shareOfTotal: 0,
          riskScore: 0,
          riskBand: "low",
        });
      }
      const cur = map.get(name)!;
      // Ensure outstandingAmount at least covers the overdue (if AR list was empty)
      if (cur.outstandingAmount < outstanding) cur.outstandingAmount = outstanding;
      cur.overdueAmount += outstanding;
      cur.overdueCount += 1;
      cur.maxDaysOverdue = Math.max(cur.maxDaysOverdue, Number(inv.daysOverdue));
      const arr = daysAccumByCustomer.get(name) ?? [];
      arr.push(Number(inv.daysOverdue));
      daysAccumByCustomer.set(name, arr);
      if (!cur.phone && inv.clientPhone) cur.phone = inv.clientPhone;
    }

    // Compute averages + risk
    const all = Array.from(map.values());
    const totalOutstanding = all.reduce((s, c) => s + c.outstandingAmount, 0);

    for (const c of all) {
      const days = daysAccumByCustomer.get(c.clientName) ?? [];
      c.avgDaysOverdue = days.length > 0 ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : 0;
      c.shareOfTotal = totalOutstanding > 0 ? (c.outstandingAmount / totalOutstanding) * 100 : 0;
      const r = classifyRisk(c);
      c.riskScore = r.score;
      c.riskBand = r.band;
    }

    return all
      .filter((c) => c.outstandingAmount > 0)
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount);
  }, [receivablesResp, collectionData]);

  // ── Concentration metrics
  const totalAr = customers.reduce((s, c) => s + c.outstandingAmount, 0);
  const top1Share = customers[0]?.shareOfTotal ?? 0;
  const top5Share = customers.slice(0, 5).reduce((s, c) => s + c.shareOfTotal, 0);
  const criticalCount = customers.filter((c) => c.riskBand === "critical").length;
  const highCount = customers.filter((c) => c.riskBand === "high").length;
  const totalOverdue = customers.reduce((s, c) => s + c.overdueAmount, 0);

  const filtered = bandFilter ? customers.filter((c) => c.riskBand === bandFilter) : customers;
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  // Pareto cumulative on outstanding — `customers` is already
  // outstanding-DESC. Crown marks the row crossing 80%: the operator
  // gets "these N customers carry 80% of total AR — collect THESE
  // first, the long tail can wait."
  const { cumulativePcts: arCumulativePcts, thresholdIdx: arThresholdIdx } =
    computeParetoCumulative(customers.map((c) => c.outstandingAmount), 80);
  const cumulativeByName = new Map(
    customers.map((c, i) => [c.clientName, { pct: arCumulativePcts[i] ?? 0, isThreshold: i === arThresholdIdx }]),
  );

  if (arLoading || collLoading) return <LoadingSpinner />;


  const cols: DataTableColumn<CustomerAggregate>[] = [
    {
      key: "clientName",
      header: "العميل",
      render: (c) => (
        <div className="flex flex-col">
          <span className="text-xs font-medium">{c.clientName}</span>
          {c.phone && (
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <Phone className="h-2.5 w-2.5" /> {c.phone}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "outstandingAmount",
      header: "إجمالي المستحق",
      render: (c) => (
        <span className="font-mono text-xs font-semibold">{formatCurrency(c.outstandingAmount)}</span>
      ),
    },
    {
      key: "shareOfTotal",
      header: "% من الإجمالي",
      render: (c) => {
        const intense = c.shareOfTotal >= 20 ? "text-red-700 font-bold"
          : c.shareOfTotal >= 10 ? "text-amber-700 font-semibold"
          : "";
        return (
          <div className="flex items-center gap-2">
            <span className={`font-mono text-xs ${intense}`}>{c.shareOfTotal.toFixed(1)}%</span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[40px] max-w-[80px]">
              <div className={`h-full ${
                c.shareOfTotal >= 20 ? "bg-red-500"
                : c.shareOfTotal >= 10 ? "bg-amber-500"
                : "bg-emerald-500"
              }`} style={{ width: `${Math.min(c.shareOfTotal, 100)}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: "_arPareto",
      header: "حصة تراكمية",
      render: (c) => {
        const e = cumulativeByName.get(c.clientName);
        return (
          <ParetoMarker
            cumulativePct={e?.pct ?? 0}
            isThresholdRow={e?.isThreshold ?? false}
            testidPrefix={`customer-risk-pareto-${c.clientName}`}
          />
        );
      },
    },
    {
      key: "overdueAmount",
      header: "المتأخر منه",
      render: (c) => c.overdueAmount === 0
        ? <span className="text-muted-foreground italic text-xs">—</span>
        : <span className="font-mono text-xs text-red-700 font-semibold">
            {formatCurrency(c.overdueAmount)}
          </span>,
    },
    {
      key: "overdueCount",
      header: "فواتير متأخرة",
      render: (c) => c.overdueCount === 0
        ? <span className="text-muted-foreground italic text-xs">0</span>
        : <Badge className="bg-red-100 text-red-800 text-[10px]">{c.overdueCount}</Badge>,
    },
    {
      key: "maxDaysOverdue",
      header: "أسوأ تأخر",
      render: (c) => {
        const d = c.maxDaysOverdue;
        if (d === 0) return <span className="text-muted-foreground italic text-xs">—</span>;
        const color = d >= 60 ? "text-red-700 font-bold" : d >= 30 ? "text-red-700" : d >= 14 ? "text-amber-700" : "text-orange-600";
        return <span className={`font-mono text-xs ${color}`}>{d} يوم</span>;
      },
    },
    {
      key: "avgDaysOverdue",
      header: "متوسط التأخر",
      render: (c) => c.avgDaysOverdue === 0
        ? <span className="text-muted-foreground italic text-xs">—</span>
        : <span className="font-mono text-xs">{c.avgDaysOverdue} يوم</span>,
    },
    {
      key: "riskBand",
      header: "تصنيف المخاطر",
      render: (c) => (
        <div className="flex items-center gap-2">
          <Badge className={`text-[10px] ${BAND_COLOR[c.riskBand]}`}>{BAND_LABEL[c.riskBand]}</Badge>
          <span className="font-mono text-[10px] text-muted-foreground">{c.riskScore}</span>
        </div>
      ),
    },
    {
      key: "_actions",
      header: "الإجراء",
      render: (c) => (
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link href="/finance/collection">
              <Megaphone className="h-3 w-3 me-1" /> تحصيل
            </Link></Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="تحليل مخاطر العملاء"
      subtitle="تركّز الذمم + سلوك السداد + إنذار العملاء المتأخرين تكراراً — مفتاح إدارة الائتمان"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/receivables", label: "الذمم" },
        { label: "تحليل المخاطر" },
      ]}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/ar-collection-workbench">
              <Phone className="h-3.5 w-3.5 ml-1" />
              منضدة التحصيل
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/ar-aging">
              <Clock className="h-3.5 w-3.5 ml-1" />
              تقادم الذمم
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/bad-debt-provision">
              <FileWarning className="h-3.5 w-3.5 ml-1" />
              الديون المشكوك بها
            </Link></Button>
          <PrintButton
            entityType="report_finance_customer_risk"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "تحليل مخاطر العملاء", total: printRows.length },
              items: printRows.map((c: any) => ({
                "العميل": c.clientName || "—",
                "الرصيد القائم": Number(c.outstandingAmount ?? 0),
                "المتأخر": Number(c.overdueAmount ?? 0),
                "% من إجمالي AR": (Number(c.shareOfTotal ?? 0) * 100).toFixed(1),
                "أسوأ تأخر (أيام)": c.maxDaysOverdue ?? 0,
                "عدد الفواتير المتأخرة": c.overdueCount ?? 0,
                "درجة المخاطر": c.riskScore ?? 0,
                "التصنيف": c.riskBand || "—",
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
            <ShieldAlert className="h-4 w-4" /> ثلاث أسئلة جوهرية للائتمان
          </p>
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
            <li><strong>التركّز</strong>: ما نسبة AR من أكبر 5 عملاء؟ تخطّي 50% = خطر تركّز عالي</li>
            <li><strong>التأخّر المزمن</strong>: أي عملاء يدفعون متأخراً دائماً؟ هؤلاء يحتاجون إيقاف أو دفع مقدّم</li>
            <li><strong>المتبقي + الأعمار</strong>: لكل عميل، كم المتأخر منه + أسوأ تأخر تاريخي</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>منهجية تصنيف المخاطر:</strong> النقاط = (نسبة التأخّر × 0.4) + (أقصى أيام التأخّر × 0.5) + (عدد المتأخرات × 4)،
            يحدد التصنيف: حرج ≥70 / مرتفع ≥40 / متوسط ≥20 / منخفض.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Users className="h-3 w-3" /> عملاء بمستحقات
            </p>
            <p className="text-lg font-bold font-mono">{formatNumber(customers.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي AR</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(totalAr)}</p>
          </CardContent>
        </Card>
        <Card className={top5Share > 50 ? "border-amber-300" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" /> تركّز أعلى ٥
            </p>
            <p className={`text-lg font-bold font-mono ${top5Share > 70 ? "text-red-700" : top5Share > 50 ? "text-amber-700" : ""}`}>
              {top5Share.toFixed(1)}%
            </p>
            <p className="text-[9px] text-muted-foreground">الأعلى = {top1Share.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card className={totalOverdue > 0 ? "border-red-300" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي متأخر</p>
            <p className={`text-lg font-bold font-mono ${totalOverdue > 0 ? "text-red-700" : ""}`}>
              {formatCurrency(totalOverdue)}
            </p>
            <p className="text-[9px] text-muted-foreground">
              {totalAr > 0 ? `${((totalOverdue / totalAr) * 100).toFixed(1)}% من AR` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className={criticalCount > 0 ? "border-red-400 bg-red-50/30" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> عملاء حرجة
            </p>
            <p className={`text-lg font-bold font-mono ${criticalCount > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {formatNumber(criticalCount)}
            </p>
            <p className="text-[9px] text-muted-foreground">+ {formatNumber(highCount)} مرتفع</p>
          </CardContent>
        </Card>
      </div>

      {top5Share > 50 && (
        <Card className="mb-4 border-amber-400 bg-amber-50/30">
          <CardContent className="p-3 text-sm flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-5 w-5" />
            <span>
              <strong>تنبيه تركّز:</strong> أكبر 5 عملاء يمثلون {top5Share.toFixed(1)}% من إجمالي الذمم —
              تأكد من سياسة ائتمانية صارمة + ضمانات + متابعة لصيقة للأعلى تركّزاً.
            </span>
          </CardContent>
        </Card>
      )}

      {/* ── Band Filters ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-muted-foreground">تصنيف المخاطر:</span>
        <Badge variant={bandFilter === "" ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => setBandFilter("")}>الكل ({customers.length})</Badge>
        {(Object.keys(BAND_LABEL) as Array<CustomerAggregate["riskBand"]>).map((b) => {
          const count = customers.filter((c) => c.riskBand === b).length;
          if (count === 0 && bandFilter !== b) return null;
          return (
            <Badge key={b}
              variant={bandFilter === b ? "default" : "outline"}
              className={`cursor-pointer text-xs ${BAND_COLOR[b]}`}
              onClick={() => setBandFilter(b)}>
              {BAND_LABEL[b]} ({count})
            </Badge>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">العملاء (الأعلى مستحقات أولاً) — {filtered.length}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={filtered}
            onSortedDataChange={setPrintRows}
            pageSize={50}
            emptyMessage="لا يوجد عملاء بمستحقات حالية"
          />
        </CardContent>
      </Card>

      <Card className="mt-4 bg-muted/30">
        <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">إجراءات مقترحة:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><strong>للحرج (≥70):</strong> إيقاف فاتورة جديدة + اجتماع تحصيل عاجل + اعتبار التحويل القانوني</li>
            <li><strong>للمرتفع (≥40):</strong> دفع مقدم على الفواتير الجديدة + متابعة أسبوعية</li>
            <li><strong>لتركّز ≥20%:</strong> تنويع قاعدة العملاء + ضمان بنكي أو فاتورة معتمدة</li>
            <li>راجع هذي الصفحة شهرياً وحدّث سياسة الائتمان وفقاً للنتائج</li>
          </ul>
        </CardContent>
      </Card>
    </PageShell>
  );
}
