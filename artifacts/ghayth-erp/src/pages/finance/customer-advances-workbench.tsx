import { useMemo, useState } from "react";
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
  DollarSign, Search, Users, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, Download, ExternalLink, Plus,
} from "lucide-react";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";

/**
 * Customer Advances Workbench
 *
 * Per-customer view of all advance payments received with how much is
 * applied vs remaining. Practical for the AR clerk: see at a glance
 * which customers have unused advance balances that can be applied
 * to current invoices.
 *
 * Endpoint: GET /finance/customer-advances
 */

interface AdvanceRow {
  id: number;
  ref: string;
  amount: number | string;
  appliedAmount: number | string;
  remaining: number | string;
  method?: string;
  receivedDate: string;
  status: string;
  journalId?: number | null;
  createdAt: string;
  clientId?: number | null;
  clientName?: string | null;
}

interface ListResp {
  data: AdvanceRow[];
}

interface ClientGroup {
  clientId: number | null;
  clientName: string;
  advances: AdvanceRow[];
  totalReceived: number;
  totalApplied: number;
  totalRemaining: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open:    { label: "نشطة", color: "text-status-info-foreground" },
  partial: { label: "مطبَّقة جزئياً", color: "text-status-warning-foreground" },
  applied: { label: "مطبَّقة بالكامل", color: "text-status-success-foreground" },
  cancelled: { label: "ملغاة", color: "text-muted-foreground" },
};

type Filter = "has-remaining" | "all" | "fully-applied";

