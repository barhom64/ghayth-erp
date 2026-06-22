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
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Phone, Mail, AlertTriangle, ChevronDown, ChevronRight, Search,
  ExternalLink, Download, Users, Banknote, Clock, FileText,
} from "lucide-react";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";

/**
 * Vendor Settlement Workbench — daily AP officer's view
 *
 * Mirror of AR Collection Workbench but for vendors: groups all unpaid
 * POs/PRs/accrued expenses by vendor with aging buckets, contact info,
 * per-PO detail, and one-click to Payment Run with vendor pre-selected.
 *
 * Endpoint: GET /finance/ap-aging?asOfDate=YYYY-MM-DD
 */

interface AgingOrder {
  id: number;
  ref: string;
  sourceType: "purchase_order" | "purchase_request" | "accrued_expense";
  dueDate: string;
  outstanding: number;
  daysOverdue: number;
  bucket: "current" | "1_30" | "31_60" | "61_90" | "over90";
}

interface AgingSupplier {
  supplierId: number | null;
  supplierName: string;
  supplierPhone?: string;
  supplierEmail?: string;
  current: number;
  "1_30": number;
  "31_60": number;
  "61_90": number;
  over90: number;
  total: number;
  orders: AgingOrder[];
}

interface AgingResp {
  asOfDate: string;
  suppliers: AgingSupplier[];
  summary: {
    current: number;
    "1_30": number;
    "31_60": number;
    "61_90": number;
    over90: number;
    grandTotal: number;
  };
}

const BUCKETS: Array<{ key: AgingOrder["bucket"]; label: string; color: string; surface: string }> = [
  { key: "current", label: "حالي", color: "text-status-info-foreground", surface: "bg-status-info-surface" },
  { key: "1_30", label: "1-30", color: "text-status-success-foreground", surface: "bg-status-success-surface" },
  { key: "31_60", label: "31-60", color: "text-status-warning-foreground", surface: "bg-status-warning-surface" },
  { key: "61_90", label: "61-90", color: "text-status-warning-foreground", surface: "bg-status-warning-surface" },
  { key: "over90", label: "+90", color: "text-status-danger-foreground", surface: "bg-status-danger-surface" },
];

const SOURCE_LABELS: Record<AgingOrder["sourceType"], string> = {
  purchase_order: "أمر شراء",
  purchase_request: "طلب شراء",
  accrued_expense: "مصروف مستحق",
};

type Filter = "open" | "61+" | "over90" | "all";
type SortMode = "amount" | "oldest" | "name";

