import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatNumber, todayLocal } from "@/lib/formatters";
import {
  Activity, Clock, TrendingUp, RefreshCw, ExternalLink,
  AlertCircle, Calendar,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { DateRangePresets } from "@/components/shared/date-range-presets";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

/**
 * Posting Activity Today — real-time view of GL posts.
 *
 * Surfaces:
 *  - Latest 100 posted JEs in chosen date range
 *  - Total debits / credits today
 *  - Posts by source-type breakdown
 *  - Unusual amounts flagged (top 5% by absolute value)
 *
 * CFO uses this to monitor what posted, spot anomalies, and trigger
 * investigation. Replaces "grep audit_logs" with a live feed.
 */

interface JournalEntry {
  id: number;
  ref: string;
  description: string | null;
  type: string;
  status: string;
  balancesApplied: boolean;
  reversedById: number | null;
  sourceType: string | null;
  sourceId: number | null;
  createdAt: string;
  postedAt: string | null;
  postedBy: number | null;
  total?: number | string;
  totalDebit?: number | string;
}

const TYPE_LABEL: Record<string, string> = {
  manual:              "يدوي",
  invoice:             "فاتورة مبيعات",
  supplier_invoice:    "فاتورة مورد",
  expense:             "مصروف",
  voucher:             "سند",
  payment:             "دفع",
  receipt:             "قبض",
  reversal:            "عكس",
  fx_revaluation:      "إعادة تقييم عملة",
  customer_advance:    "دفعة مقدمة",
  bad_debt_provision:  "مخصص ديون مشكوك",
  depreciation:        "إهلاك",
  year_end_close:      "إقفال سنة",
  opening_balance:     "رصيد افتتاحي",
};

const TYPE_COLOR: Record<string, string> = {
  manual:              "bg-blue-100 text-blue-800",
  invoice:             "bg-emerald-100 text-emerald-800",
  supplier_invoice:    "bg-amber-100 text-amber-800",
  expense:             "bg-red-100 text-red-800",
  voucher:             "bg-purple-100 text-purple-800",
  payment:             "bg-purple-100 text-purple-800",
  receipt:             "bg-emerald-100 text-emerald-800",
  reversal:            "bg-orange-100 text-orange-800",
  fx_revaluation:      "bg-cyan-100 text-cyan-800",
  customer_advance:    "bg-emerald-100 text-emerald-800",
  bad_debt_provision:  "bg-red-100 text-red-800",
  depreciation:        "bg-amber-100 text-amber-800",
  year_end_close:      "bg-purple-100 text-purple-800",
  opening_balance:     "bg-gray-100 text-gray-700",
};

function todayIso(): string {
  return todayLocal();
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "الآن";
  if (min < 60) return `قبل ${min} دقيقة`;
  const h = Math.round(min / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const days = Math.round(h / 24);
  return `قبل ${days} يوم`;
}

export default function PostingActivityPage() {
  const today = todayIso();
  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");

  const qs = new URLSearchParams();
  if (fromDate) qs.set("from", fromDate);
  if (toDate)   qs.set("to", toDate);
  if (typeFilter) qs.set("type", typeFilter);
  if (sourceFilter) qs.set("sourceType", sourceFilter);
  qs.set("limit", "100");

  const { data, isLoading, isError, refetch, isFetching } = useApiQuery<{ data: JournalEntry[] }>(
    ["posting-activity", fromDate, toDate, typeFilter, sourceFilter],
    `/finance/journal?${qs.toString()}`,
  );

  const rows: JournalEntry[] = data?.data ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  const byType = useMemo(() => {
    const m = new Map<string, { count: number; amount: number }>();
    for (const r of rows) {
      const cur = m.get(r.type) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Number(r.totalDebit ?? r.total ?? 0);
      m.set(r.type, cur);
    }
    return Array.from(m.entries()).map(([type, v]) => ({ type, ...v })).sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const bySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const s = r.sourceType ?? "(يدوي)";
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return Array.from(m.entries()).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
  }, [rows]);

  if (isLoading) return <LoadingSpinner />;

  // ── Aggregates
  const amounts = rows.map((r) => Number(r.totalDebit ?? r.total ?? 0));
  const totalAmount = amounts.reduce((s, a) => s + a, 0);
  const reversals = rows.filter((r) => r.type === "reversal").length;
  const manuals = rows.filter((r) => r.type === "manual").length;
  const reversed = rows.filter((r) => r.reversedById != null).length;

  // Unusual = top 5% by amount
  const sortedAmounts = [...amounts].sort((a, b) => b - a);
  const top5Threshold = sortedAmounts[Math.max(0, Math.floor(sortedAmounts.length * 0.05) - 1)] ?? 0;
  const unusualIds = new Set(
    rows
      .filter((r) => Number(r.totalDebit ?? r.total ?? 0) >= top5Threshold && top5Threshold > 0)
      .map((r) => r.id)
  );

  const cols: DataTableColumn<JournalEntry>[] = [
    {
      key: "postedAt",
      header: "الوقت",
      render: (r) => {
        const t = r.postedAt ?? r.createdAt;
        return (
          <div className="flex flex-col">
            <span className="text-xs font-mono">{new Date(t).toLocaleTimeString("ar-SA")}</span>
            <span className="text-[10px] text-muted-foreground">{relTime(t)}</span>
          </div>
        );
      },
    },
    {
      key: "ref",
      header: "المرجع",
      render: (r) => (
        <Link href={`/finance/journal/${r.id}`}
          className="font-mono text-xs text-status-info-foreground hover:underline inline-flex items-center gap-1">
          {r.ref}
          <ExternalLink className="h-3 w-3" />
        </Link>
      ),
    },
    {
      key: "type",
      header: "النوع",
      render: (r) => (
        <Badge className={`text-[10px] ${TYPE_COLOR[r.type] ?? "bg-gray-100"}`}>
          {TYPE_LABEL[r.type] ?? r.type}
        </Badge>
      ),
    },
    {
      key: "description",
      header: "الوصف",
      render: (r) => (
        <span className="text-xs text-muted-foreground line-clamp-1 max-w-md">
          {r.description ?? "—"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "المبلغ",
      render: (r) => {
        const v = Number(r.totalDebit ?? r.total ?? 0);
        const unusual = unusualIds.has(r.id);
        return (
          <span className={`font-mono text-xs ${unusual ? "font-bold text-amber-700" : "font-semibold"}`}>
            {formatCurrency(v)}
            {unusual && <AlertCircle className="h-3 w-3 inline ms-1 text-amber-600" />}
          </span>
        );
      },
    },
    {
      key: "source",
      header: "المصدر",
      render: (r) => r.sourceType
        ? (
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px]">{r.sourceType}</Badge>
            {r.sourceId && <span className="font-mono text-[10px] text-muted-foreground">#{r.sourceId}</span>}
          </div>
        )
        : <span className="text-muted-foreground italic text-xs">يدوي</span>,
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => {
        if (r.reversedById) return <Badge className="bg-orange-100 text-orange-800 text-[10px]">معكوس</Badge>;
        if (!r.balancesApplied) return <Badge variant="outline" className="text-[10px]">غير مرحَّل</Badge>;
        return <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">مرحَّل</Badge>;
      },
    },
  ];

  return (
    <PageShell
      title="نشاط الترحيل المحاسبي اليومي"
      subtitle="نشاط الترحيل اللحظي — كل قيد رُحِّل اليوم، من أنشأه، كم بلغ، وهل هو غير اعتيادي"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/journal", label: "القيود" },
        { label: "نشاط اليوم" },
      ]}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 me-1 ${isFetching ? "animate-spin" : ""}`} />
            تحديث
          </Button>
          <PrintButton
            entityType="report_finance_posting_activity"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "نشاط الترحيل المحاسبي", total: printRows.length },
              items: printRows.map((r) => ({
                "المرجع": r.ref || `#${r.id}`,
                "الوصف": r.description || "—",
                "النوع": TYPE_LABEL[r.type] || r.type,
                "المبلغ": Number(r.totalDebit ?? r.total ?? 0),
                "تاريخ الترحيل": r.postedAt || r.createdAt || "—",
                "الحالة": r.status || "—",
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
            <Activity className="h-4 w-4" /> ليش هذي الصفحة؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            CFO + chief accountant يحتاجون نظرة لحظية لما يحدث في الـ GL: قيود
            يدوية جديدة، انعكاسات، عكسات، مبالغ غير اعتيادية. هذي الصفحة feed
            حي للنشاط مع علامة <AlertCircle className="h-3 w-3 inline text-amber-600" /> للقيم
            في أعلى 5% من المبلغ — هذي يحتاج المراجعة الفورية.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Activity className="h-3 w-3" /> قيود رُحِّلت
            </p>
            <p className="text-lg font-bold font-mono">{formatNumber(rows.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <TrendingUp className="h-3 w-3" /> إجمالي حجم
            </p>
            <p className="text-lg font-bold font-mono">{formatCurrency(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card className={manuals > 0 ? "border-blue-300" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">قيود يدوية</p>
            <p className={`text-lg font-bold font-mono ${manuals > 0 ? "text-blue-700" : ""}`}>
              {formatNumber(manuals)}
            </p>
          </CardContent>
        </Card>
        <Card className={(reversals + reversed) > 0 ? "border-orange-300" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">عكسات + قيود معكوسة</p>
            <p className={`text-lg font-bold font-mono ${(reversals + reversed) > 0 ? "text-orange-700" : ""}`}>
              {formatNumber(reversals + reversed)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-3">
        <CardContent className="p-3 flex flex-col gap-2">
          <DateRangePresets
            value={{ from: fromDate, to: toDate }}
            onChange={(r) => { setFromDate(r.from); setToDate(r.to); }}
            testidPrefix="posting-activity-preset"
            hideAllTime
          />
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> من</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-36" />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> إلى</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 w-36" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setFromDate(todayIso()); setToDate(todayIso()); }}>
              <Clock className="h-3 w-3 me-1" /> اليوم فقط
            </Button>
            {(typeFilter || sourceFilter) && (
              <Button variant="ghost" size="sm" onClick={() => { setTypeFilter(""); setSourceFilter(""); }}>
                مسح الفلاتر
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">القيود ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={cols} data={rows}
              onSortedDataChange={setPrintRows}
              pageSize={30}
              emptyMessage="ما في قيود في هذا النطاق الزمني"
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">حسب النوع</CardTitle>
            </CardHeader>
            <CardContent className="p-2 space-y-1">
              {byType.length === 0
                ? <p className="text-xs text-muted-foreground text-center py-2">لا توجد بيانات</p>
                : byType.map((b) => (
                  <button key={b.type}
                    onClick={() => setTypeFilter(typeFilter === b.type ? "" : b.type)}
                    className={`w-full text-start p-1.5 rounded text-xs hover:bg-muted/40 transition ${
                      typeFilter === b.type ? "bg-muted" : ""
                    }`}>
                    <div className="flex items-center justify-between">
                      <Badge className={`text-[10px] ${TYPE_COLOR[b.type] ?? "bg-gray-100"}`}>
                        {TYPE_LABEL[b.type] ?? b.type}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">{b.count}</span>
                    </div>
                    <p className="text-[10px] font-mono text-end mt-0.5">{formatCurrency(b.amount)}</p>
                  </button>
                ))
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">حسب المصدر</CardTitle>
            </CardHeader>
            <CardContent className="p-2 space-y-1">
              {bySource.length === 0
                ? <p className="text-xs text-muted-foreground text-center py-2">لا توجد بيانات</p>
                : bySource.map((b) => (
                  <button key={b.source}
                    onClick={() => {
                      if (b.source === "(يدوي)") return;
                      setSourceFilter(sourceFilter === b.source ? "" : b.source);
                    }}
                    className={`w-full flex items-center justify-between p-1.5 rounded text-xs hover:bg-muted/40 ${
                      sourceFilter === b.source ? "bg-muted" : ""
                    }`}>
                    <Badge variant="outline" className="text-[10px]">{b.source}</Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">{b.count}</span>
                  </button>
                ))
              }
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="p-3 text-xs text-muted-foreground">
          <p>💡 نصيحة: انقر badge "حسب النوع" أو "حسب المصدر" في الـ side panel
          ليصبح فلتر — يخصِّص الجدول لذلك النوع/المصدر فقط.</p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
