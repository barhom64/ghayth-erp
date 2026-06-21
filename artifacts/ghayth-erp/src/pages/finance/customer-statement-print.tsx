import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { ClientSelect } from "@/components/shared/entity-selects";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  Download, ChevronRight, ExternalLink, FileText,
  Building2, Mail, Phone, AlertTriangle,
} from "lucide-react";
import {
  formatCurrency, formatDateAr, todayLocal, currentYearRiyadh,
  currentMonthPaddedRiyadh,
} from "@/lib/formatters";

/**
 * Customer Statement (printable)
 *
 * Formal دفتر كشف-حساب layout suitable for sending to the customer:
 * opening balance + chronological movements (invoices + payments) +
 * running balance + aging buckets + closing balance.
 *
 * Endpoint: GET /finance/reports/customer-statement/:clientId?startDate&endDate
 */

interface Movement {
  id: number;
  ref: string;
  date: string;
  debit: number | string;
  credit: number | string;
  dueDate?: string | null;
  status: string;
  movementType: "invoice" | "payment";
  description: string;
  runningBalance: number;
}

interface Client {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  vatNumber?: string;
}

interface StatementResp {
  client: Client;
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

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export default function CustomerStatementPrintPage() {
  const initialClientId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("clientId") ?? ""
    : "";
  const [clientId, setClientId] = useState<string>(initialClientId);
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
    ["customer-stmt", clientId, queryParam],
    clientId ? `/finance/reports/customer-statement/${clientId}?${queryParam}` : null,
  );

