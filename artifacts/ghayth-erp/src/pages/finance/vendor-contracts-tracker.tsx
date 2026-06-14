import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  FileSignature, Calendar, AlertTriangle, CheckCircle2,
  Search, ExternalLink, Download, Clock, ChevronRight,
} from "lucide-react";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";

/**
 * Vendor Contracts Renewal Tracker
 *
 * Daily procurement tool: list every active vendor contract by end-date
 * with countdown to expiry. Color-coded urgency. Helps avoid losing
 * leverage from auto-renewal or unplanned gaps in service.
 *
 * Endpoint: GET /finance/contracts
 */

interface Contract {
  id: number;
  ref?: string;
  vendorId: number | null;
  vendorName?: string | null;
  title?: string;
  description?: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  totalValue?: number | string;
  currency?: string;
  autoRenew?: boolean;
  noticePeriodDays?: number | null;
}
interface ListResp { data: Contract[] }

function diffDays(deadline: string | null | undefined, today: string): number {
  if (!deadline) return Infinity;
  const a = new Date(deadline.split("T")[0] + "T00:00:00Z").getTime();
  const b = new Date(today + "T00:00:00Z").getTime();
  return Math.round((a - b) / 86400000);
}

type Filter = "all" | "expiring" | "expired" | "active";

export default function VendorContractsTrackerPage() {
  const today = todayLocal();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("expiring");
  const [horizonDays, setHorizonDays] = useState<60 | 90 | 180>(90);

  const { data, isLoading } = useApiQuery<ListResp>(
    ["vc-tracker"],
    `/finance/contracts`,
  );

  const annotated = useMemo(() => {
    const rows = data?.data ?? [];
    return rows.map(c => {
      const daysLeft = diffDays(c.endDate, today);
      const urgency: "expired" | "critical" | "warning" | "ok" | "future" =
        daysLeft === Infinity ? "future" :
        daysLeft < 0 ? "expired" :
        daysLeft <= 30 ? "critical" :
        daysLeft <= 90 ? "warning" : "ok";
      // Notice period: if we're within (notice days) of endDate, we MUST decide
      const noticeRequired = c.noticePeriodDays != null && daysLeft <= c.noticePeriodDays && daysLeft >= 0;
      return { ...c, daysLeft, urgency, noticeRequired };
    });
  }, [data, today]);

  const filtered = useMemo(() => {
    let list = annotated;
    if (filter === "expired") list = list.filter(c => c.urgency === "expired");
    else if (filter === "expiring") list = list.filter(c => c.daysLeft <= horizonDays && c.daysLeft >= 0);
    else if (filter === "active") list = list.filter(c => c.urgency !== "expired" && c.status !== "cancelled");
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(c =>
        (c.title ?? "").toLowerCase().includes(s) ||
        (c.vendorName ?? "").toLowerCase().includes(s) ||
        (c.ref ?? "").toLowerCase().includes(s)
      );
    }
    return list.slice().sort((a, b) => a.daysLeft - b.daysLeft);
  }, [annotated, filter, horizonDays, search]);

  const stats = useMemo(() => {
    return {
      total: annotated.length,
      expired: annotated.filter(c => c.urgency === "expired").length,
      critical: annotated.filter(c => c.urgency === "critical").length,
      warning: annotated.filter(c => c.urgency === "warning").length,
      noticeRequired: annotated.filter(c => c.noticeRequired).length,
      totalValue: annotated.reduce((s, c) => s + Number(c.totalValue ?? 0), 0),
      expiringValue: annotated.filter(c => c.daysLeft <= horizonDays && c.daysLeft >= 0).reduce((s, c) => s + Number(c.totalValue ?? 0), 0),
    };
  }, [annotated, horizonDays]);

  const exportCSV = () => {
    if (filtered.length === 0) return;
    const lines: string[] = [];
    lines.push(`عقود الموردين — ${today}`);
    lines.push("");
    lines.push("العنوان,المورد,البداية,النهاية,أيام متبقية,القيمة,تجديد تلقائي,فترة الإشعار,الحالة");
    for (const c of filtered) {
      lines.push([
        (c.title ?? "").replace(/,/g, "،"),
        (c.vendorName ?? "").replace(/,/g, "،"),
        c.startDate?.split("T")[0] ?? "",
        c.endDate?.split("T")[0] ?? "",
        c.daysLeft === Infinity ? "—" : c.daysLeft.toString(),
        Number(c.totalValue ?? 0).toFixed(2),
        c.autoRenew ? "نعم" : "لا",
        c.noticePeriodDays?.toString() ?? "—",
        c.status,
      ].join(","));
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
        entityType: "report_vendor_contracts_tracker",
        title: String(`vendor-contracts-${today}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="متابعة عقود الموردين"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "متابعة عقود الموردين" },
      ]}
      subtitle="عقود تنتهي قريباً — لا تترك مورداً يجدد تلقائياً أو ينتهي بدون تخطيط"
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-48">
              <label className="text-xs text-muted-foreground mb-1 block">بحث</label>
              <div className="relative">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="عنوان أو مورد أو مرجع..."
                  className="pr-9"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الفلتر</label>
              <div className="flex gap-1">
                <Button variant={filter === "expiring" ? "default" : "outline"} size="sm" onClick={() => setFilter("expiring")}>تنتهي</Button>
                <Button variant={filter === "expired" ? "default" : "outline"} size="sm" onClick={() => setFilter("expired")}>منتهية</Button>
                <Button variant={filter === "active" ? "default" : "outline"} size="sm" onClick={() => setFilter("active")}>نشطة</Button>
                <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>الكل</Button>
              </div>
            </div>
            {filter === "expiring" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الأفق</label>
                <div className="flex gap-1">
                  <Button variant={horizonDays === 60 ? "default" : "outline"} size="sm" onClick={() => setHorizonDays(60)}>60 يوم</Button>
                  <Button variant={horizonDays === 90 ? "default" : "outline"} size="sm" onClick={() => setHorizonDays(90)}>90 يوم</Button>
                  <Button variant={horizonDays === 180 ? "default" : "outline"} size="sm" onClick={() => setHorizonDays(180)}>180 يوم</Button>
                </div>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
              <Download className="w-4 h-4 ml-1" />
              CSV
            </Button>
            <PrintButton
              entityType="report_vendor_contracts"
              entityId="all"
              payload={{
                entity: { title: "متابعة عقود الموردين", count: filtered.length },
                items: filtered,
              }}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <FileSignature className="w-3 h-3" />
                  إجمالي العقود
                </div>
                <div className="text-2xl font-bold tabular-nums">{stats.total}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  قيمتها {formatCurrency(stats.totalValue)}
                </div>
              </CardContent>
            </Card>
            <Card className={stats.expired > 0 ? "border-status-danger-foreground border-2" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-status-danger-foreground" />
                  منتهية
                </div>
                <div className={`text-2xl font-bold tabular-nums ${stats.expired > 0 ? "text-status-danger-foreground" : ""}`}>
                  {stats.expired}
                </div>
              </CardContent>
            </Card>
            <Card className={stats.critical > 0 ? "border-status-danger-foreground border-2" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-status-danger-foreground" />
                  ≤30 يوم (حرج)
                </div>
                <div className={`text-2xl font-bold tabular-nums ${stats.critical > 0 ? "text-status-danger-foreground" : ""}`}>
                  {stats.critical}
                </div>
              </CardContent>
            </Card>
            <Card className={stats.warning > 0 ? "border-status-warning-foreground" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-status-warning-foreground" />
                  ≤90 يوم
                </div>
                <div className={`text-2xl font-bold tabular-nums ${stats.warning > 0 ? "text-status-warning-foreground" : ""}`}>
                  {stats.warning}
                </div>
              </CardContent>
            </Card>
            <Card className={stats.noticeRequired > 0 ? "border-status-warning-foreground border-2" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-status-warning-foreground" />
                  يلزم إشعار
                </div>
                <div className={`text-2xl font-bold tabular-nums ${stats.noticeRequired > 0 ? "text-status-warning-foreground" : ""}`}>
                  {stats.noticeRequired}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  خلال فترة الإشعار التعاقدي
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Contracts list */}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-status-success-foreground" />
                لا توجد عقود مطابقة 🎉
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">العقود ({filtered.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filtered.map(c => {
                    const urgencyColors = {
                      expired: "border-status-danger-foreground bg-status-danger-surface",
                      critical: "border-status-danger-foreground",
                      warning: "border-status-warning-foreground",
                      ok: "border-border",
                      future: "border-border",
                    };
                    const textColor = c.urgency === "expired" || c.urgency === "critical" ? "text-status-danger-foreground" :
                                       c.urgency === "warning" ? "text-status-warning-foreground" :
                                       "text-muted-foreground";
                    return (
                      <div key={c.id} className={`border rounded p-3 ${urgencyColors[c.urgency]}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <FileSignature className={`w-5 h-5 shrink-0 ${textColor}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">{c.title ?? c.ref ?? `عقد #${c.id}`}</span>
                                {c.ref && <code className="text-[10px] font-mono text-muted-foreground">{c.ref}</code>}
                                {c.autoRenew && (
                                  <Badge variant="outline" className="text-[9px]">تجديد تلقائي</Badge>
                                )}
                                {c.noticeRequired && (
                                  <Badge variant="outline" className="text-[9px] text-status-warning-foreground bg-status-warning-surface">
                                    ⚠ يلزم إشعار قبل {c.noticePeriodDays} يوم
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                                <span>المورد: <strong className="text-foreground">{c.vendorName ?? "—"}</strong></span>
                                {c.startDate && c.endDate && (
                                  <span>
                                    {formatDateAr(c.startDate.split("T")[0])} → {formatDateAr(c.endDate.split("T")[0])}
                                  </span>
                                )}
                                {c.totalValue && Number(c.totalValue) > 0 && (
                                  <span className="font-semibold">{formatCurrency(Number(c.totalValue))}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-end shrink-0">
                            <div className={`font-bold ${textColor}`}>
                              {c.urgency === "expired" ? `متأخر ${Math.abs(c.daysLeft)}ي` :
                               c.daysLeft === Infinity ? "—" :
                               c.daysLeft === 0 ? "ينتهي اليوم" :
                               `${c.daysLeft} يوم متبقي`}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {c.urgency === "critical" ? "🔴 حرج" :
                               c.urgency === "warning" ? "🟡 تحذير" :
                               c.urgency === "expired" ? "⛔ منتهي" :
                               c.urgency === "ok" ? "🟢 آمن" : "—"}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button asChild variant="ghost" size="icon" title="فتح في نافذة جديدة" className="h-8 w-8"><Link href="/finance/contracts"><ExternalLink className="w-4 h-4" /></Link></Button>
                            {c.vendorId && (
                              <Button asChild variant="outline" size="sm"><Link href={`/finance/vendor-360-sheet?vendorId=${c.vendorId}`}>
                                  المورد 360°
                                  <ChevronRight className="w-3 h-3 mr-1" />
                                </Link></Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}
