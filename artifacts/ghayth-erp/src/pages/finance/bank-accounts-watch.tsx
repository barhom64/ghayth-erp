import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  Landmark, TrendingUp, TrendingDown, ChevronRight, Download,
  Activity, AlertTriangle, RefreshCw, Calendar, Banknote,
} from "lucide-react";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";

/**
 * Bank Accounts Watch — at-a-glance liquidity per bank
 *
 * Lists every cash/bank GL account (code 11xx) with current balance,
 * last 30 days net change, and a mini sparkline of running balance.
 * Click an account to see its recent ledger entries.
 *
 * Endpoints:
 *   GET /finance/accounts?type=asset → discover cash/bank codes
 *   GET /finance/ledger/:code?startDate&endDate (per account, 12 parallel)
 */

interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
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

function addDaysUtc(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default function BankAccountsWatchPage() {
  const today = todayLocal();
  const startDate = addDaysUtc(today, -30);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const { data: accountsResp, isLoading: accLoading } = useApiQuery<{ data: Account[] }>(
    ["bank-accounts-watch-coa"],
    `/finance/accounts?type=asset`,
  );

  // Filter to cash/bank accounts (code starts with 11)
  const bankAccounts = useMemo(() => {
    return (accountsResp?.data ?? [])
      .filter(a => String(a.code).startsWith("11"))
      .sort((a, b) => a.code.localeCompare(b.code))
      .slice(0, 12); // cap at 12 for parallel queries
  }, [accountsResp]);

  // 12 hard-coded queries (rules of hooks compliant)
  const codes = bankAccounts.map(a => a.code);
  const q0 = useApiQuery<LedgerResp>(["baw", codes[0] ?? "", today], codes[0] ? `/finance/ledger/${codes[0]}?startDate=${startDate}&endDate=${today}` : null);
  const q1 = useApiQuery<LedgerResp>(["baw", codes[1] ?? "", today], codes[1] ? `/finance/ledger/${codes[1]}?startDate=${startDate}&endDate=${today}` : null);
  const q2 = useApiQuery<LedgerResp>(["baw", codes[2] ?? "", today], codes[2] ? `/finance/ledger/${codes[2]}?startDate=${startDate}&endDate=${today}` : null);
  const q3 = useApiQuery<LedgerResp>(["baw", codes[3] ?? "", today], codes[3] ? `/finance/ledger/${codes[3]}?startDate=${startDate}&endDate=${today}` : null);
  const q4 = useApiQuery<LedgerResp>(["baw", codes[4] ?? "", today], codes[4] ? `/finance/ledger/${codes[4]}?startDate=${startDate}&endDate=${today}` : null);
  const q5 = useApiQuery<LedgerResp>(["baw", codes[5] ?? "", today], codes[5] ? `/finance/ledger/${codes[5]}?startDate=${startDate}&endDate=${today}` : null);
  const q6 = useApiQuery<LedgerResp>(["baw", codes[6] ?? "", today], codes[6] ? `/finance/ledger/${codes[6]}?startDate=${startDate}&endDate=${today}` : null);
  const q7 = useApiQuery<LedgerResp>(["baw", codes[7] ?? "", today], codes[7] ? `/finance/ledger/${codes[7]}?startDate=${startDate}&endDate=${today}` : null);
  const q8 = useApiQuery<LedgerResp>(["baw", codes[8] ?? "", today], codes[8] ? `/finance/ledger/${codes[8]}?startDate=${startDate}&endDate=${today}` : null);
  const q9 = useApiQuery<LedgerResp>(["baw", codes[9] ?? "", today], codes[9] ? `/finance/ledger/${codes[9]}?startDate=${startDate}&endDate=${today}` : null);
  const q10 = useApiQuery<LedgerResp>(["baw", codes[10] ?? "", today], codes[10] ? `/finance/ledger/${codes[10]}?startDate=${startDate}&endDate=${today}` : null);
  const q11 = useApiQuery<LedgerResp>(["baw", codes[11] ?? "", today], codes[11] ? `/finance/ledger/${codes[11]}?startDate=${startDate}&endDate=${today}` : null);

  const queries = [q0, q1, q2, q3, q4, q5, q6, q7, q8, q9, q10, q11];

  const accountStats = useMemo(() => {
    return bankAccounts.map((acc, i) => {
      const q = queries[i];
      const data = q?.data;
      const balance = data?.summary?.balance ?? 0;
      const entries = data?.entries ?? [];
      const netChange = entries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0);
      const inflow = entries.reduce((s, e) => s + Number(e.debit), 0);
      const outflow = entries.reduce((s, e) => s + Number(e.credit), 0);
      const openingBalance = balance - netChange;
      // Sparkline points: take running balances at evenly-spaced positions
      const points = entries.length > 0
        ? entries.map(e => e.runningBalance)
        : [];
      return {
        account: acc,
        balance,
        openingBalance,
        netChange,
        inflow,
        outflow,
        entriesCount: entries.length,
        points,
        recentEntries: entries.slice(-10).reverse(),
      };
    });
  }, [bankAccounts, ...queries.map(q => q.data)]);

  const totalBalance = accountStats.reduce((s, a) => s + a.balance, 0);
  const totalInflow = accountStats.reduce((s, a) => s + a.inflow, 0);
  const totalOutflow = accountStats.reduce((s, a) => s + a.outflow, 0);
  const totalNetChange = totalInflow - totalOutflow;
  const lowBalanceCount = accountStats.filter(a => a.balance < 5000 && a.balance >= 0).length;
  const negativeBalanceCount = accountStats.filter(a => a.balance < 0).length;

  const selected = accountStats.find(a => a.account.code === selectedCode);

  const exportCSV = () => {
    const lines: string[] = [];
    lines.push(`نظرة على الحسابات البنكية — ${today}`);
    lines.push("");
    lines.push("الرمز,الاسم,الرصيد الافتتاحي (قبل 30 يوم),إجمالي الداخل,إجمالي الخارج,صافي,الرصيد الحالي,عدد الحركات");
    for (const a of accountStats) {
      lines.push([
        a.account.code,
        a.account.name.replace(/,/g, "،"),
        a.openingBalance.toFixed(2),
        a.inflow.toFixed(2),
        a.outflow.toFixed(2),
        a.netChange.toFixed(2),
        a.balance.toFixed(2),
        a.entriesCount.toString(),
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
        entityType: "report_bank_accounts_watch",
        title: String(`bank-accounts-watch-${today}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="مراقبة الحسابات البنكية"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "مراقبة الحسابات البنكية" },
      ]}
      subtitle="نظرة فورية على رصيد كل حساب نقدي/بنكي + حركة آخر 30 يوم"
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/bank-reconciliation">
              <RefreshCw className="h-3.5 w-3.5 ml-1" />
              التسوية البنكية
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/cash-position-calculator">
              <Banknote className="h-3.5 w-3.5 ml-1" />
              مركز السيولة
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/cash-calendar">
              <Calendar className="h-3.5 w-3.5 ml-1" />
              تقويم النقد
            </Link></Button>
        </div>
      }
    >
      <FinanceTabsNav />

      {/* Toolbar */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            عرض {bankAccounts.length} حساب بنكي/نقدي (رمز 11xx) • {startDate} → {today}
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={bankAccounts.length === 0}>
            <Download className="w-4 h-4 ml-1" />
            CSV
          </Button>
          <PrintButton
            entityType="report_bank_accounts_watch"
            entityId={`${startDate}..${today}`}
            payload={{
              entity: { title: "متابعة الحسابات البنكية", startDate, today, count: bankAccounts.length },
              items: bankAccounts,
            }}
          />
        </CardContent>
      </Card>

      {accLoading ? (
        <LoadingSpinner />
      ) : bankAccounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            لم يتم العثور على حسابات بنكية. أنشئ حساباً برمز يبدأ بـ 11.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Landmark className="w-3 h-3" />
                  إجمالي السيولة
                </div>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(totalBalance)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{bankAccounts.length} حساب</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-status-success-foreground" />
                  داخل خلال 30 يوم
                </div>
                <div className="text-xl font-bold tabular-nums text-status-success-foreground">
                  +{formatCurrency(totalInflow)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-status-danger-foreground" />
                  خارج خلال 30 يوم
                </div>
                <div className="text-xl font-bold tabular-nums text-status-danger-foreground">
                  -{formatCurrency(totalOutflow)}
                </div>
              </CardContent>
            </Card>
            <Card className={totalNetChange < 0 ? "border-status-warning-foreground" : "border-status-success-foreground"}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  صافي 30 يوم
                </div>
                <div className={`text-xl font-bold tabular-nums ${totalNetChange >= 0 ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                  {totalNetChange >= 0 ? "+" : ""}{formatCurrency(totalNetChange)}
                </div>
                {(negativeBalanceCount > 0 || lowBalanceCount > 0) && (
                  <div className="text-[11px] text-status-warning-foreground mt-1">
                    {negativeBalanceCount > 0 && `${negativeBalanceCount} سالب • `}
                    {lowBalanceCount > 0 && `${lowBalanceCount} منخفض`}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Account grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {accountStats.map(a => {
              const isLow = a.balance >= 0 && a.balance < 5000;
              const isNeg = a.balance < 0;
              const isSelected = selectedCode === a.account.code;
              const trend = a.netChange >= 0 ? "up" : "down";
              return (
                <Card
                  key={a.account.code}
                  className={`cursor-pointer transition ${isSelected ? "border-status-info-foreground border-2" : ""} ${isNeg ? "border-status-danger-foreground" : isLow ? "border-status-warning-foreground" : ""}`}
                  onClick={() => setSelectedCode(isSelected ? null : a.account.code)}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <div className="font-mono text-[11px] text-muted-foreground">{a.account.code}</div>
                        <div className="font-semibold text-sm">{a.account.name}</div>
                      </div>
                      {isNeg && <AlertTriangle className="w-4 h-4 text-status-danger-foreground" />}
                      {isLow && <AlertTriangle className="w-4 h-4 text-status-warning-foreground" />}
                    </div>
                    <div className={`text-2xl font-bold tabular-nums ${isNeg ? "text-status-danger-foreground" : ""}`}>
                      {formatCurrency(a.balance)}
                    </div>
                    <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t">
                      <div className="text-muted-foreground">
                        قبل 30 يوم: {formatCurrency(a.openingBalance)}
                      </div>
                      <div className={`flex items-center gap-0.5 font-semibold ${trend === "up" ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                        {trend === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {a.netChange >= 0 ? "+" : ""}{formatCurrency(a.netChange)}
                      </div>
                    </div>
                    {a.points.length > 0 && (
                      <Sparkline points={a.points} trend={trend} />
                    )}
                    <div className="flex items-center justify-between text-[11px] mt-2 text-muted-foreground">
                      <span>{a.entriesCount} حركة</span>
                      <span className="flex items-center gap-1">
                        <span className="text-status-success-foreground">+{formatCurrency(a.inflow)}</span>
                        <span>/</span>
                        <span className="text-status-danger-foreground">-{formatCurrency(a.outflow)}</span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Drill-down */}
          {selected && selected.recentEntries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>آخر 10 حركات — {selected.account.code} {selected.account.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCode(null)}>إغلاق</Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-start py-2 px-2">التاريخ</th>
                      <th className="text-start py-2 px-2">المرجع</th>
                      <th className="text-start py-2 px-2">الوصف</th>
                      <th className="text-end py-2 px-2">داخل</th>
                      <th className="text-end py-2 px-2">خارج</th>
                      <th className="text-end py-2 px-2">الرصيد</th>
                      <th className="py-2 px-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.recentEntries.map(e => (
                      <tr key={e.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 px-2 text-xs tabular-nums whitespace-nowrap">
                          {formatDateAr(e.date.split("T")[0])}
                        </td>
                        <td className="py-2 px-2 font-mono text-xs">{e.ref}</td>
                        <td className="py-2 px-2 text-xs max-w-xs truncate" title={e.description}>
                          {e.description}
                        </td>
                        <td className="py-2 px-2 text-end tabular-nums">
                          {Number(e.debit) > 0 ? (
                            <span className="text-status-success-foreground">+{formatCurrency(Number(e.debit))}</span>
                          ) : "—"}
                        </td>
                        <td className="py-2 px-2 text-end tabular-nums">
                          {Number(e.credit) > 0 ? (
                            <span className="text-status-danger-foreground">-{formatCurrency(Number(e.credit))}</span>
                          ) : "—"}
                        </td>
                        <td className="py-2 px-2 text-end tabular-nums font-semibold">
                          {formatCurrency(e.runningBalance)}
                        </td>
                        <td className="py-2 px-2">
                          <Button asChild variant="ghost" size="icon" title="التالي" className="h-7 w-7"><Link href={`/finance/journal/${e.id}`}><ChevronRight className="w-3 h-3" /></Link></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}

function Sparkline({ points, trend }: { points: number[]; trend: "up" | "down" }) {
  const w = 200;
  const h = 30;
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${h - ((p - min) / range) * h}`)
    .join(" ");
  const color = trend === "up" ? "stroke-status-success-foreground" : "stroke-status-danger-foreground";
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="mt-2" preserveAspectRatio="none">
      <path d={path} fill="none" strokeWidth="1.5" className={color} />
    </svg>
  );
}
