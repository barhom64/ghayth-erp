import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import {
  Phone, Mail, AlertTriangle, ChevronDown, ChevronRight, Search,
  ExternalLink, Download, Users, FileText, Clock, Send,
} from "lucide-react";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";

/**
 * AR Collection Workbench — daily collector view
 *
 * Groups all overdue invoices by customer with aging buckets, contact info
 * (phone/email click-to-action), and per-invoice drill-down. Lets the
 * collector triage the day in one screen.
 *
 * Endpoint: GET /finance/ar-aging?asOfDate=YYYY-MM-DD
 */

interface AgingInvoice {
  id: number;
  ref: string;
  dueDate: string;
  outstanding: number;
  daysOverdue: number;
  bucket: "current" | "1_30" | "31_60" | "61_90" | "over90";
}

interface AgingClient {
  clientId: number;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  current: number;
  "1_30": number;
  "31_60": number;
  "61_90": number;
  over90: number;
  total: number;
  invoices: AgingInvoice[];
}

interface AgingResp {
  asOfDate: string;
  clients: AgingClient[];
  summary: {
    current: number;
    "1_30": number;
    "31_60": number;
    "61_90": number;
    over90: number;
    grandTotal: number;
  };
}

const BUCKETS: Array<{ key: AgingInvoice["bucket"]; label: string; color: string; surface: string }> = [
  { key: "current", label: "حالي", color: "text-status-info-foreground", surface: "bg-status-info-surface" },
  { key: "1_30", label: "1-30", color: "text-status-success-foreground", surface: "bg-status-success-surface" },
  { key: "31_60", label: "31-60", color: "text-status-warning-foreground", surface: "bg-status-warning-surface" },
  { key: "61_90", label: "61-90", color: "text-status-warning-foreground", surface: "bg-status-warning-surface" },
  { key: "over90", label: "+90", color: "text-status-danger-foreground", surface: "bg-status-danger-surface" },
];

type SortMode = "amount" | "oldest" | "name";
type Filter = "overdue" | "all" | "61+" | "over90";

