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
  ScaleIcon, ChevronRight, Search, Download, ChevronDown,
  TrendingUp, TrendingDown, X, ExternalLink, Filter,
} from "lucide-react";
import {
  formatCurrency, formatDateAr, currentYearRiyadh, currentMonthPaddedRiyadh,
} from "@/lib/formatters";

/**
 * Trial Balance with Drill-Down
 *
 * Standard TB grouped by account type, with click-to-expand on each row
 * showing all JE lines that hit that account in the period — running balance
 * per movement, deep links to the source JE.
 *
 * Endpoints:
 *   GET /finance/reports/trial-balance?startDate&endDate
 *   GET /finance/ledger/:code?startDate&endDate
 */

interface TbRow {
  id: number;
  code: string;
  name: string;
  type: string;
  level: number;
  allowPosting: boolean;
  totalDebit: number | string;
  totalCredit: number | string;
  balance: number | string;
}

interface TbResp {
  data: TbRow[];
  summary: { totalDebit: number; totalCredit: number; isBalanced: boolean };
  byType: Record<string, { totalDebit: number; totalCredit: number; balance: number }>;
}

interface LedgerResp {
  account: { code: string; name: string; type: string };
  summary: { totalDebit: number; totalCredit: number; balance: number; count: number };
  entries: Array<{
    id: number;
    ref: string;
    description: string;
    date: string;
    debit: number | string;
    credit: number | string;
    runningBalance: number;
  }>;
}

const TYPE_LABELS: Record<string, { label: string; order: number; color: string }> = {
  asset:     { label: "أصول",      order: 1, color: "bg-status-info-foreground" },
  liability: { label: "خصوم",      order: 2, color: "bg-status-warning-foreground" },
  equity:    { label: "حقوق ملكية", order: 3, color: "bg-status-success-foreground" },
  revenue:   { label: "إيرادات",    order: 4, color: "bg-status-success-foreground" },
  expense:   { label: "مصاريف",     order: 5, color: "bg-status-danger-foreground" },
};

