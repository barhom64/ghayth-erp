import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  Calendar, Download, AlertTriangle, ChevronRight, TrendingDown,
  Banknote, Users, ExternalLink,
} from "lucide-react";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";

/**
 * AP Payment Calendar — 30-day calendar of upcoming vendor payments
 *
 * Every PO with status='invoice_matched' (i.e. ready to pay) is bucketed
 * into a day on a 30-day calendar starting today. Uses expectedDelivery as
 * the due date (the same field /payment-run/pending sorts by).
 *
 * Operator sees: per-day totals, vendor breakdown, running cash impact
 * cumulative over the period.
 *
 * Endpoint: GET /finance/payment-run/pending
 */

interface PendingPo {
  id: number;
  ref: string;
  totalAmount: number | string;
  createdAt: string;
  expectedDelivery: string | null;
  supplierId: number;
  supplierName: string;
}

interface VendorGroup {
  supplierId: number;
  supplierName: string;
  amount: number;
  count: number;
}

interface PendingResp {
  data: PendingPo[];
  totalDue: number;
  byVendor?: VendorGroup[];
}

interface DayBucket {
  date: string;
  label: string;
  daysOut: number;
  pos: PendingPo[];
  total: number;
  isOverdue: boolean;
  isToday: boolean;
}

function addDaysUtc(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function diffDaysUtc(a: string, b: string): number {
  const da = new Date(a.split("T")[0] + "T00:00:00Z").getTime();
  const db = new Date(b.split("T")[0] + "T00:00:00Z").getTime();
  return Math.round((da - db) / 86400000);
}

export default function ApPaymentCalendarPage() {
  const today = todayLocal();
  const [horizon, setHorizon] = useState<30 | 60 | 90>(30);

  const { data, isLoading } = useApiQuery<PendingResp>(
    ["ap-payment-calendar"],
    `/finance/payment-run/pending`,
  );

  const buckets = useMemo<DayBucket[]>(() => {
    if (!data?.data) return [];
    // Build initial buckets covering horizon days from today + an "overdue" bucket
    const map = new Map<string, DayBucket>();
    for (let i = 0; i < horizon; i++) {
      const date = addDaysUtc(today, i);
      map.set(date, {
        date,
        label: "",
        daysOut: i,
        pos: [],
        total: 0,
        isOverdue: false,
        isToday: i === 0,
      });
    }
    let overdueBucket: DayBucket | null = null;

    for (const po of data.data) {
      // Use expectedDelivery if set; otherwise createdAt + 30 days as default term
      const dueIso = po.expectedDelivery
        ? po.expectedDelivery.split("T")[0]
        : addDaysUtc(po.createdAt.split("T")[0], 30);
      const diff = diffDaysUtc(dueIso, today);
      if (diff < 0) {
        if (!overdueBucket) {
          overdueBucket = {
            date: "overdue",
            label: "متأخر",
            daysOut: -1,
            pos: [],
            total: 0,
            isOverdue: true,
            isToday: false,
          };
        }
        overdueBucket.pos.push(po);
        overdueBucket.total += Number(po.totalAmount);
      } else if (diff < horizon) {
        const b = map.get(dueIso);
        if (b) {
          b.pos.push(po);
          b.total += Number(po.totalAmount);
        }
      }
      // Beyond horizon → silently dropped (out of scope)
    }
    const out: DayBucket[] = [];
    if (overdueBucket) out.push(overdueBucket);
    for (let i = 0; i < horizon; i++) {
      const date = addDaysUtc(today, i);
      const b = map.get(date)!;
      b.label = i === 0 ? "اليوم" : i === 1 ? "غداً" : `بعد ${i} يوم`;
      out.push(b);
    }
    return out;
  }, [data, horizon, today]);

  // Cumulative
  const cumulative = useMemo(() => {
    let sum = 0;
    return buckets.map(b => {
      sum += b.total;
      return { ...b, cumulative: sum };
    });
  }, [buckets]);

  const totalDue = cumulative.length > 0 ? cumulative[cumulative.length - 1]!.cumulative : 0;
  const overdueAmount = buckets.find(b => b.isOverdue)?.total ?? 0;
  const overdueCount = buckets.find(b => b.isOverdue)?.pos.length ?? 0;
  const next7Total = cumulative
    .filter(b => !b.isOverdue && b.daysOut < 7)
    .reduce((s, b) => s + b.total, 0);

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push("التاريخ,الوصف,أيام,عدد POs,إجمالي اليوم,تراكمي");
    for (const b of cumulative) {
      lines.push([
        b.date,
        b.isOverdue ? "متأخر" : b.label,
        b.daysOut.toString(),
        b.pos.length.toString(),
        b.total.toFixed(2),
        b.cumulative.toFixed(2),
      ].join(","));
    }
    lines.push("");
    lines.push("تفاصيل POs المتأخرة والمستحقة");
    lines.push("التاريخ,المرجع,المورد,المبلغ");
    for (const b of cumulative) {
      for (const po of b.pos) {
        lines.push([
          b.date,
          po.ref,
          (po.supplierName ?? "").replace(/,/g, "،"),
          Number(po.totalAmount).toFixed(2),
        ].join(","));
      }
    }
    // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
    // Routed through unified export helper for audit + letterhead.
    {
      const _allLines = lines;
      const _headers = (_allLines[0] ?? "").split(",");
      const _rows = _allLines.slice(1).map((line) => {
        const parts = line.split(",");
        const obj: Record<string, string> = {};
        _headers.forEach((h, i) => { obj[h] = parts[i] ?? ""; });
        return obj;
      });
      void exportRowsToCsv({
        entityType: "report_ap_payment_calendar",
        title: String(`ap-calendar-${today}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="تقويم الدفعات للموردين"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "تقويم الدفعات للموردين" },
      ]}
      subtitle={`${horizon} يوم قادمة — ما الذي سيخرج من البنك ومتى؟`}
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الأفق الزمني</label>
            <div className="flex gap-1">
              {[30, 60, 90].map(h => (
                <Button
                  key={h}
                  variant={horizon === h ? "default" : "outline"}
                  size="sm"
                  onClick={() => setHorizon(h as 30 | 60 | 90)}
                >
                  {h} يوم
                </Button>
              ))}
            </div>
          </div>
          <div className="flex-1" />
          <Button asChild variant="outline" size="sm"><Link href="/finance/payment-run">
              <Banknote className="w-4 h-4 ml-1" />
              فتح Payment Run
            </Link></Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
            <Download className="w-4 h-4 ml-1" />
            CSV
          </Button>
          <PrintButton
            entityType="report_ap_payment_calendar"
            entityId={today}
            payload={{
              entity: {
                title: "تقويم مواعيد الدفع للموردين",
                asOfDate: today,
                totalDue: Number(data?.totalDue ?? 0),
                vendorCount: data?.byVendor?.length ?? 0,
                poCount: data?.data?.length ?? 0,
              },
              items: (data?.data ?? []).map((po: any) => ({
                "أمر الشراء": po.ref ?? "",
                "المورد": po.supplierName ?? "",
                "المبلغ": Number(po.totalAmount ?? 0),
                "تاريخ التسليم المتوقع": po.expectedDelivery ?? "",
              })),
            }}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card className={overdueAmount > 0 ? "border-status-danger-foreground border-2" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-status-danger-foreground" />
                  متأخر
                </div>
                <div className={`text-xl font-bold tabular-nums ${overdueAmount > 0 ? "text-status-danger-foreground" : ""}`}>
                  {formatCurrency(overdueAmount)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{overdueCount} PO</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  خلال 7 أيام
                </div>
                <div className="text-xl font-bold tabular-nums">{formatCurrency(next7Total)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">يتطلب توفر سيولة عاجل</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" />
                  إجمالي {horizon} يوم
                </div>
                <div className="text-xl font-bold tabular-nums">{formatCurrency(totalDue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  موردون نشطون
                </div>
                <div className="text-xl font-bold tabular-nums">{data?.byVendor?.length ?? 0}</div>
              </CardContent>
            </Card>
          </div>

          {/* Calendar timeline */}
          {buckets.every(b => b.pos.length === 0) ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                لا توجد POs قيد الدفع. كل الفواتير المُطابقة دُفعت.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  الجدول اليومي
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {cumulative.filter(b => b.pos.length > 0).map(b => {
                    const urgency =
                      b.isOverdue ? "danger" :
                      b.daysOut === 0 ? "warning" :
                      b.daysOut < 7 ? "info" : "muted";
                    const styles = {
                      danger: "border-status-danger-foreground bg-status-danger-surface",
                      warning: "border-status-warning-foreground bg-status-warning-surface",
                      info: "border-status-info-foreground",
                      muted: "border-border",
                    }[urgency];
                    return (
                      <div key={b.date} className={`border rounded p-3 ${styles}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="text-center min-w-20">
                              <div className="text-xs text-muted-foreground">{b.isOverdue ? "—" : formatDateAr(b.date)}</div>
                              <div className="font-bold text-sm">{b.isOverdue ? "متأخر" : b.label}</div>
                            </div>
                            <Badge variant="outline" className="font-mono">
                              {b.pos.length} PO
                            </Badge>
                          </div>
                          <div className="text-end">
                            <div className="font-bold tabular-nums">{formatCurrency(b.total)}</div>
                            <div className="text-[11px] text-muted-foreground">
                              تراكمي: {formatCurrency(b.cumulative)}
                            </div>
                          </div>
                        </div>
                        <div className="border-t pt-2 space-y-1">
                          {b.pos.slice(0, 5).map(po => (
                            <Link key={po.id} href={`/finance/purchase-orders/${po.id}`}>
                              <div className="flex items-center justify-between text-xs hover:bg-muted/30 rounded px-2 py-1 cursor-pointer">
                                <div className="flex items-center gap-2 min-w-0">
                                  <code className="font-mono shrink-0">{po.ref}</code>
                                  <span className="truncate text-muted-foreground">{po.supplierName}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="tabular-nums font-semibold">{formatCurrency(Number(po.totalAmount))}</span>
                                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                </div>
                              </div>
                            </Link>
                          ))}
                          {b.pos.length > 5 && (
                            <div className="text-xs text-muted-foreground px-2 py-1">
                              + {b.pos.length - 5} POs أخرى...
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top vendors */}
          {(data?.byVendor?.length ?? 0) > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  أعلى الموردين بالمستحق
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  noToolbar
                  pageSize={0}
                  rowKey={(v) => v.supplierId}
                  data={(data?.byVendor ?? []).slice().sort((a, b) => b.amount - a.amount).slice(0, 15)}
                  columns={[
                    {
                      key: "supplierName", header: "المورد",
                      render: (v) => (
                        <Link href={`/finance/vendor-360-sheet?vendorId=${v.supplierId}`}>
                          <span className="hover:underline cursor-pointer">{v.supplierName}</span>
                        </Link>
                      ),
                    },
                    {
                      key: "count", header: "أوامر الشراء", align: "end", width: "5rem",
                      render: (v) => <span className="tabular-nums">{v.count}</span>,
                    },
                    {
                      key: "amount", header: "المستحق", align: "end", width: "8rem",
                      render: (v) => <span className="tabular-nums font-semibold">{formatCurrency(v.amount)}</span>,
                    },
                    {
                      key: "_pct", header: "%", align: "end", width: "5rem", sortable: false,
                      render: (v) => (
                        <span className="tabular-nums text-muted-foreground">
                          {totalDue > 0 ? `${((v.amount / totalDue) * 100).toFixed(1)}%` : "—"}
                        </span>
                      ),
                    },
                    {
                      key: "_action", header: "", width: "2rem", sortable: false,
                      render: (v) => (
                        <Button asChild variant="ghost" size="icon" title="التالي" className="h-7 w-7"><Link href={`/finance/vendors/${v.supplierId}`}><ChevronRight className="w-4 h-4" /></Link></Button>
                      ),
                    },
                  ] satisfies DataTableColumn<VendorGroup>[]}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}
