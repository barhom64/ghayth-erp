import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  Banknote, TrendingUp, TrendingDown, AlertTriangle, Calculator,
  Plus, Trash2, ArrowUpCircle, ArrowDownCircle, Calendar,
} from "lucide-react";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * Cash Position Calculator (What-If)
 *
 * Quick liquidity planning tool. Loads current cash from balance sheet,
 * known AR receipts due (from cash-flow-forecast inflows) and AP payments
 * due (from payment-run pending). User can add hypothetical ad-hoc items
 * and project the closing cash over 7/14/30 days.
 *
 * Pure-frontend math layered on top of two existing endpoints.
 *
 * Endpoints:
 *   GET /finance/reports/balance-sheet (current cash)
 *   GET /finance/cash-flow-forecast (known inflows/outflows)
 *   GET /finance/payment-run/pending (vendor payments due)
 */

interface BsResp {
  assets?: { current: { total: number } };
}
interface CfForecastResp {
  currentBalance?: number;
  inflows?: {
    next30?: Array<{ dueDate: string; expected: number; ref?: string; clientName?: string }>;
  };
  outflows?: {
    next30?: Array<{ dueDate: string; expected: number; ref?: string; supplierName?: string }>;
  };
}
interface ApPendingResp {
  data?: Array<{ id: number; ref: string; supplierName?: string; totalAmount: number | string; expectedDelivery?: string | null }>;
  totalDue?: number;
}

interface AdHocItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "in" | "out";
}

let _id = 0;
const nextId = () => `adhoc-${++_id}-${Date.now()}`;

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function diffDays(a: string, b: string): number {
  const ta = new Date(a + "T00:00:00Z").getTime();
  const tb = new Date(b + "T00:00:00Z").getTime();
  return Math.round((ta - tb) / 86400000);
}