export default function CustomerAdvancesWorkbenchPage() {
  const today = todayLocal();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("has-remaining");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useApiQuery<ListResp>(
    ["cust-adv-wb"],
    `/finance/customer-advances`,
  );

  const filteredRows = useMemo(() => {
    const rows = data?.data ?? [];
    let list = rows;
    if (filter === "has-remaining") {
      list = rows.filter(r => Number(r.remaining) > 0.01);
    } else if (filter === "fully-applied") {
      list = rows.filter(r => Number(r.remaining) <= 0.01 && r.status !== "cancelled");
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(r =>
        (r.clientName ?? "").toLowerCase().includes(s) ||
        r.ref.toLowerCase().includes(s)
      );
    }
    return list;
  }, [data, filter, search]);

  const groups = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, ClientGroup>();
    for (const a of filteredRows) {
      const key = a.clientId != null ? `c_${a.clientId}` : `unknown_${a.id}`;
      const name = a.clientName ?? "—";
      const cur = map.get(key) ?? {
        clientId: a.clientId ?? null,
        clientName: name,
        advances: [],
        totalReceived: 0,
        totalApplied: 0,
        totalRemaining: 0,
      };
      cur.advances.push(a);
      cur.totalReceived += Number(a.amount);
      cur.totalApplied += Number(a.appliedAmount);
      cur.totalRemaining += Number(a.remaining);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.totalRemaining - a.totalRemaining);
  }, [filteredRows]);

  const totalRemaining = groups.reduce((s, g) => s + g.totalRemaining, 0);
  const totalApplied = groups.reduce((s, g) => s + g.totalApplied, 0);
  const totalReceived = groups.reduce((s, g) => s + g.totalReceived, 0);
  const customersWithRemaining = groups.filter(g => g.totalRemaining > 0.01).length;

  const toggle = (key: string) => {
    setExpanded(s => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exportCSV = () => {
    const lines: string[] = [];
    lines.push(`دفعات مقدمة من العملاء — ${today}`);
    lines.push("");
    lines.push("العميل,مرجع,تاريخ الاستلام,طريقة,المبلغ,مطبَّق,متبقي,الحالة");
    for (const g of groups) {
      for (const a of g.advances) {
        lines.push([
          g.clientName.replace(/,/g, "،"),
          a.ref,
          a.receivedDate.split("T")[0],
          a.method ?? "",
          Number(a.amount).toFixed(2),
          Number(a.appliedAmount).toFixed(2),
          Number(a.remaining).toFixed(2),
          STATUS_LABELS[a.status]?.label ?? a.status,
        ].join(","));
      }
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-advances-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell
      title="منضدة الدفعات المقدمة"
      subtitle="إدارة الدفعات المقدمة من العملاء — اعرف أرصدتها وطبّقها على الفواتير"
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
                  placeholder="اسم عميل أو مرجع..."
                  className="pr-9"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الفلتر</label>
              <div className="flex gap-1">
                <Button variant={filter === "has-remaining" ? "default" : "outline"} size="sm" onClick={() => setFilter("has-remaining")}>
                  لها متبقي
                </Button>
                <Button variant={filter === "fully-applied" ? "default" : "outline"} size="sm" onClick={() => setFilter("fully-applied")}>
                  مطبَّقة
                </Button>
                <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
                  الكل
                </Button>
              </div>
            </div>
            <Link href="/finance/receivables">
              <Button size="sm">
                <Plus className="w-4 h-4 ml-1" />
                دفعة جديدة
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
              <Download className="w-4 h-4 ml-1" />
              CSV
            </Button>
            <PrintButton
              entityType="report_customer_advances"
              entityId="all"
              payload={{
                entity: {
                  title: "ورشة دفعات العملاء المقدّمة",
                  count: data?.data?.length ?? 0,
                  totalAdvances: (data?.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0),
                  totalRemaining: (data?.data ?? []).reduce((s, r) => s + Number(r.remaining ?? 0), 0),
                },
                items: (data?.data ?? []).map((r) => ({
                  "المرجع": r.ref,
                  "العميل": r.clientName ?? `#${r.clientId ?? ""}`,
                  "المبلغ": Number(r.amount ?? 0),
                  "المطبَّق": Number(r.appliedAmount ?? 0),
                  "المتبقي": Number(r.remaining ?? 0),
                  "طريقة الاستلام": r.method ?? "",
                  "تاريخ الاستلام": r.receivedDate,
                  "الحالة": r.status,
                })),
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  عملاء بأرصدة
                </div>
                <div className="text-2xl font-bold tabular-nums">{customersWithRemaining}</div>
                <div className="text-[11px] text-muted-foreground mt-1">من {groups.length} عميل</div>
              </CardContent>
            </Card>
            <Card className={totalRemaining > 0 ? "border-status-info-foreground" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-status-info-foreground" />
                  متبقي قابل للتطبيق
                </div>
                <div className={`text-2xl font-bold tabular-nums ${totalRemaining > 0 ? "text-status-info-foreground" : ""}`}>
                  {formatCurrency(totalRemaining)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">يمكن خصمها من فواتير قادمة</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">إجمالي المُطبَّق</div>
                <div className="text-2xl font-bold tabular-nums text-status-success-foreground">
                  {formatCurrency(totalApplied)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {totalReceived > 0 ? `${((totalApplied / totalReceived) * 100).toFixed(1)}%` : "—"} من المُستلَم
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">إجمالي المُستلَم</div>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(totalReceived)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Customer groups */}
          {groups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-status-success-foreground" />
                {filter === "has-remaining" ? "لا توجد دفعات مقدمة لها متبقي 🎉" : "لا توجد دفعات مقدمة"}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {groups.map(g => {
                const key = `c_${g.clientId ?? g.clientName}`;
                const isOpen = expanded.has(key);
                return (
                  <Card key={key}>
                    <CardHeader
                      className="pb-3 cursor-pointer hover:bg-muted/30"
                      onClick={() => toggle(key)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          <div className="min-w-0">
                            <div className="font-semibold text-sm">{g.clientName}</div>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                              <span>{g.advances.length} دفعة</span>
                              <span>مُستلَم {formatCurrency(g.totalReceived)}</span>
                              <span className="text-status-success-foreground">طُبِّق {formatCurrency(g.totalApplied)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-end">
                          <div className={`font-bold tabular-nums ${g.totalRemaining > 0 ? "text-status-info-foreground" : "text-muted-foreground"}`}>
                            {formatCurrency(g.totalRemaining)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">متبقي</div>
                        </div>
                      </div>
                    </CardHeader>
                    {isOpen && (
                      <CardContent className="pt-0">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-xs text-muted-foreground">
                              <th className="text-start py-2 px-2">المرجع</th>
                              <th className="text-start py-2 px-2">التاريخ</th>
                              <th className="text-start py-2 px-2">الطريقة</th>
                              <th className="text-end py-2 px-2">المبلغ</th>
                              <th className="text-end py-2 px-2">المُطبَّق</th>
                              <th className="text-end py-2 px-2">المتبقي</th>
                              <th className="py-2 px-2">الحالة</th>
                              <th className="py-2 px-2 w-16"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.advances.map(a => {
                              const status = STATUS_LABELS[a.status] ?? { label: a.status, color: "" };
                              return (
                                <tr key={a.id} className="border-b hover:bg-muted/30">
                                  <td className="py-1.5 px-2 font-mono text-xs">{a.ref}</td>
                                  <td className="py-1.5 px-2 text-xs">
                                    {formatDateAr(a.receivedDate.split("T")[0])}
                                  </td>
                                  <td className="py-1.5 px-2 text-xs">{a.method ?? "—"}</td>
                                  <td className="py-1.5 px-2 text-end tabular-nums">{formatCurrency(Number(a.amount))}</td>
                                  <td className="py-1.5 px-2 text-end tabular-nums text-status-success-foreground">
                                    {Number(a.appliedAmount) > 0 ? formatCurrency(Number(a.appliedAmount)) : "—"}
                                  </td>
                                  <td className={`py-1.5 px-2 text-end tabular-nums font-semibold ${Number(a.remaining) > 0 ? "text-status-info-foreground" : ""}`}>
                                    {Number(a.remaining) > 0.01 ? formatCurrency(Number(a.remaining)) : "—"}
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <Badge variant="outline" className={`text-[10px] ${status.color}`}>
                                      {status.label}
                                    </Badge>
                                  </td>
                                  <td className="py-1.5 px-2">
                                    {a.journalId && (
                                      <Link href={`/finance/journal/${a.journalId}`}>
                                        <Button variant="ghost" size="icon" className="h-7 w-7">
                                          <ExternalLink className="w-3 h-3" />
                                        </Button>
                                      </Link>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {g.clientId && (
                          <div className="flex justify-end gap-2 mt-3 border-t pt-3">
                            {g.totalRemaining > 0.01 && (
                              <Link href={`/finance/receivables?clientId=${g.clientId}`}>
                                <Button size="sm" variant="outline">
                                  <DollarSign className="w-4 h-4 ml-1" />
                                  تطبيق على فاتورة
                                </Button>
                              </Link>
                            )}
                            <Link href={`/finance/customer-360-sheet?clientId=${g.clientId}`}>
                              <Button size="sm" variant="outline">
                                <Users className="w-4 h-4 ml-1" />
                                ملف العميل 360°
                              </Button>
                            </Link>
                          </div>
                        )}
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
