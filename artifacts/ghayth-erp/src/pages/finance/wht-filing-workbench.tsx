import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import {
  FileCheck2, Download, Calendar, AlertTriangle, CheckCircle2,
  ExternalLink, Percent, Globe, ChevronDown, ChevronRight, Receipt, Building2,
} from "lucide-react";
import {
  formatCurrency, formatDateAr, currentYearRiyadh,
  currentMonthPaddedRiyadh, todayLocal,
} from "@/lib/formatters";

/**
 * WHT Monthly Filing Workbench
 *
 * Saudi WHT filing prep — by ZATCA rules, the buyer must file & remit
 * withheld tax within 10 days of the following month. This page lists
 * all WHT entries in the chosen month grouped by supplier with category
 * breakdowns, totals, and a countdown to the filing deadline.
 *
 * Endpoint: GET /finance/reports/wht-summary?startDate&endDate
 */

interface WhtRow {
  allocationId: number;
  journalEntryId: number;
  journalRef: string | null;
  postingDate: string | null;
  obligationType: string;
  obligationId: number;
  amount: number;
  whtAmount: number;
  whtRate: number | null;
  whtCategory: string | null;
  whtCategoryName: string | null;
  whtCategoryAppliesTo: string | null;
  supplierId: number | null;
  supplierName: string | null;
  supplierTaxNumber: string | null;
  supplierResidencyStatus: string | null;
  supplierTaxResidenceCountry: string | null;
}

interface WhtResp {
  rows?: WhtRow[];
  data?: WhtRow[];
  summary?: { totalWht: number; totalAmount: number; count: number };
}

function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().split("T")[0]!;
}

function diffDays(deadline: string, today: string): number {
  const a = new Date(deadline + "T00:00:00Z").getTime();
  const b = new Date(today + "T00:00:00Z").getTime();
  return Math.round((a - b) / 86400000);
}

interface SupplierGroup {
  supplierId: number | null;
  supplierName: string;
  supplierTaxNumber: string | null;
  residencyStatus: string | null;
  country: string | null;
  rows: WhtRow[];
  totalAmount: number;
  totalWht: number;
  categories: Set<string>;
}