  // entityId encodes the date range so the server-side loader can re-fetch
  // exactly the same window — matches parseEntityId() in reportLoaders.ts.
  const printEntityId = clientId ? `${clientId}:${startDate}..${endDate}` : "";

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`كشف حساب — ${data.client.name}`);
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
        entityType: "report_customer_statement_print",
        title: String(`customer-stmt-${data.client.name}-${data.period.to}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="كشف حساب عميل قابل للطباعة"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "كشف حساب عميل قابل للطباعة" },
      ]}
      subtitle="نموذج رسمي للإرسال للعميل — تنسيق A4"
    >
      <FinanceTabsNav />

      {/* Controls (hidden in print) */}
      <Card className="mb-4 print:hidden">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2">
              <ClientSelect
                value={clientId}
                onChange={setClientId}
                label="العميل"
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
            {clientId && (
              <Button asChild variant="outline" size="sm"><Link href={`/finance/customer-360-sheet?clientId=${clientId}`}>
                  <FileText className="w-4 h-4 ml-1" />
                  ملف العميل 360°
                </Link></Button>
            )}
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
              <Download className="w-4 h-4 ml-1" />
              CSV
            </Button>
            <PrintButton
              entityType="customer_statement"
              entityId={printEntityId}
              variant="default"
              size="sm"
              label="طباعة"
            />
          </div>
        </CardContent>
      </Card>

      {!clientId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
            اختر عميلاً من القائمة أعلاه لعرض كشف حسابه
          </CardContent>
        </Card>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : !data ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد بيانات</CardContent></Card>
      ) : (
        <div className="bg-background border rounded p-6 print:border-0 print:p-0 print:shadow-none">
          {/* Header — for print */}
          <div className="border-b-2 pb-3 mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-1">كشف حساب عميل</h1>
              <div className="text-sm text-muted-foreground">
                الفترة: {formatDateAr(data.period.from)} — {formatDateAr(data.period.to)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                طُبع في {formatDateAr(todayLocal())}
              </div>
            </div>
            <div className="text-end">
              <div className="text-sm font-semibold">رصيد العميل</div>
              <div className={`text-3xl font-bold tabular-nums ${data.endingBalance > 0 ? "text-status-danger-foreground" : "text-status-success-foreground"}`}>
                {formatCurrency(Math.abs(data.endingBalance))}
              </div>
              <div className={`text-xs ${data.endingBalance > 0 ? "text-status-danger-foreground" : "text-status-success-foreground"}`}>
                {data.endingBalance > 0 ? "مدين للشركة" : data.endingBalance < 0 ? "دائن للشركة" : "متوازن"}
              </div>
            </div>
          </div>

          {/* Customer info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                العميل
              </div>
              <div className="text-lg font-semibold">{data.client.name}</div>
              {data.client.vatNumber && (
                <div className="text-xs text-muted-foreground mt-1">
                  الرقم الضريبي: <code className="font-mono">{data.client.vatNumber}</code>
                </div>
              )}
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground mb-1">معلومات التواصل</div>
              <div className="space-y-1 text-sm">
                {data.client.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    <a href={`tel:${data.client.phone}`} className="hover:underline">{data.client.phone}</a>
                  </div>
                )}
                {data.client.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    <a href={`mailto:${data.client.email}`} className="hover:underline">{data.client.email}</a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Movements */}
          <Card className="mb-4 print:border print:shadow-none">
            <CardHeader className="pb-2 print:py-2">
              <CardTitle className="text-base">حركة الحساب — {label}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-start py-2 px-2 w-24">التاريخ</th>
                    <th className="text-start py-2 px-2 w-28">المرجع</th>
                    <th className="text-start py-2 px-2">الوصف</th>
                    <th className="text-end py-2 px-2 w-28">مدين</th>
                    <th className="text-end py-2 px-2 w-28">دائن</th>
                    <th className="text-end py-2 px-2 w-32">الرصيد</th>
                    <th className="py-2 px-2 w-8 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b font-semibold bg-muted/30">
                    <td className="py-2 px-2 tabular-nums">{formatDateAr(data.period.from)}</td>
                    <td className="py-2 px-2">—</td>
                    <td className="py-2 px-2">الرصيد الافتتاحي</td>
                    <td className="py-2 px-2 text-end tabular-nums">—</td>
                    <td className="py-2 px-2 text-end tabular-nums">—</td>
                    <td className="py-2 px-2 text-end tabular-nums">{formatCurrency(data.openingBalance)}</td>
                    <td className="py-2 px-2 print:hidden"></td>
                  </tr>
                  {data.movements.map(m => (
                    <tr key={`${m.movementType}-${m.id}`} className="border-b">
                      <td className="py-1.5 px-2 tabular-nums">{formatDateAr(m.date.split("T")[0])}</td>
                      <td className="py-1.5 px-2 font-mono text-xs">{m.ref}</td>
                      <td className="py-1.5 px-2">
                        {m.description}
                        {m.movementType === "invoice" && m.dueDate && (
                          <span className="text-xs text-muted-foreground mr-2">
                            (يستحق: {formatDateAr(m.dueDate.split("T")[0])})
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-end tabular-nums">
                        {Number(m.debit) > 0 ? formatCurrency(Number(m.debit)) : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-end tabular-nums">
                        {Number(m.credit) > 0 ? formatCurrency(Number(m.credit)) : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-end tabular-nums font-semibold">
                        {formatCurrency(m.runningBalance)}
                      </td>
                      <td className="py-1.5 px-2 print:hidden">
                        {m.movementType === "invoice" && (
                          <Button asChild variant="ghost" size="icon" title="فتح في نافذة جديدة" className="h-6 w-6"><Link href={`/finance/invoices/${m.id}`}><ExternalLink className="w-3 h-3" /></Link></Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold bg-muted/40">
                    <td colSpan={3} className="py-2 px-2">الرصيد الختامي ({formatDateAr(data.period.to)})</td>
                    <td className="py-2 px-2 text-end tabular-nums">{formatCurrency(data.totals.totalDebit)}</td>
                    <td className="py-2 px-2 text-end tabular-nums">{formatCurrency(data.totals.totalCredit)}</td>
                    <td className={`py-2 px-2 text-end tabular-nums text-lg ${data.endingBalance > 0 ? "text-status-danger-foreground" : "text-status-success-foreground"}`}>
                      {formatCurrency(data.endingBalance)}
                    </td>
                    <td className="print:hidden"></td>
                  </tr>
                </tfoot>
              </table></div>
            </CardContent>
          </Card>

          {/* Aging */}
          {data.aging.total > 0 && (
            <Card className="mb-4 print:border print:shadow-none">
              <CardHeader className="pb-2 print:py-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-status-warning-foreground" />
                  أعمار الفواتير المفتوحة
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-start py-2 px-2">السطل</th>
                      <th className="text-end py-2 px-2">المبلغ</th>
                      <th className="text-end py-2 px-2">% من الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { key: "current" as const, label: "حالي (لم يستحق)", color: "" },
                      { key: "1-30" as const, label: "1-30 يوم متأخر", color: "text-status-success-foreground" },
                      { key: "31-60" as const, label: "31-60 يوم متأخر", color: "text-status-warning-foreground" },
                      { key: "61-90" as const, label: "61-90 يوم متأخر", color: "text-status-warning-foreground" },
                      { key: "90+" as const, label: "أكثر من 90 يوم", color: "text-status-danger-foreground" },
                    ].map(b => {
                      const value = data.aging[b.key];
                      const pct = data.aging.total > 0 ? (value / data.aging.total) * 100 : 0;
                      if (value <= 0) return null;
                      return (
                        <tr key={b.key} className="border-b">
                          <td className="py-1.5 px-2">{b.label}</td>
                          <td className={`py-1.5 px-2 text-end tabular-nums font-semibold ${b.color}`}>
                            {formatCurrency(value)}
                          </td>
                          <td className="py-1.5 px-2 text-end tabular-nums text-muted-foreground">
                            {pct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold bg-muted/40">
                      <td className="py-2 px-2">إجمالي المفتوح</td>
                      <td className="py-2 px-2 text-end tabular-nums">{formatCurrency(data.aging.total)}</td>
                      <td className="py-2 px-2 text-end tabular-nums">100%</td>
                    </tr>
                  </tfoot>
                </table></div>
              </CardContent>
            </Card>
          )}

          {/* Footer note for print */}
          <div className="text-[10px] text-muted-foreground border-t pt-2 mt-4">
            هذا كشف حساب آلي صادر من نظام غيث. للاستفسارات يُرجى التواصل مع قسم المالية.
          </div>
        </div>
      )}
    </PageShell>
  );
}