export default function VendorSettlementWorkbenchPage() {
  const today = todayLocal();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [sortMode, setSortMode] = useState<SortMode>("amount");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useApiQuery<AgingResp>(
    ["vendor-settlement", today],
    `/finance/ap-aging?asOfDate=${today}`,
  );

  const filtered = useMemo(() => {
    if (!data?.suppliers) return [];
    let list = data.suppliers.slice();
    if (filter === "open") {
      list = list.filter(s => s.total > 0.01);
    } else if (filter === "61+") {
      list = list.filter(s => s["61_90"] + s.over90 > 0.01);
    } else if (filter === "over90") {
      list = list.filter(s => s.over90 > 0.01);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(v => v.supplierName.toLowerCase().includes(s));
    }
    if (sortMode === "amount") list.sort((a, b) => b.total - a.total);
    else if (sortMode === "oldest") list.sort((a, b) => (b.over90 + b["61_90"]) - (a.over90 + a["61_90"]));
    else list.sort((a, b) => a.supplierName.localeCompare(b.supplierName, "ar"));
    return list;
  }, [data, filter, search, sortMode]);

  const serious = data ? data.summary["61_90"] + data.summary.over90 : 0;
  const top5Concentration = useMemo(() => {
    if (data?.summary.grandTotal === 0 || !data) return 0;
    const top = filtered.slice(0, 5).reduce((s, v) => s + v.total, 0);
    return (top / data.summary.grandTotal) * 100;
  }, [filtered, data]);

  const toggle = (key: string) => {
    setExpanded(s => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`جدول تسوية الموردين — ${today}`);
    lines.push("");
    lines.push("المورد,الجوال,البريد,حالي,1-30,31-60,61-90,+90,إجمالي");
    for (const v of filtered) {
      lines.push([
        v.supplierName.replace(/,/g, "،"),
        v.supplierPhone ?? "",
        v.supplierEmail ?? "",
        v.current.toFixed(2),
        v["1_30"].toFixed(2),
        v["31_60"].toFixed(2),
        v["61_90"].toFixed(2),
        v.over90.toFixed(2),
        v.total.toFixed(2),
      ].join(","));
    }
    lines.push("");
    lines.push("التفاصيل");
    lines.push("المورد,نوع,مرجع,تاريخ الاستحقاق,أيام تأخر,المبلغ");
    for (const v of filtered) {
      for (const o of v.orders) {
        lines.push([
          v.supplierName.replace(/,/g, "،"),
          SOURCE_LABELS[o.sourceType],
          o.ref,
          o.dueDate.split("T")[0],
          o.daysOverdue.toString(),
          o.outstanding.toFixed(2),
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
        entityType: "report_vendor_settlement_workbench",
        title: String(`vendor-settlement-${today}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="منضدة تسوية الموردين"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "منضدة تسوية الموردين" },
      ]}
      subtitle="شاشة موظف الذمم الدائنة اليومية — اعرف من تدفع ومتى"
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
                  placeholder="اسم المورد..."
                  className="pr-9"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الفلتر</label>
              <div className="flex gap-1">
                <Button variant={filter === "open" ? "default" : "outline"} size="sm" onClick={() => setFilter("open")}>مستحق</Button>
                <Button variant={filter === "61+" ? "default" : "outline"} size="sm" onClick={() => setFilter("61+")}>61+ يوم</Button>
                <Button variant={filter === "over90" ? "default" : "outline"} size="sm" onClick={() => setFilter("over90")}>+90</Button>
                <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>الكل</Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ترتيب</label>
              <div className="flex gap-1">
                <Button variant={sortMode === "amount" ? "default" : "outline"} size="sm" onClick={() => setSortMode("amount")}>الأكبر</Button>
                <Button variant={sortMode === "oldest" ? "default" : "outline"} size="sm" onClick={() => setSortMode("oldest")}>الأقدم</Button>
                <Button variant={sortMode === "name" ? "default" : "outline"} size="sm" onClick={() => setSortMode("name")}>الاسم</Button>
              </div>
            </div>
            <Button asChild variant="outline" size="sm"><Link href="/finance/payment-run">
                <Banknote className="w-4 h-4 ml-1" />
                Payment Run
              </Link></Button>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
              <Download className="w-4 h-4 ml-1" />
              CSV
            </Button>
            <PrintButton
              entityType="report_vendor_settlement"
              entityId={data?.asOfDate ?? "today"}
              payload={{
                entity: {
                  title: "ورشة تسوية المورّدين",
                  asOfDate: data?.asOfDate ?? "",
                  vendorCount: filtered.length,
                  totalOutstanding: filtered.reduce((s, v) => s + Number(v.total ?? 0), 0),
                },
                items: filtered.map((v) => ({
                  "المورد": v.supplierName,
                  "هاتف": v.supplierPhone ?? "",
                  "حالي": Number(v.current ?? 0),
                  "1-30 يوم": Number(v["1_30"] ?? 0),
                  "31-60 يوم": Number(v["31_60"] ?? 0),
                  "61-90 يوم": Number(v["61_90"] ?? 0),
                  "+90 يوم": Number(v.over90 ?? 0),
                  "الإجمالي": Number(v.total ?? 0),
                })),
              }}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
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
                  موردون نشطون
                </div>
                <div className="text-xl font-bold tabular-nums">{filtered.length}</div>
                <div className="text-[11px] text-muted-foreground mt-1">من {data.suppliers.length} مورد</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-status-warning-foreground" />
                  إجمالي المستحق
                </div>
                <div className="text-xl font-bold tabular-nums text-status-warning-foreground">{formatCurrency(data.summary.grandTotal)}</div>
              </CardContent>
            </Card>
            <Card className={serious > 0 ? "border-status-danger-foreground border-2" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-status-danger-foreground" />
                  متأخر +60 يوم (حرج)
                </div>
                <div className={`text-xl font-bold tabular-nums ${serious > 0 ? "text-status-danger-foreground" : ""}`}>
                  {formatCurrency(serious)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {data.summary.grandTotal > 0 ? `${((serious / data.summary.grandTotal) * 100).toFixed(0)}%` : "—"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">تركّز أعلى 5</div>
                <div className="text-xl font-bold tabular-nums">{top5Concentration.toFixed(0)}%</div>
                <div className="text-[11px] text-muted-foreground mt-1">من الإجمالي</div>
              </CardContent>
            </Card>
          </div>

          {/* Bucket distribution bar */}
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
                      title={`${b.label}: ${formatCurrency(value)}`}
                    >
                      {pct > 8 && <span>{b.label}: {formatCurrency(value)}</span>}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Vendor list */}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                لا موردون مطابقون للفلتر 🎉
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(v => {
                const key = String(v.supplierId ?? `noid_${v.supplierName}`);
                const isOpen = expanded.has(key);
                const oldestDays = v.orders.length > 0 ? Math.max(...v.orders.map(o => o.daysOverdue)) : 0;
                return (
                  <Card key={key}>
                    <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30" onClick={() => toggle(key)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                          <div className="min-w-0">
                            <div className="font-semibold text-sm">{v.supplierName}</div>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                              <span>{v.orders.length} طلب</span>
                              {oldestDays > 0 && <span className="text-status-danger-foreground">أقدم: {oldestDays} يوم</span>}
                              {v.supplierPhone && (
                                <a href={`tel:${v.supplierPhone}`} className="flex items-center gap-1 hover:text-status-info-foreground" onClick={(e) => e.stopPropagation()}>
                                  <Phone className="w-3 h-3" />
                                  {v.supplierPhone}
                                </a>
                              )}
                              {v.supplierEmail && (
                                <a href={`mailto:${v.supplierEmail}`} className="flex items-center gap-1 hover:text-status-info-foreground" onClick={(e) => e.stopPropagation()}>
                                  <Mail className="w-3 h-3" />
                                  {v.supplierEmail}
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="hidden md:flex items-center gap-1">
                            {BUCKETS.map(b => {
                              const val = v[b.key];
                              if (val <= 0) return null;
                              return (
                                <Badge key={b.key} variant="outline" className={`text-[10px] ${b.color}`}>
                                  {b.label}: {formatCurrency(val)}
                                </Badge>
                              );
                            })}
                          </div>
                          <div className="text-end">
                            <div className="font-bold tabular-nums text-status-warning-foreground">{formatCurrency(v.total)}</div>
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
                          data={v.orders.slice().sort((a, b) => b.daysOverdue - a.daysOverdue)}
                          rowKey={(o) => `${o.sourceType}-${o.id}`}
                          columns={[
                            {
                              key: "sourceType", header: "النوع", width: "6rem",
                              render: (o) => (
                                <Badge variant="outline" className="text-[10px]">{SOURCE_LABELS[o.sourceType]}</Badge>
                              ),
                              exportValue: (o) => SOURCE_LABELS[o.sourceType],
                            },
                            {
                              key: "ref", header: "المرجع", className: "font-mono text-xs",
                              render: (o) => o.ref,
                            },
                            {
                              key: "dueDate", header: "الاستحقاق", width: "6rem", className: "text-xs",
                              render: (o) => formatDateAr(o.dueDate.split("T")[0]),
                              exportValue: (o) => o.dueDate.split("T")[0],
                            },
                            {
                              key: "daysOverdue", header: "أيام", align: "end", width: "6rem", className: "tabular-nums",
                              render: (o) => (
                                o.daysOverdue > 0 ? (
                                  <span className={o.daysOverdue > 90 ? "text-status-danger-foreground font-semibold" : o.daysOverdue > 60 ? "text-status-warning-foreground" : ""}>
                                    {o.daysOverdue} يوم
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">لم يستحق</span>
                                )
                              ),
                            },
                            {
                              key: "outstanding", header: "المبلغ", align: "end", width: "7rem",
                              className: "tabular-nums font-semibold",
                              render: (o) => formatCurrency(o.outstanding),
                            },
                            {
                              key: "_actions", header: "", width: "4rem", sortable: false,
                              render: (o) => (
                                o.sourceType === "purchase_order" ? (
                                  <Button asChild variant="ghost" size="icon" title="فتح في نافذة جديدة" className="h-7 w-7"><Link href={`/finance/purchase-orders/${o.id}`}><ExternalLink className="w-3 h-3" /></Link></Button>
                                ) : null
                              ),
                            },
                          ] satisfies DataTableColumn<AgingOrder>[]}
                        />
                        <div className="flex justify-end gap-2 mt-3 border-t pt-3">
                          {v.supplierId && (
                            <Button asChild size="sm" variant="outline"><Link href={`/finance/payment-run?supplierId=${v.supplierId}`}>
                                <Banknote className="w-4 h-4 ml-1" />
                                دفع لهذا المورد
                              </Link></Button>
                          )}
                          {v.supplierId && (
                            <Button asChild size="sm" variant="outline"><Link href={`/finance/vendor-360-sheet?vendorId=${v.supplierId}`}>
                                <Users className="w-4 h-4 ml-1" />
                                ملف المورد 360°
                              </Link></Button>
                          )}
                          {v.supplierId && (
                            <Button asChild size="sm" variant="outline"><Link href={`/finance/vendor-statement-print?vendorId=${v.supplierId}`}>
                                <FileText className="w-4 h-4 ml-1" />
                                كشف الحساب
                              </Link></Button>
                          )}
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