export default function WhtFilingWorkbenchPage() {
  const today = todayLocal();
  const [year, setYear] = useState(currentYearRiyadh());
  const [month, setMonth] = useState(currentMonthPaddedRiyadh());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${lastDayOfMonth(year, Number(month)).split("-")[2]}`;
  const periodLabel = `${year}-${month}`;

  // Filing deadline: 10th of next month
  const deadline = useMemo(() => {
    const m = Number(month);
    const dlYear = m === 12 ? year + 1 : year;
    const dlMonth = m === 12 ? 1 : m + 1;
    return `${dlYear}-${String(dlMonth).padStart(2, "0")}-10`;
  }, [year, month]);

  const { data, isLoading } = useApiQuery<WhtResp>(
    ["wht-filing", String(year), month],
    `/finance/reports/wht-summary?startDate=${startDate}&endDate=${endDate}`,
  );

  const rows = data?.rows ?? data?.data ?? [];

  const totals = useMemo(() => {
    const totalAmount = rows.reduce((s, r) => s + Number(r.amount), 0);
    const totalWht = rows.reduce((s, r) => s + Number(r.whtAmount), 0);
    return { totalAmount, totalWht, count: rows.length };
  }, [rows]);

  const groups = useMemo<SupplierGroup[]>(() => {
    const map = new Map<string, SupplierGroup>();
    for (const r of rows) {
      const key = r.supplierId != null ? `s_${r.supplierId}` : `unknown_${r.allocationId}`;
      const name = r.supplierName ?? "غير معروف";
      const cur = map.get(key) ?? {
        supplierId: r.supplierId,
        supplierName: name,
        supplierTaxNumber: r.supplierTaxNumber,
        residencyStatus: r.supplierResidencyStatus,
        country: r.supplierTaxResidenceCountry,
        rows: [],
        totalAmount: 0,
        totalWht: 0,
        categories: new Set<string>(),
      };
      cur.rows.push(r);
      cur.totalAmount += Number(r.amount);
      cur.totalWht += Number(r.whtAmount);
      if (r.whtCategory) cur.categories.add(r.whtCategory);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.totalWht - a.totalWht);
  }, [rows]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { code: string; name: string; rate: number | null; totalAmount: number; totalWht: number; count: number }>();
    for (const r of rows) {
      const key = r.whtCategory ?? "—";
      const cur = map.get(key) ?? {
        code: key,
        name: r.whtCategoryName ?? key,
        rate: r.whtRate,
        totalAmount: 0,
        totalWht: 0,
        count: 0,
      };
      cur.totalAmount += Number(r.amount);
      cur.totalWht += Number(r.whtAmount);
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.totalWht - a.totalWht);
  }, [rows]);

  const daysToDeadline = diffDays(deadline, today);
  const isOverdue = daysToDeadline < 0;
  const isUrgent = daysToDeadline >= 0 && daysToDeadline <= 5;

  const toggle = (key: string) => {
    setExpanded(s => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exportCSV = () => {
    if (rows.length === 0) return;
    const lines: string[] = [];
    lines.push(`إقرار الاستقطاع WHT — ${periodLabel}`);
    lines.push(`الموعد النهائي: ${deadline}`);
    lines.push("");
    lines.push("المورد,الرقم الضريبي,الدولة,الإقامة,قيمة الدفعة,نسبة WHT,قيمة WHT,الفئة,تاريخ القيد,مرجع");
    for (const r of rows) {
      lines.push([
        (r.supplierName ?? "").replace(/,/g, "،"),
        r.supplierTaxNumber ?? "",
        r.supplierTaxResidenceCountry ?? "",
        r.supplierResidencyStatus ?? "",
        Number(r.amount).toFixed(2),
        r.whtRate ? `${r.whtRate}%` : "—",
        Number(r.whtAmount).toFixed(2),
        r.whtCategoryName ?? r.whtCategory ?? "—",
        r.postingDate ?? "",
        r.journalRef ?? "",
      ].join(","));
    }
    lines.push("");
    lines.push(`الإجمالي,,,,${totals.totalAmount.toFixed(2)},,${totals.totalWht.toFixed(2)}`);

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
        entityType: "report_wht_filing_workbench",
        title: String(`wht-filing-${periodLabel}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="إعداد إقرار الاستقطاع WHT"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "إعداد إقرار الاستقطاع WHT" },
      ]}
      subtitle={`شهر ${periodLabel} — تجميع كامل بالمورد وبفئة الاستقطاع`}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/reports/wht-summary">
              <FileCheck2 className="h-3.5 w-3.5 ml-1" />
              ملخص WHT
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/tax-filing-calendar">
              <Calendar className="h-3.5 w-3.5 ml-1" />
              تقويم الإقرارات
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/vat-filing-readiness">
              <Receipt className="h-3.5 w-3.5 ml-1" />
              جاهزية VAT
            </Link></Button>
        </div>
      }
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
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
          <div className="flex-1" />
          <Button asChild variant="outline" size="sm"><Link href="/finance/reports/wht-summary">
              <FileCheck2 className="w-4 h-4 ml-1" />
              تقرير WHT
            </Link></Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={rows.length === 0}>
            <Download className="w-4 h-4 ml-1" />
            CSV
          </Button>
          <PrintButton
            entityType="report_wht_filing"
            entityId={periodLabel}
            payload={{
              entity: {
                title: "ورشة إقرار ضريبة الاستقطاع (WHT)",
                period: periodLabel,
                startDate, endDate,
                rowCount: rows.length,
                totalWht: rows.reduce((s, r) => s + Number(r.whtAmount ?? 0), 0),
              },
              items: rows.map((r) => ({
                "التاريخ": r.postingDate ? r.postingDate.split("T")[0] : "",
                "القيد": r.journalRef ?? `JE-${r.journalEntryId}`,
                "المورد": r.supplierName ?? "",
                "الفئة": r.whtCategoryName ?? "",
                "الأساس": Number(r.amount ?? 0),
                "النسبة %": Number(r.whtRate ?? 0),
                "WHT": Number(r.whtAmount ?? 0),
              })),
            }}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* Deadline alert */}
          <Card className={`mb-4 ${isOverdue ? "border-status-danger-foreground border-2" : isUrgent ? "border-status-warning-foreground border-2" : ""}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isOverdue ? (
                    <AlertTriangle className="w-8 h-8 text-status-danger-foreground" />
                  ) : isUrgent ? (
                    <AlertTriangle className="w-8 h-8 text-status-warning-foreground" />
                  ) : (
                    <Calendar className="w-8 h-8 text-status-info-foreground" />
                  )}
                  <div>
                    <div className="text-xs text-muted-foreground">الموعد النهائي للتقديم</div>
                    <div className="text-lg font-bold">{formatDateAr(deadline)}</div>
                    <div className="text-[11px] text-muted-foreground">اليوم 10 من الشهر التالي</div>
                  </div>
                </div>
                <div className="text-end">
                  {isOverdue ? (
                    <>
                      <div className="text-2xl font-bold text-status-danger-foreground">
                        متأخر {Math.abs(daysToDeadline)} يوم
                      </div>
                      <div className="text-xs text-status-danger-foreground">قدّم الإقرار فوراً</div>
                    </>
                  ) : (
                    <>
                      <div className={`text-2xl font-bold ${isUrgent ? "text-status-warning-foreground" : "text-status-info-foreground"}`}>
                        {daysToDeadline === 0 ? "اليوم!" : `${daysToDeadline} يوم`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {isUrgent ? "اقترب الموعد" : "متبقي"}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">دفعات خاضعة</div>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(totals.totalAmount)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">قاعدة الحساب</div>
              </CardContent>
            </Card>
            <Card className="border-status-danger-foreground border-2">
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Percent className="w-3 h-3 text-status-danger-foreground" />
                  WHT مستحق التحويل
                </div>
                <div className="text-2xl font-bold tabular-nums text-status-danger-foreground">
                  {formatCurrency(totals.totalWht)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">إلى ZATCA</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">عدد العمليات</div>
                <div className="text-2xl font-bold tabular-nums">{totals.count}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">عدد الموردين</div>
                <div className="text-2xl font-bold tabular-nums">{groups.length}</div>
              </CardContent>
            </Card>
          </div>

          {rows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-status-success-foreground" />
                لا توجد عمليات WHT في هذا الشهر
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Category breakdown */}
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Percent className="w-4 h-4" />
                    التفصيل حسب فئة الاستقطاع
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-start py-2 px-2">الفئة</th>
                        <th className="text-end py-2 px-2 w-20">النسبة</th>
                        <th className="text-end py-2 px-2 w-20">عدد</th>
                        <th className="text-end py-2 px-2">قاعدة الحساب</th>
                        <th className="text-end py-2 px-2">الاستقطاع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryBreakdown.map(c => (
                        <tr key={c.code} className="border-b">
                          <td className="py-1.5 px-2">
                            <div className="font-medium">{c.name}</div>
                            <code className="text-[10px] text-muted-foreground">{c.code}</code>
                          </td>
                          <td className="py-1.5 px-2 text-end tabular-nums">
                            {c.rate ? `${c.rate}%` : "—"}
                          </td>
                          <td className="py-1.5 px-2 text-end tabular-nums">{c.count}</td>
                          <td className="py-1.5 px-2 text-end tabular-nums">{formatCurrency(c.totalAmount)}</td>
                          <td className="py-1.5 px-2 text-end tabular-nums font-semibold text-status-danger-foreground">
                            {formatCurrency(c.totalWht)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold bg-muted/40 border-t-2">
                        <td colSpan={2} className="py-2 px-2">الإجمالي</td>
                        <td className="py-2 px-2 text-end tabular-nums">{totals.count}</td>
                        <td className="py-2 px-2 text-end tabular-nums">{formatCurrency(totals.totalAmount)}</td>
                        <td className="py-2 px-2 text-end tabular-nums text-status-danger-foreground">
                          {formatCurrency(totals.totalWht)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

              {/* Supplier list */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    التفصيل حسب المورد ({groups.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {groups.map(g => {
                      const key = `s_${g.supplierId ?? g.supplierName}`;
                      const isOpen = expanded.has(key);
                      return (
                        <div key={key} className="border rounded">
                          <div
                            className="px-3 py-2 cursor-pointer hover:bg-muted/30"
                            onClick={() => toggle(key)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                                <div className="min-w-0">
                                  <div className="font-semibold text-sm">
                                    {g.supplierId ? (
                                      <Link href={`/finance/vendor-360-sheet?vendorId=${g.supplierId}`}>
                                        <span className="hover:underline cursor-pointer" onClick={(e) => e.stopPropagation()}>{g.supplierName}</span>
                                      </Link>
                                    ) : g.supplierName}
                                  </div>
                                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                                    {g.supplierTaxNumber && (
                                      <code className="font-mono">{g.supplierTaxNumber}</code>
                                    )}
                                    {g.country && <span>🌍 {g.country}</span>}
                                    {g.residencyStatus && (
                                      <Badge variant="outline" className="text-[9px]">{g.residencyStatus}</Badge>
                                    )}
                                    <span>{g.rows.length} دفعة</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-end">
                                <div className="font-bold tabular-nums text-status-danger-foreground">
                                  {formatCurrency(g.totalWht)}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  من {formatCurrency(g.totalAmount)}
                                </div>
                              </div>
                            </div>
                          </div>
                          {isOpen && (
                            <div className="border-t bg-muted/10 p-2">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b text-muted-foreground">
                                    <th className="text-start py-1 px-2">تاريخ</th>
                                    <th className="text-start py-1 px-2">مرجع</th>
                                    <th className="text-start py-1 px-2">فئة</th>
                                    <th className="text-end py-1 px-2">نسبة</th>
                                    <th className="text-end py-1 px-2">قاعدة</th>
                                    <th className="text-end py-1 px-2">الاستقطاع</th>
                                    <th className="py-1 px-2 w-8"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.rows.map(r => (
                                    <tr key={r.allocationId} className="border-b last:border-b-0">
                                      <td className="py-1 px-2 tabular-nums">
                                        {r.postingDate ? formatDateAr(r.postingDate) : "—"}
                                      </td>
                                      <td className="py-1 px-2 font-mono">{r.journalRef ?? "—"}</td>
                                      <td className="py-1 px-2">{r.whtCategoryName ?? r.whtCategory ?? "—"}</td>
                                      <td className="py-1 px-2 text-end tabular-nums">
                                        {r.whtRate ? `${r.whtRate}%` : "—"}
                                      </td>
                                      <td className="py-1 px-2 text-end tabular-nums">{formatCurrency(Number(r.amount))}</td>
                                      <td className="py-1 px-2 text-end tabular-nums font-semibold text-status-danger-foreground">
                                        {formatCurrency(Number(r.whtAmount))}
                                      </td>
                                      <td className="py-1 px-2">
                                        <Button asChild variant="ghost" size="icon" title="فتح في نافذة جديدة" className="h-6 w-6"><Link href={`/finance/journal/${r.journalEntryId}`}><ExternalLink className="w-3 h-3" /></Link></Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}