export default function ArCollectionWorkbenchPage() {
  const today = todayLocal();
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("amount");
  const [filter, setFilter] = useState<Filter>("overdue");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data, isLoading, isError } = useApiQuery<AgingResp>(
    ["ar-collection", today],
    `/finance/ar-aging?asOfDate=${today}`,
  );

  const filtered = useMemo(() => {
    if (!data?.clients) return [];
    let list = data.clients.slice();
    if (filter === "overdue") {
      list = list.filter(c => c.total - c.current > 0.01);
    } else if (filter === "61+") {
      list = list.filter(c => c["61_90"] + c.over90 > 0.01);
    } else if (filter === "over90") {
      list = list.filter(c => c.over90 > 0.01);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(c => c.clientName.toLowerCase().includes(s));
    }
    // Sort
    if (sortMode === "amount") {
      list.sort((a, b) => (b.total - b.current) - (a.total - a.current));
    } else if (sortMode === "oldest") {
      list.sort((a, b) => b.over90 + b["61_90"] - a.over90 - a["61_90"]);
    } else {
      list.sort((a, b) => a.clientName.localeCompare(b.clientName, "ar"));
    }
    return list;
  }, [data, search, filter, sortMode]);

  const totalOverdue = data
    ? data.summary["1_30"] + data.summary["31_60"] + data.summary["61_90"] + data.summary.over90
    : 0;
  const seriousOverdue = data ? data.summary["61_90"] + data.summary.over90 : 0;

  const totalCollectionAccounts = filtered.length;
  const topConcentration = useMemo(() => {
    const top5 = filtered.slice(0, 5).reduce((s, c) => s + (c.total - c.current), 0);
    return totalOverdue > 0 ? (top5 / totalOverdue) * 100 : 0;
  }, [filtered, totalOverdue]);

  const toggle = (id: number) => {
    setExpanded(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`جدول التحصيل — ${today}`);
    lines.push("");
    lines.push("العميل,الجوال,البريد,حالي,1-30,31-60,61-90,+90,إجمالي المتأخر,إجمالي");
    for (const c of filtered) {
      const overdue = c.total - c.current;
      lines.push([
        c.clientName.replace(/,/g, "،"),
        c.clientPhone ?? "",
        c.clientEmail ?? "",
        c.current.toFixed(2),
        c["1_30"].toFixed(2),
        c["31_60"].toFixed(2),
        c["61_90"].toFixed(2),
        c.over90.toFixed(2),
        overdue.toFixed(2),
        c.total.toFixed(2),
      ].join(","));
    }
    lines.push("");
    lines.push("التفاصيل");
    lines.push("العميل,فاتورة,تاريخ الاستحقاق,أيام تأخر,المتبقي");
    for (const c of filtered) {
      for (const inv of c.invoices) {
        lines.push([
          c.clientName.replace(/,/g, "،"),
          inv.ref,
          inv.dueDate.split("T")[0],
          inv.daysOverdue.toString(),
          inv.outstanding.toFixed(2),
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
        entityType: "report_ar_collection_workbench",
        title: String(`ar-collection-${today}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="منضدة عمل التحصيل"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "منضدة عمل التحصيل" },
      ]}
      subtitle="تنظيم يوم محصّل الديون — عملاء، أعمار، اتصالات، أولويات"
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
                  placeholder="اسم العميل..."
                  className="pr-9"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الفلتر</label>
              <div className="flex gap-1">
                <Button variant={filter === "overdue" ? "default" : "outline"} size="sm" onClick={() => setFilter("overdue")}>متأخر</Button>
                <Button variant={filter === "61+" ? "default" : "outline"} size="sm" onClick={() => setFilter("61+")}>61+ يوم</Button>
                <Button variant={filter === "over90" ? "default" : "outline"} size="sm" onClick={() => setFilter("over90")}>+90</Button>
                <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>الكل</Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ترتيب</label>
              <div className="flex gap-1">
                <Button variant={sortMode === "amount" ? "default" : "outline"} size="sm" onClick={() => setSortMode("amount")}>الأكبر مبلغاً</Button>
                <Button variant={sortMode === "oldest" ? "default" : "outline"} size="sm" onClick={() => setSortMode("oldest")}>الأقدم</Button>
                <Button variant={sortMode === "name" ? "default" : "outline"} size="sm" onClick={() => setSortMode("name")}>الاسم</Button>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
              <Download className="w-4 h-4 ml-1" />
              CSV
            </Button>
            <PrintButton
              entityType="report_ar_collection_plan"
              entityId={today}
              payload={{
                entity: {
                  title: "خطة التحصيل (الذمم المدينة)",
                  asOfDate: today,
                  totalOverdue,
                  totalAccounts: totalCollectionAccounts,
                },
                items: filtered.map((c) => ({
                  "العميل": c.clientName ?? "",
                  "هاتف": c.clientPhone ?? "",
                  "إجمالي مستحق": Number(c.total ?? 0),
                  "متأخر": Number((c.total ?? 0) - (c.current ?? 0)),
                  "+90 يوم": Number(c.over90 ?? 0),
                })),
              }}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorState />
      ) : !data ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد بيانات</CardContent></Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  عملاء بحاجة متابعة
                </div>
                <div className="text-xl font-bold tabular-nums">{totalCollectionAccounts}</div>
                <div className="text-[11px] text-muted-foreground mt-1">من {data.clients.length} عميل</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-status-warning-foreground" />
                  إجمالي المتأخر
                </div>
                <div className="text-xl font-bold tabular-nums text-status-warning-foreground">{formatCurrency(totalOverdue)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  من {formatCurrency(data.summary.grandTotal)} إجمالي AR
                </div>
              </CardContent>
            </Card>
            <Card className={seriousOverdue > 0 ? "border-status-danger-foreground border-2" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-status-danger-foreground" />
                  متأخر +60 يوم (حرج)
                </div>
                <div className={`text-xl font-bold tabular-nums ${seriousOverdue > 0 ? "text-status-danger-foreground" : ""}`}>
                  {formatCurrency(seriousOverdue)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {totalOverdue > 0 ? `${((seriousOverdue / totalOverdue) * 100).toFixed(0)}% من المتأخر` : "—"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">تركّز أعلى 5 عملاء</div>
                <div className="text-xl font-bold tabular-nums">{topConcentration.toFixed(0)}%</div>
                <div className="text-[11px] text-muted-foreground mt-1">من إجمالي المتأخر</div>
              </CardContent>
            </Card>
          </div>

          {/* Bucket distribution */}
          <Card className="mb-4">
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-2">توزيع الأعمار</div>
              <div className="flex rounded overflow-hidden h-8">
                {BUCKETS.map(b => {
                  const value = data.summary[b.key];
                  const pct = data.summary.grandTotal > 0 ? (value / data.summary.grandTotal) * 100 : 0;
                  if (value <= 0) return null;
                  return (
                    <div
                      key={b.key}
                      className={`${b.surface} flex items-center justify-center px-2 text-xs font-semibold ${b.color}`}
                      style={{ width: `${pct}%` }}
                      title={`${b.label}: ${formatCurrency(value)} (${pct.toFixed(1)}%)`}
                    >
                      {pct > 8 && (
                        <span>{b.label}: {formatCurrency(value)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Client list */}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                لا عملاء مطابقون للفلتر — صندوقك فاضي 🎉
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(c => {
                const isOpen = expanded.has(c.clientId);
                const overdue = c.total - c.current;
                const oldestDays = Math.max(...c.invoices.map(i => i.daysOverdue));
                return (
                  <Card key={c.clientId}>
                    <CardHeader
                      className="pb-3 cursor-pointer hover:bg-muted/30"
                      onClick={() => toggle(c.clientId)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <div>
                            <div className="font-semibold text-sm">{c.clientName}</div>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                              <span>{c.invoices.length} فاتورة</span>
                              {oldestDays > 0 && <span className="text-status-danger-foreground">أقدم: {oldestDays} يوم</span>}
                              {c.clientPhone && (
                                <a href={`tel:${c.clientPhone}`} className="flex items-center gap-1 hover:text-status-info-foreground" onClick={(e) => e.stopPropagation()}>
                                  <Phone className="w-3 h-3" />
                                  {c.clientPhone}
                                </a>
                              )}
                              {c.clientEmail && (
                                <a href={`mailto:${c.clientEmail}`} className="flex items-center gap-1 hover:text-status-info-foreground" onClick={(e) => e.stopPropagation()}>
                                  <Mail className="w-3 h-3" />
                                  {c.clientEmail}
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {/* Buckets */}
                          <div className="hidden md:flex items-center gap-1">
                            {BUCKETS.map(b => {
                              const v = c[b.key];
                              if (v <= 0) return null;
                              return (
                                <Badge
                                  key={b.key}
                                  variant="outline"
                                  className={`text-[10px] ${b.color}`}
                                  title={b.label}
                                >
                                  {b.label}: {formatCurrency(v)}
                                </Badge>
                              );
                            })}
                          </div>
                          <div className="text-end">
                            <div className="font-bold tabular-nums text-status-warning-foreground">{formatCurrency(overdue)}</div>
                            <div className="text-[10px] text-muted-foreground">متأخر من {formatCurrency(c.total)}</div>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    {isOpen && (
                      <CardContent className="pt-0">
                        <DataTable
                          noToolbar
                          pageSize={0}
                          className="text-sm"
                          data={c.invoices.slice().sort((a, b) => b.daysOverdue - a.daysOverdue)}
                          rowKey={(inv) => inv.id}
                          columns={[
                            {
                              key: "ref", header: "الفاتورة", className: "font-mono text-xs",
                              render: (inv) => inv.ref,
                            },
                            {
                              key: "dueDate", header: "الاستحقاق", className: "text-xs",
                              render: (inv) => formatDateAr(inv.dueDate.split("T")[0]),
                              exportValue: (inv) => inv.dueDate.split("T")[0],
                            },
                            {
                              key: "daysOverdue", header: "أيام تأخر", align: "end", className: "tabular-nums",
                              render: (inv) => (
                                inv.daysOverdue > 0 ? (
                                  <span className={inv.daysOverdue > 90 ? "text-status-danger-foreground font-semibold" : inv.daysOverdue > 60 ? "text-status-warning-foreground" : ""}>
                                    {inv.daysOverdue} يوم
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">لم يستحق</span>
                                )
                              ),
                            },
                            {
                              key: "bucket", header: "السطل", align: "center", sortable: false,
                              render: (inv) => {
                                const bucket = BUCKETS.find(b => b.key === inv.bucket)!;
                                return (
                                  <Badge variant="outline" className={`text-[10px] ${bucket.color}`}>
                                    {bucket.label}
                                  </Badge>
                                );
                              },
                            },
                            {
                              key: "outstanding", header: "المتبقي", align: "end",
                              className: "tabular-nums font-semibold",
                              render: (inv) => formatCurrency(inv.outstanding),
                            },
                            {
                              key: "_actions", header: "", width: "4rem", sortable: false,
                              render: (inv) => (
                                <Button asChild variant="ghost" size="icon" title="فتح في نافذة جديدة" className="h-7 w-7"><Link href={`/finance/invoices/${inv.id}`}><ExternalLink className="w-3 h-3" /></Link></Button>
                              ),
                            },
                          ] satisfies DataTableColumn<AgingInvoice>[]}
                        />
                        <div className="flex justify-end gap-2 mt-3 border-t pt-3">
                          <Button asChild size="sm" variant="outline"><Link href={`/finance/customer-360-sheet?clientId=${c.clientId}`}>
                              <Users className="w-4 h-4 ml-1" />
                              ملف العميل 360°
                            </Link></Button>
                          <Button asChild size="sm" variant="outline"><Link href={`/finance/customer-statement-print?clientId=${c.clientId}`}>
                              <FileText className="w-4 h-4 ml-1" />
                              كشف الحساب
                            </Link></Button>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
