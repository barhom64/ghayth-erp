import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell, DataTable } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { VendorSelect } from "@/components/shared/entity-selects";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  Download, ExternalLink, FileText,
  Building2, Mail, Phone, AlertTriangle,
} from "lucide-react";
import {
  formatCurrency, formatDateAr, todayLocal, currentYearRiyadh,
  currentMonthPaddedRiyadh,
} from "@/lib/formatters";

/**
 * Vendor Statement (printable) — mirror of Customer Statement.
 *
 * Endpoint: GET /finance/reports/vendor-statement/:supplierId?startDate&endDate
 */

interface Movement {
  id: number;
  ref: string;
  date: string;
  debit: number | string;
  credit: number | string;
  dueDate?: string | null;
  status: string;
  movementType: "purchase_order" | "voucher_payment";
  description: string;
  runningBalance: number;
}

interface Supplier {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
}

interface StatementResp {
  supplier: Supplier;
  period: { from: string; to: string };
  openingBalance: number;
  movements: Movement[];
  endingBalance: number;
  totals: { totalDebit: number; totalCredit: number; movementCount: number };
  aging: {
    current: number;
    "1-30": number;
    "31-60": number;
    "61-90": number;
    "90+": number;
    total: number;
  };
}

export default function VendorStatementPrintPage() {
  const initialSupplierId = typeof window !== "undefined"
    ? (new URLSearchParams(window.location.search).get("vendorId") ??
       new URLSearchParams(window.location.search).get("supplierId") ?? "")
    : "";
  const [supplierId, setSupplierId] = useState<string>(initialSupplierId);
  const [year, setYear] = useState(currentYearRiyadh());
  const [month, setMonth] = useState(currentMonthPaddedRiyadh());
  const [scope, setScope] = useState<"month" | "ytd" | "all">("month");

  const { startDate, endDate, label } = useMemo(() => {
    const lastDay = new Date(Date.UTC(year, Number(month), 0)).getUTCDate();
    const ed = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
    if (scope === "all") return { startDate: "1900-01-01", endDate: ed, label: "منذ البداية" };
    if (scope === "ytd") return { startDate: `${year}-01-01`, endDate: ed, label: `${year} حتى ${month}` };
    return { startDate: `${year}-${month}-01`, endDate: ed, label: `${month}/${year}` };
  }, [year, month, scope]);

  const queryParam = `startDate=${startDate}&endDate=${endDate}`;

  const { data, isLoading } = useApiQuery<StatementResp>(
    ["vendor-stmt", supplierId, queryParam],
    supplierId ? `/finance/reports/vendor-statement/${supplierId}?${queryParam}` : null,
  );

  // entityId encodes the date range so the server-side loader can re-fetch
  // exactly the same window — matches parseEntityId() in reportLoaders.ts.
  const printEntityId = supplierId ? `${supplierId}:${startDate}..${endDate}` : "";

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`كشف حساب مورد — ${data.supplier.name}`);
    lines.push(`الفترة: ${data.period.from} → ${data.period.to}`);
    lines.push("");
    lines.push("التاريخ,المرجع,الوصف,مدين,دائن,الرصيد");
    lines.push([data.period.from, "", "الرصيد الافتتاحي", "", "", data.openingBalance.toFixed(2)].join(","));
    for (const m of data.movements) {
      lines.push([
        m.date.split("T")[0],
        m.ref,
        m.description.replace(/,/g, "،"),
        Number(m.debit).toFixed(2),
        Number(m.credit).toFixed(2),
        m.runningBalance.toFixed(2),
      ].join(","));
    }
    lines.push("");
    lines.push(`الإجمالي,,,${data.totals.totalDebit.toFixed(2)},${data.totals.totalCredit.toFixed(2)},${data.endingBalance.toFixed(2)}`);

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
        entityType: "report_vendor_statement_print",
        title: String(`vendor-stmt-${data.supplier.name}-${data.period.to}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="كشف حساب مورد قابل للطباعة"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "كشف حساب مورد قابل للطباعة" },
      ]}
      subtitle="نموذج رسمي للإرسال للمورد أو الاحتفاظ به في الملف"
    >
      <FinanceTabsNav />

      {/* Controls (hidden in print) */}
      <Card className="mb-4 print:hidden">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2">
              <VendorSelect
                value={supplierId}
                onChange={setSupplierId}
                label="المورد"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">النطاق</label>
              <div className="flex gap-1">
                <Button variant={scope === "month" ? "default" : "outline"} size="sm" onClick={() => setScope("month")}>شهر</Button>
                <Button variant={scope === "ytd" ? "default" : "outline"} size="sm" onClick={() => setScope("ytd")}>حتى تاريخه</Button>
                <Button variant={scope === "all" ? "default" : "outline"} size="sm" onClick={() => setScope("all")}>الكل</Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">السنة</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border rounded px-3 py-1.5 text-sm bg-background w-full"
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
                className="border rounded px-3 py-1.5 text-sm bg-background w-full"
                disabled={scope === "all"}
              >
                {["01","02","03","04","05","06","07","08","09","10","11","12"].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3 justify-end">
            {supplierId && (
              <Button asChild variant="outline" size="sm"><Link href={`/finance/vendor-360-sheet?vendorId=${supplierId}`}>
                  <FileText className="w-4 h-4 ml-1" />
                  ملف المورد 360°
                </Link></Button>
            )}
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
              <Download className="w-4 h-4 ml-1" />
              CSV
            </Button>
            <PrintButton
              entityType="vendor_statement"
              entityId={printEntityId}
              variant="default"
              size="sm"
              label="طباعة"
            />
          </div>
        </CardContent>
      </Card>

      {!supplierId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
            اختر مورداً من القائمة أعلاه لعرض كشف حسابه
          </CardContent>
        </Card>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : !data ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد بيانات</CardContent></Card>
      ) : (
        <div className="bg-background border rounded p-6 print:border-0 print:p-0 print:shadow-none">
          <div className="border-b-2 pb-3 mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-1">كشف حساب مورد</h1>
              <div className="text-sm text-muted-foreground">
                الفترة: {formatDateAr(data.period.from)} — {formatDateAr(data.period.to)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                طُبع في {formatDateAr(todayLocal())}
              </div>
            </div>
            <div className="text-end">
              <div className="text-sm font-semibold">رصيد المورد</div>
              <div className={`text-3xl font-bold tabular-nums ${data.endingBalance < 0 ? "text-status-warning-foreground" : "text-status-success-foreground"}`}>
                {formatCurrency(Math.abs(data.endingBalance))}
              </div>
              <div className={`text-xs ${data.endingBalance < 0 ? "text-status-warning-foreground" : "text-status-success-foreground"}`}>
                {data.endingBalance < 0 ? "نحن مدينون له" : data.endingBalance > 0 ? "نحن دائنون له" : "متوازن"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                المورد
              </div>
              <div className="text-lg font-semibold">{data.supplier.name}</div>
              {data.supplier.taxNumber && (
                <div className="text-xs text-muted-foreground mt-1">
                  الرقم الضريبي: <code className="font-mono">{data.supplier.taxNumber}</code>
                </div>
              )}
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground mb-1">معلومات التواصل</div>
              <div className="space-y-1 text-sm">
                {data.supplier.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    <a href={`tel:${data.supplier.phone}`} className="hover:underline">{data.supplier.phone}</a>
                  </div>
                )}
                {data.supplier.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    <a href={`mailto:${data.supplier.email}`} className="hover:underline">{data.supplier.email}</a>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Card className="mb-4 print:border print:shadow-none">
            <CardHeader className="pb-2 print:py-2">
              <CardTitle className="text-base">حركة الحساب — {label}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <DataTable<Movement & { _opening?: boolean }>
                noToolbar
                pageSize={0}
                data={[
                  { _opening: true, id: -1, ref: "", date: data.period.from, debit: 0, credit: 0, dueDate: null, status: "", movementType: "voucher_payment", description: "الرصيد الافتتاحي", runningBalance: data.openingBalance },
                  ...data.movements,
                ]}
                rowKey={(m) => (m._opening ? "opening" : `${m.movementType}-${m.id}`)}
                rowClassName={(m) => (m._opening ? "font-semibold bg-muted/30" : undefined)}
                columns={[
                  { key: "date", header: "التاريخ", sortable: false, width: "6rem", className: "tabular-nums", render: (m) => formatDateAr(m._opening ? m.date : m.date.split("T")[0]) },
                  { key: "ref", header: "المرجع", sortable: false, width: "7rem", className: "font-mono text-xs", render: (m) => (m._opening ? "—" : m.ref) },
                  {
                    key: "description", header: "الوصف", sortable: false,
                    render: (m) => (
                      <>
                        {m.description}
                        {!m._opening && m.movementType === "purchase_order" && m.dueDate && (
                          <span className="text-xs text-muted-foreground mr-2">
                            (تسليم: {formatDateAr(m.dueDate.split("T")[0])})
                          </span>
                        )}
                      </>
                    ),
                    footer: () => `الرصيد الختامي (${formatDateAr(data.period.to)})`,
                  },
                  { key: "debit", header: "مدين", sortable: false, align: "end", width: "7rem", className: "tabular-nums", render: (m) => (m._opening || Number(m.debit) <= 0 ? "—" : formatCurrency(Number(m.debit))), footer: () => formatCurrency(data.totals.totalDebit) },
                  { key: "credit", header: "دائن", sortable: false, align: "end", width: "7rem", className: "tabular-nums", render: (m) => (m._opening || Number(m.credit) <= 0 ? "—" : formatCurrency(Number(m.credit))), footer: () => formatCurrency(data.totals.totalCredit) },
                  {
                    key: "balance", header: "الرصيد", sortable: false, align: "end", width: "8rem", className: "tabular-nums font-semibold",
                    render: (m) => formatCurrency(m.runningBalance),
                    footer: () => (
                      <span className={`text-lg ${data.endingBalance < 0 ? "text-status-warning-foreground" : "text-status-success-foreground"}`}>
                        {formatCurrency(data.endingBalance)}
                      </span>
                    ),
                  },
                  {
                    key: "_actions", header: "", sortable: false, width: "2rem", className: "print:hidden",
                    render: (m) => (!m._opening && m.movementType === "purchase_order")
                      ? <Button asChild variant="ghost" size="icon" title="فتح في نافذة جديدة" className="h-6 w-6"><Link href={`/finance/purchase-orders/${m.id}`}><ExternalLink className="w-3 h-3" /></Link></Button>
                      : null,
                  },
                ]}
              />
            </CardContent>
          </Card>

          {data.aging.total > 0 && (
            <Card className="mb-4 print:border print:shadow-none">
              <CardHeader className="pb-2 print:py-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-status-warning-foreground" />
                  أعمار أوامر الشراء المفتوحة
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <DataTable<{ key: string; label: string; color: string; value: number; pct: number }>
                  noToolbar
                  pageSize={0}
                  rowKey={(b) => b.key}
                  data={[
                    { key: "current", label: "حالي (لم يستحق)", color: "" },
                    { key: "1-30", label: "1-30 يوم متأخر", color: "text-status-success-foreground" },
                    { key: "31-60", label: "31-60 يوم متأخر", color: "text-status-warning-foreground" },
                    { key: "61-90", label: "61-90 يوم متأخر", color: "text-status-warning-foreground" },
                    { key: "90+", label: "أكثر من 90 يوم", color: "text-status-danger-foreground" },
                  ]
                    .map((b) => {
                      const value = data.aging[b.key as keyof typeof data.aging] as number;
                      return { ...b, value, pct: data.aging.total > 0 ? (value / data.aging.total) * 100 : 0 };
                    })
                    .filter((b) => b.value > 0)}
                  columns={[
                    { key: "label", header: "السطل", sortable: false, render: (b) => b.label, footer: () => "إجمالي المفتوح" },
                    { key: "amount", header: "المبلغ", sortable: false, align: "end", className: "tabular-nums font-semibold", cellClassName: (b) => b.color || undefined, render: (b) => formatCurrency(b.value), footer: () => formatCurrency(data.aging.total) },
                    { key: "pct", header: "% من الإجمالي", sortable: false, align: "end", className: "tabular-nums text-muted-foreground", render: (b) => `${b.pct.toFixed(1)}%`, footer: () => "100%" },
                  ]}
                />
              </CardContent>
            </Card>
          )}

          <div className="text-[10px] text-muted-foreground border-t pt-2 mt-4">
            هذا كشف حساب آلي صادر من نظام غيث. للاستفسارات يُرجى التواصل مع قسم المالية.
          </div>
        </div>
      )}
    </PageShell>
  );
}