export default function CashPositionCalculatorPage() {
  const today = todayLocal();
  const [horizon, setHorizon] = useState<7 | 14 | 30>(7);
  const [adhoc, setAdhoc] = useState<AdHocItem[]>([]);
  const [newDesc, setNewDesc] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newType, setNewType] = useState<"in" | "out">("in");
  const [newDate, setNewDate] = useState(today);

  const bs = useApiQuery<BsResp>(["cpc-bs", today], `/finance/reports/balance-sheet?endDate=${today}`);
  const cf = useApiQuery<CfForecastResp>(["cpc-cf"], `/finance/cash-flow-forecast`);
  const ap = useApiQuery<ApPendingResp>(["cpc-ap"], `/finance/payment-run/pending`);

  const isLoading = bs.isLoading || cf.isLoading || ap.isLoading;
  const startingCash = bs.data?.assets?.current?.total ?? cf.data?.currentBalance ?? 0;

  // Compose known movements within horizon
  const movements = useMemo(() => {
    const out: Array<{ date: string; amount: number; type: "in" | "out"; description: string; source: "known" | "adhoc" }> = [];

    // Known inflows from cash-flow-forecast
    for (const inf of cf.data?.inflows?.next30 ?? []) {
      const date = inf.dueDate?.split("T")[0] ?? today;
      const diff = diffDays(date, today);
      if (diff >= 0 && diff <= horizon) {
        out.push({
          date,
          amount: Number(inf.expected),
          type: "in",
          description: inf.clientName ? `${inf.ref ?? "AR"} — ${inf.clientName}` : (inf.ref ?? "تحصيل متوقع"),
          source: "known",
        });
      }
    }

    // Known outflows: payment-run/pending POs due within horizon
    for (const po of ap.data?.data ?? []) {
      const dueIso = po.expectedDelivery ? po.expectedDelivery.split("T")[0] : addDays(today, 30);
      const diff = diffDays(dueIso, today);
      if (diff >= 0 && diff <= horizon) {
        out.push({
          date: dueIso,
          amount: Number(po.totalAmount),
          type: "out",
          description: `${po.ref} — ${po.supplierName ?? "مورد"}`,
          source: "known",
        });
      }
    }

    // Ad-hoc items
    for (const a of adhoc) {
      const diff = diffDays(a.date, today);
      if (diff >= 0 && diff <= horizon) {
        out.push({
          date: a.date,
          amount: a.amount,
          type: a.type,
          description: a.description,
          source: "adhoc",
        });
      }
    }

    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [cf.data, ap.data, adhoc, horizon, today]);

  // Build day-by-day projection
  const projection = useMemo(() => {
    const days: Array<{
      date: string;
      label: string;
      isToday: boolean;
      inflow: number;
      outflow: number;
      net: number;
      balance: number;
      items: typeof movements;
    }> = [];

    let running = startingCash;
    for (let d = 0; d <= horizon; d++) {
      const date = addDays(today, d);
      const dayMovements = movements.filter(m => m.date === date);
      const inflow = dayMovements.filter(m => m.type === "in").reduce((s, m) => s + m.amount, 0);
      const outflow = dayMovements.filter(m => m.type === "out").reduce((s, m) => s + m.amount, 0);
      const net = inflow - outflow;
      running += net;
      days.push({
        date,
        label: d === 0 ? "اليوم" : d === 1 ? "غداً" : `بعد ${d} يوم`,
        isToday: d === 0,
        inflow,
        outflow,
        net,
        balance: running,
        items: dayMovements,
      });
    }
    return days;
  }, [horizon, today, movements, startingCash]);

  // Visible projection rows: collapse consecutive days with no movements and an
  // unchanged balance (same rule the raw table used) before handing to DataTable.
  const visibleDays = useMemo(
    () => projection.filter((day, i) =>
      !(day.items.length === 0 && i > 0 && projection[i - 1]?.balance === day.balance)
    ),
    [projection],
  );

  const finalBalance = projection.length > 0 ? projection[projection.length - 1]!.balance : startingCash;
  const totalInflow = movements.filter(m => m.type === "in").reduce((s, m) => s + m.amount, 0);
  const totalOutflow = movements.filter(m => m.type === "out").reduce((s, m) => s + m.amount, 0);
  const lowestBalance = Math.min(...projection.map(p => p.balance), startingCash);
  const lowestDay = projection.find(p => p.balance === lowestBalance);
  const goesNegative = lowestBalance < 0;

  const addAdhoc = () => {
    const amt = Number(newAmount);
    if (!newDesc.trim() || amt <= 0) return;
    setAdhoc(prev => [...prev, {
      id: nextId(),
      date: newDate,
      description: newDesc,
      amount: amt,
      type: newType,
    }]);
    setNewDesc("");
    setNewAmount("");
  };

  const removeAdhoc = (id: string) => {
    setAdhoc(prev => prev.filter(a => a.id !== id));
  };

  return (
    <PageShell
      title="حاسبة الوضع النقدي"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "حاسبة الوضع النقدي" },
      ]}
      subtitle="ما هو رصيد البنك بعد X يوم؟ توقع الوضع النقدي مع إمكانية إضافة افتراضات"
      actions={
        <PrintButton
          entityType="report_finance_cash_position_calculator"
          entityId={String(horizon)}
          size="icon"
          payload={{
            entity: { title: `حاسبة الوضع النقدي — ${horizon} يوم`, total: movements.length },
            items: movements.map((m) => ({
              "التاريخ": m.date,
              "النوع": m.type === "in" ? "داخل" : "خارج",
              "المبلغ": Number(m.amount || 0),
              "الوصف": m.description || "—",
              "المصدر": m.source === "known" ? "معروف" : "افتراضي",
            })),
          }}
        />
      }
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">أفق التوقع</label>
            <div className="flex gap-1">
              {[7, 14, 30].map(h => (
                <Button
                  key={h}
                  variant={horizon === h ? "default" : "outline"}
                  size="sm"
                  onClick={() => setHorizon(h as 7 | 14 | 30)}
                >
                  {h} يوم
                </Button>
              ))}
            </div>
          </div>
          <div className="flex-1" />
          <Button asChild variant="outline" size="sm"><Link href="/finance/bank-accounts-watch">
              <Banknote className="w-4 h-4 ml-1" />
              مراقبة البنوك
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/ap-payment-calendar">
              <Calendar className="w-4 h-4 ml-1" />
              تقويم الدفعات
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/cash-13week">
              <TrendingUp className="w-4 h-4 ml-1" />
              توقع 13 أسبوع
            </Link></Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Banknote className="w-3 h-3" />
                  الرصيد الافتتاحي
                </div>
                <div className="text-xl font-bold tabular-nums">{formatCurrency(startingCash)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{formatDateAr(today)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <ArrowUpCircle className="w-3 h-3 text-status-success-foreground" />
                  داخل {horizon} يوم
                </div>
                <div className="text-xl font-bold tabular-nums text-status-success-foreground">
                  +{formatCurrency(totalInflow)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <ArrowDownCircle className="w-3 h-3 text-status-danger-foreground" />
                  خارج {horizon} يوم
                </div>
                <div className="text-xl font-bold tabular-nums text-status-danger-foreground">
                  -{formatCurrency(totalOutflow)}
                </div>
              </CardContent>
            </Card>
            <Card className={goesNegative ? "border-status-danger-foreground border-2" : finalBalance < startingCash ? "border-status-warning-foreground border-2" : "border-status-success-foreground"}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  {finalBalance >= startingCash ? (
                    <TrendingUp className="w-3 h-3 text-status-success-foreground" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-status-danger-foreground" />
                  )}
                  بعد {horizon} يوم
                </div>
                <div className={`text-xl font-bold tabular-nums ${goesNegative ? "text-status-danger-foreground" : finalBalance < startingCash ? "text-status-warning-foreground" : "text-status-success-foreground"}`}>
                  {formatCurrency(finalBalance)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  صافي {finalBalance - startingCash >= 0 ? "+" : ""}{formatCurrency(finalBalance - startingCash)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Negative warning */}
          {goesNegative && (
            <Card className="mb-4 border-status-danger-foreground bg-status-danger-surface">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-status-danger-foreground shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-status-danger-foreground">⚠ تنبيه: الرصيد سيصبح سالباً!</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      أدنى رصيد متوقع: <strong className="text-status-danger-foreground">{formatCurrency(lowestBalance)}</strong>
                      {lowestDay && <span> ({lowestDay.label})</span>}. خطط لإيرادات إضافية أو تأخير المدفوعات.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add ad-hoc item */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="w-4 h-4" />
                إضافة سيناريو افتراضي
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">النوع</label>
                  <div className="flex gap-1">
                    <Button variant={newType === "in" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setNewType("in")}>داخل</Button>
                    <Button variant={newType === "out" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setNewType("out")}>خارج</Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">التاريخ</label>
                  <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">الوصف</label>
                  <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="مثال: قسط قرض / دفعة عقد جديد" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">المبلغ</label>
                  <div className="flex gap-1">
                    <Input type="number" step="0.01" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
                    <Button size="sm" onClick={addAdhoc} disabled={!newDesc.trim() || Number(newAmount) <= 0}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              {adhoc.length > 0 && (
                <div className="mt-3 space-y-1">
                  {adhoc.map(a => (
                    <div key={a.id} className="flex items-center justify-between text-xs border rounded px-2 py-1 bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${a.type === "in" ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                          {a.type === "in" ? "+" : "-"}{formatCurrency(a.amount)}
                        </Badge>
                        <span>{formatDateAr(a.date)}</span>
                        <span className="text-muted-foreground">{a.description}</span>
                      </div>
                      <Button variant="ghost" size="icon" title="حذف" className="h-6 w-6 text-status-danger-foreground" onClick={() => removeAdhoc(a.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Day-by-day projection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                التوقع اليومي
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                noToolbar
                pageSize={0}
                data={visibleDays}
                rowKey={(day) => day.date}
                rowClassName={(day) =>
                  cn(day.isToday && "bg-status-info-surface", day.balance < 0 && "bg-status-danger-surface")
                }
                columns={[
                  {
                    key: "date", header: "اليوم", width: "8rem", ltr: true,
                    render: (day) => (
                      <>
                        <div className="font-medium text-xs">{day.label}</div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">{day.date}</div>
                      </>
                    ),
                  },
                  {
                    key: "inflow", header: "داخل", align: "end", width: "6rem", className: "tabular-nums",
                    render: (day) =>
                      day.inflow > 0
                        ? <span className="text-status-success-foreground">+{formatCurrency(day.inflow)}</span>
                        : "—",
                  },
                  {
                    key: "outflow", header: "خارج", align: "end", width: "6rem", className: "tabular-nums",
                    render: (day) =>
                      day.outflow > 0
                        ? <span className="text-status-danger-foreground">-{formatCurrency(day.outflow)}</span>
                        : "—",
                  },
                  {
                    key: "net", header: "صافي", align: "end", width: "6rem", className: "tabular-nums",
                    render: (day) => (
                      <span className={day.net > 0 ? "text-status-success-foreground" : day.net < 0 ? "text-status-danger-foreground" : ""}>
                        {day.net !== 0 ? (day.net > 0 ? "+" : "") + formatCurrency(day.net) : "—"}
                      </span>
                    ),
                  },
                  {
                    key: "balance", header: "الرصيد المتوقع", align: "end", width: "8rem",
                    className: "tabular-nums font-bold",
                    render: (day) => (
                      <span className={day.balance < 0 ? "text-status-danger-foreground" : ""}>
                        {formatCurrency(day.balance)}
                      </span>
                    ),
                  },
                  {
                    key: "items", header: "حركات اليوم", sortable: false, className: "text-xs",
                    render: (day) =>
                      day.items.length > 0 ? (
                        <ul className="space-y-0.5">
                          {day.items.slice(0, 3).map((it, j) => (
                            <li key={j} className="truncate" title={it.description}>
                              <span className={it.type === "in" ? "text-status-success-foreground" : "text-status-danger-foreground"}>
                                {it.type === "in" ? "+" : "-"}
                              </span>{" "}
                              {it.description}
                              {it.source === "adhoc" && <Badge variant="outline" className="text-[9px] mr-1">افتراضي</Badge>}
                            </li>
                          ))}
                          {day.items.length > 3 && (
                            <li className="text-muted-foreground">+ {day.items.length - 3} حركة أخرى</li>
                          )}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      ),
                  },
                ] satisfies DataTableColumn<(typeof visibleDays)[number]>[]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