export default function TrialBalanceDrilldownPage() {
  const [year, setYear] = useState(currentYearRiyadh());
  const [month, setMonth] = useState(currentMonthPaddedRiyadh());
  const [scope, setScope] = useState<"month" | "ytd">("month");
  const [search, setSearch] = useState("");
  const [showZeros, setShowZeros] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { startDate, endDate, label } = useMemo(() => {
    const lastDay = new Date(Date.UTC(year, Number(month), 0)).getUTCDate();
    const endDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
    if (scope === "ytd") {
      return { startDate: `${year}-01-01`, endDate, label: `${year} حتى ${month}` };
    }
    return { startDate: `${year}-${month}-01`, endDate, label: `${month}/${year}` };
  }, [year, month, scope]);

  const { data, isLoading } = useApiQuery<TbResp>(
    ["tb-drilldown", String(year), month, scope],
    `/finance/reports/trial-balance?startDate=${startDate}&endDate=${endDate}`,
  );

  const { data: ledger, isLoading: ledgerLoading } = useApiQuery<LedgerResp>(
    ["ledger-drilldown", expanded ?? "", startDate, endDate],
    expanded ? `/finance/ledger/${expanded}?startDate=${startDate}&endDate=${endDate}` : null,
  );

  const filtered = useMemo(() => {
    if (!data?.data) return [];
    let rows = data.data;
    if (!showZeros) {
      rows = rows.filter(r => Number(r.totalDebit) > 0 || Number(r.totalCredit) > 0 || Math.abs(Number(r.balance)) > 0.01);
    }
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(r => r.code.toLowerCase().includes(s) || r.name.toLowerCase().includes(s));
    }
    return rows;
  }, [data, showZeros, search]);

  const grouped = useMemo(() => {
    const out = new Map<string, TbRow[]>();
    for (const r of filtered) {
      if (!out.has(r.type)) out.set(r.type, []);
      out.get(r.type)!.push(r);
    }
    return Array.from(out.entries()).sort(([a], [b]) =>
      (TYPE_LABELS[a]?.order ?? 99) - (TYPE_LABELS[b]?.order ?? 99)
    );
  }, [filtered]);

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`ميزان مراجعة — ${label}`);
    lines.push(`من ${startDate} إلى ${endDate}`);
    lines.push("");
    lines.push("الرمز,الاسم,النوع,مدين,دائن,الرصيد");
    for (const [type, rows] of grouped) {
      const typeLabel = TYPE_LABELS[type]?.label ?? type;
      for (const r of rows) {
        lines.push([
          r.code,
          (r.name ?? "").replace(/,/g, "،"),
          typeLabel,
          Number(r.totalDebit).toFixed(2),
          Number(r.totalCredit).toFixed(2),
          Number(r.balance).toFixed(2),
        ].join(","));
      }
    }
    lines.push("");
    lines.push(`الإجمالي,,,${data.summary.totalDebit.toFixed(2)},${data.summary.totalCredit.toFixed(2)},`);

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
        entityType: "report_trial_balance_drilldown",
        title: String(`trial-balance-${startDate}_${endDate}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="ميزان المراجعة مع التتبّع"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "ميزان المراجعة مع التتبّع" },
      ]}
      subtitle="ميزان مراجعة تفصيلي قابل للنقر — انقر على أي حساب لتفجير حركاته"
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">النطاق</label>
              <div className="flex gap-1">
                <Button variant={scope === "month" ? "default" : "outline"} size="sm" onClick={() => setScope("month")}>شهر</Button>
                <Button variant={scope === "ytd" ? "default" : "outline"} size="sm" onClick={() => setScope("ytd")}>حتى تاريخه</Button>
              </div>
            </div>
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
            <div className="flex-1 min-w-48">
              <label className="text-xs text-muted-foreground mb-1 block">بحث</label>
              <div className="relative">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="رمز أو اسم الحساب..."
                  className="pr-9"
                />
              </div>
            </div>
            <Button
              variant={showZeros ? "default" : "outline"}
              size="sm"
              onClick={() => setShowZeros(s => !s)}
            >
              <Filter className="w-4 h-4 ml-1" />
              {showZeros ? "إخفاء الأصفار" : "إظهار الأصفار"}
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
              <Download className="w-4 h-4 ml-1" />
              CSV
            </Button>
            <PrintButton
              entityType="report_trial_balance_drilldown"
              entityId={`${startDate}..${endDate}`}
              payload={{
                entity: {
                  title: "ميزان المراجعة — التفصيلي",
                  period: label,
                  startDate, endDate,
                  totalDebit: data?.summary?.totalDebit ?? 0,
                  totalCredit: data?.summary?.totalCredit ?? 0,
                  isBalanced: data?.summary?.isBalanced ?? false,
                },
                items: (data?.data ?? []).map((r: TbRow) => ({
                  "الكود": r.code,
                  "اسم الحساب": r.name,
                  "النوع": r.type,
                  "مدين": Number(r.totalDebit ?? 0),
                  "دائن": Number(r.totalCredit ?? 0),
                  "الرصيد": Number(r.balance ?? 0),
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
          {/* Top summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">إجمالي المدين</div>
                <div className="text-xl font-bold tabular-nums">{formatCurrency(data.summary.totalDebit)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">إجمالي الدائن</div>
                <div className="text-xl font-bold tabular-nums">{formatCurrency(data.summary.totalCredit)}</div>
              </CardContent>
            </Card>
            <Card className={data.summary.isBalanced ? "border-status-success-foreground" : "border-status-danger-foreground border-2"}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">الحالة</div>
                <div className={`text-xl font-bold ${data.summary.isBalanced ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                  {data.summary.isBalanced ? "✓ متوازن" : "✗ غير متوازن"}
                </div>
                {!data.summary.isBalanced && (
                  <div className="text-[11px] text-status-danger-foreground mt-1">
                    فرق: {formatCurrency(Math.abs(data.summary.totalDebit - data.summary.totalCredit))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">الحسابات النشطة</div>
                <div className="text-xl font-bold tabular-nums">{filtered.length}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
              </CardContent>
            </Card>
          </div>

          {/* TB grouped by type */}
          {grouped.map(([type, rows]) => {
            const meta = TYPE_LABELS[type] ?? { label: type, color: "bg-muted" };
            const typeTotalDebit = rows.reduce((s, r) => s + Number(r.totalDebit), 0);
            const typeTotalCredit = rows.reduce((s, r) => s + Number(r.totalCredit), 0);
            const typeBalance = rows.reduce((s, r) => s + Number(r.balance), 0);
            return (
              <Card key={type} className="mb-3">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className={`w-2 h-6 rounded ${meta.color}`} />
                      {meta.label}
                      <Badge variant="outline">{rows.length}</Badge>
                    </CardTitle>
                    <div className="text-sm tabular-nums text-muted-foreground">
                      رصيد: <strong>{formatCurrency(typeBalance)}</strong>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-start py-2 px-2 w-6"></th>
                        <th className="text-start py-2 px-2 w-24">الرمز</th>
                        <th className="text-start py-2 px-2">الاسم</th>
                        <th className="text-end py-2 px-2 w-32">مدين</th>
                        <th className="text-end py-2 px-2 w-32">دائن</th>
                        <th className="text-end py-2 px-2 w-32">الرصيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => {
                        const isOpen = expanded === r.code;
                        const bal = Number(r.balance);
                        return (
                          <>
                            <tr
                              key={r.code}
                              className={`border-b cursor-pointer ${isOpen ? "bg-status-info-surface" : "hover:bg-muted/30"}`}
                              onClick={() => setExpanded(isOpen ? null : r.code)}
                            >
                              <td className="py-2 px-2">
                                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </td>
                              <td className="py-2 px-2 font-mono text-xs">{r.code}</td>
                              <td className="py-2 px-2">{r.name}</td>
                              <td className="py-2 px-2 text-end tabular-nums">
                                {Number(r.totalDebit) > 0 ? formatCurrency(Number(r.totalDebit)) : "—"}
                              </td>
                              <td className="py-2 px-2 text-end tabular-nums">
                                {Number(r.totalCredit) > 0 ? formatCurrency(Number(r.totalCredit)) : "—"}
                              </td>
                              <td className="py-2 px-2 text-end tabular-nums font-semibold">
                                {bal >= 0 ? formatCurrency(bal) : (
                                  <span className="text-status-danger-foreground">({formatCurrency(Math.abs(bal))})</span>
                                )}
                              </td>
                            </tr>
                            {isOpen && (
                              <tr>
                                <td colSpan={6} className="bg-muted/10 p-3 border-b">
                                  <AccountDrillDown
                                    code={r.code}
                                    name={r.name}
                                    ledger={ledger}
                                    isLoading={ledgerLoading}
                                  />
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold bg-muted/40">
                        <td colSpan={3} className="py-2 px-2">إجمالي {meta.label}</td>
                        <td className="py-2 px-2 text-end tabular-nums">{formatCurrency(typeTotalDebit)}</td>
                        <td className="py-2 px-2 text-end tabular-nums">{formatCurrency(typeTotalCredit)}</td>
                        <td className="py-2 px-2 text-end tabular-nums">{formatCurrency(typeBalance)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </PageShell>
  );
}

function AccountDrillDown({
  code, name, ledger, isLoading,
}: {
  code: string;
  name: string;
  ledger: LedgerResp | null | undefined;
  isLoading: boolean;
}) {
  if (isLoading) return <LoadingSpinner />;
  if (!ledger) return <div className="text-sm text-muted-foreground">لا توجد بيانات</div>;
  const entries = ledger.entries ?? [];
  if (entries.length === 0) {
    return <div className="text-sm text-muted-foreground py-2">لا حركات في الفترة</div>;
  }

  const peakDebit = entries.reduce((m, e) => Math.max(m, Number(e.debit)), 0);
  const peakCredit = entries.reduce((m, e) => Math.max(m, Number(e.credit)), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{code} — {name}</div>
          <div className="text-xs text-muted-foreground">
            {entries.length} حركة • صافي {formatCurrency(ledger.summary.balance)}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-status-success-foreground" />
            <span>أعلى مدين: {formatCurrency(peakDebit)}</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-status-danger-foreground" />
            <span>أعلى دائن: {formatCurrency(peakCredit)}</span>
          </div>
          <Button asChild variant="outline" size="sm" className="h-7 text-xs"><Link href={`/finance/account-recon-workpaper?accountCode=${code}`}>
              تسوية هذا الحساب
            </Link></Button>
        </div>
      </div>
      <div className="border rounded max-h-80 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background border-b">
            <tr className="text-muted-foreground">
              <th className="text-start py-1.5 px-2">التاريخ</th>
              <th className="text-start py-1.5 px-2">المرجع</th>
              <th className="text-start py-1.5 px-2">الوصف</th>
              <th className="text-end py-1.5 px-2">مدين</th>
              <th className="text-end py-1.5 px-2">دائن</th>
              <th className="text-end py-1.5 px-2">الرصيد التراكمي</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="py-1.5 px-2 whitespace-nowrap tabular-nums">
                  {formatDateAr(e.date.split("T")[0])}
                </td>
                <td className="py-1.5 px-2 font-mono">{e.ref}</td>
                <td className="py-1.5 px-2 max-w-xs truncate" title={e.description}>{e.description}</td>
                <td className="py-1.5 px-2 text-end tabular-nums">
                  {Number(e.debit) > 0 ? (
                    <span className="text-status-success-foreground">{formatCurrency(Number(e.debit))}</span>
                  ) : "—"}
                </td>
                <td className="py-1.5 px-2 text-end tabular-nums">
                  {Number(e.credit) > 0 ? (
                    <span className="text-status-danger-foreground">{formatCurrency(Number(e.credit))}</span>
                  ) : "—"}
                </td>
                <td className="py-1.5 px-2 text-end tabular-nums font-semibold">
                  {formatCurrency(e.runningBalance)}
                </td>
                <td className="py-1.5 px-2">
                  <Button asChild variant="ghost" size="icon" title="فتح في نافذة جديدة" className="h-6 w-6"><Link href={`/finance/journal/${e.id}`}><ExternalLink className="w-3 h-3" /></Link></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
