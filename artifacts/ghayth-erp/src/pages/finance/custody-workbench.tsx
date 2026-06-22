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
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import {
  KeyRound, AlertTriangle, ChevronDown, ChevronRight, Search,
  ExternalLink, Download, Users, Clock, CheckCircle2,
} from "lucide-react";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";

/**
 * Custody Workbench
 *
 * Groups outstanding employee custodies by employee, with aging buckets
 * and one-click settle. Sister to AR Collection / Vendor Settlement
 * workbenches but focused on cash-advance custodies given to staff.
 *
 * Endpoint: GET /finance/custodies
 */

interface CustodyRow {
  id: number;
  ref: string;
  description: string;
  amount: number;
  date: string;
  expectedReturnDate?: string | null;
  employeeName?: string | null;
  assignmentId?: number | null;
  custodyAccountCode?: string;
  custodyAccountName?: string;
  settledAmount: number;
  remainingAmount: number;
  status: "active" | "partial" | "overdue" | "settled" | "pending" | "rejected" | "returned";
  daysOverdue: number;
  approvalStatus: string;
  purpose?: string | null;
}

interface ListResp {
  data: CustodyRow[];
  summary: {
    total: number;
    totalAmount: number;
    totalRemaining: number;
    activeCount: number;
    overdueCount: number;
    pendingCount: number;
  };
}

const STATUS_DEFS: Record<CustodyRow["status"], { label: string; color: string; surface: string }> = {
  active:    { label: "نشط",        color: "text-status-info-foreground",    surface: "bg-status-info-surface" },
  partial:   { label: "مسوّى جزئياً", color: "text-status-warning-foreground", surface: "bg-status-warning-surface" },
  overdue:   { label: "متأخر",       color: "text-status-danger-foreground",  surface: "bg-status-danger-surface" },
  settled:   { label: "مسوّى",       color: "text-status-success-foreground", surface: "bg-status-success-surface" },
  pending:   { label: "بانتظار اعتماد", color: "text-status-warning-foreground", surface: "bg-status-warning-surface" },
  rejected:  { label: "مرفوض",       color: "text-muted-foreground",          surface: "bg-muted" },
  returned:  { label: "مُرتجع",       color: "text-muted-foreground",          surface: "bg-muted" },
};

type Filter = "outstanding" | "overdue" | "pending" | "all";

interface EmployeeGroup {
  employeeName: string;
  assignmentId: number | null;
  custodies: CustodyRow[];
  totalAmount: number;
  totalRemaining: number;
  outstandingCount: number;
  overdueCount: number;
  oldestOverdueDays: number;
}

export default function CustodyWorkbenchPage() {
  const today = todayLocal();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("outstanding");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useApiQuery<ListResp>(
    ["custody-workbench"],
    `/finance/custodies`,
  );

  // Filter rows first
  const filteredRows = useMemo(() => {
    const rows = data?.data ?? [];
    let list = rows;
    if (filter === "outstanding") {
      list = rows.filter(r => r.remainingAmount > 0.01 && (r.status === "active" || r.status === "partial" || r.status === "overdue"));
    } else if (filter === "overdue") {
      list = rows.filter(r => r.status === "overdue");
    } else if (filter === "pending") {
      list = rows.filter(r => r.status === "pending");
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(r =>
        (r.employeeName ?? "").toLowerCase().includes(s) ||
        r.ref.toLowerCase().includes(s) ||
        (r.description ?? "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [data, search, filter]);

  // Group by employee
  const groups = useMemo<EmployeeGroup[]>(() => {
    const map = new Map<string, EmployeeGroup>();
    for (const c of filteredRows) {
      const key = c.assignmentId != null ? `emp_${c.assignmentId}` : `unknown_${c.id}`;
      const name = c.employeeName ?? "غير محدد";
      const cur = map.get(key) ?? {
        employeeName: name,
        assignmentId: c.assignmentId ?? null,
        custodies: [],
        totalAmount: 0,
        totalRemaining: 0,
        outstandingCount: 0,
        overdueCount: 0,
        oldestOverdueDays: 0,
      };
      cur.custodies.push(c);
      cur.totalAmount += Number(c.amount);
      cur.totalRemaining += c.remainingAmount;
      if (c.remainingAmount > 0.01) cur.outstandingCount += 1;
      if (c.status === "overdue") cur.overdueCount += 1;
      cur.oldestOverdueDays = Math.max(cur.oldestOverdueDays, c.daysOverdue);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.totalRemaining - a.totalRemaining);
  }, [filteredRows]);

  const summary = data?.summary ?? { total: 0, totalAmount: 0, totalRemaining: 0, activeCount: 0, overdueCount: 0, pendingCount: 0 };

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
    lines.push(`عُهد الموظفين — ${today}`);
    lines.push("");
    lines.push("الموظف,مرجع,وصف,تاريخ,مبلغ,مسوّى,متبقي,حالة,أيام تأخر");
    for (const g of groups) {
      for (const c of g.custodies) {
        lines.push([
          g.employeeName.replace(/,/g, "،"),
          c.ref,
          (c.description ?? "").replace(/,/g, "،"),
          c.date.split("T")[0],
          Number(c.amount).toFixed(2),
          c.settledAmount.toFixed(2),
          c.remainingAmount.toFixed(2),
          STATUS_DEFS[c.status]?.label ?? c.status,
          c.daysOverdue.toString(),
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
        entityType: "report_custody_workbench",
        title: String(`custody-workbench-${today}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="منضدة عمل العُهد"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "منضدة عمل العُهد" },
      ]}
      subtitle="عُهد الموظفين النشطة مجمّعة لكل موظف — تتبّع، تسوية، أعمار"
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
                  placeholder="اسم موظف أو مرجع عُهدة..."
                  className="pr-9"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الفلتر</label>
              <div className="flex gap-1">
                <Button variant={filter === "outstanding" ? "default" : "outline"} size="sm" onClick={() => setFilter("outstanding")}>
                  نشطة
                </Button>
                <Button variant={filter === "overdue" ? "default" : "outline"} size="sm" onClick={() => setFilter("overdue")}>
                  متأخرة
                </Button>
                <Button variant={filter === "pending" ? "default" : "outline"} size="sm" onClick={() => setFilter("pending")}>
                  بانتظار اعتماد
                </Button>
                <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
                  الكل
                </Button>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
              <Download className="w-4 h-4 ml-1" />
              CSV
            </Button>
            <PrintButton
              entityType="report_custody_workbench"
              entityId="all"
              payload={{
                entity: { title: "ورشة العُهَد", count: data?.data?.length ?? 0 },
                items: data?.data ?? [],
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
                  موظفون بعُهد
                </div>
                <div className="text-2xl font-bold tabular-nums">{groups.length}</div>
                <div className="text-[11px] text-muted-foreground mt-1">من {summary.total} عُهدة</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <KeyRound className="w-3 h-3 text-status-warning-foreground" />
                  متبقي الإجمالي
                </div>
                <div className="text-2xl font-bold tabular-nums text-status-warning-foreground">
                  {formatCurrency(summary.totalRemaining)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  من {formatCurrency(summary.totalAmount)}
                </div>
              </CardContent>
            </Card>
            <Card className={summary.overdueCount > 0 ? "border-status-danger-foreground border-2" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-status-danger-foreground" />
                  متأخرة (حرج)
                </div>
                <div className={`text-2xl font-bold tabular-nums ${summary.overdueCount > 0 ? "text-status-danger-foreground" : ""}`}>
                  {summary.overdueCount}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">يستوجب المتابعة</div>
              </CardContent>
            </Card>
            <Card className={summary.pendingCount > 0 ? "border-status-warning-foreground" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-status-warning-foreground" />
                  بانتظار اعتماد
                </div>
                <div className="text-2xl font-bold tabular-nums">{summary.pendingCount}</div>
              </CardContent>
            </Card>
          </div>

          {/* Employee list */}
          {groups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-status-success-foreground" />
                لا توجد عُهد مطابقة 🎉
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {groups.map(g => {
                const key = `emp_${g.assignmentId ?? g.employeeName}`;
                const isOpen = expanded.has(key);
                return (
                  <Card key={key} className={g.overdueCount > 0 ? "border-status-danger-foreground" : ""}>
                    <CardHeader
                      className="pb-3 cursor-pointer hover:bg-muted/30"
                      onClick={() => toggle(key)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                          <div className="min-w-0">
                            <div className="font-semibold text-sm">{g.employeeName}</div>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                              <span>{g.custodies.length} عُهدة</span>
                              <span>{g.outstandingCount} نشطة</span>
                              {g.overdueCount > 0 && (
                                <span className="text-status-danger-foreground">
                                  {g.overdueCount} متأخرة • أقدم {g.oldestOverdueDays} يوم
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="font-bold tabular-nums text-status-warning-foreground">
                            {formatCurrency(g.totalRemaining)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            من {formatCurrency(g.totalAmount)}
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
                          data={g.custodies}
                          rowKey={(c) => c.id}
                          columns={[
                            {
                              key: "ref", header: "المرجع", className: "font-mono text-xs",
                              render: (c) => c.ref,
                            },
                            {
                              key: "description", header: "الوصف", className: "text-xs max-w-xs truncate",
                              render: (c) => (
                                <span title={c.description ?? c.purpose ?? ""}>
                                  {c.description ?? c.purpose ?? "—"}
                                </span>
                              ),
                              exportValue: (c) => c.description ?? c.purpose ?? "",
                            },
                            {
                              key: "date", header: "التاريخ", width: "6rem", className: "text-xs whitespace-nowrap",
                              render: (c) => formatDateAr(c.date.split("T")[0]),
                              exportValue: (c) => c.date.split("T")[0],
                            },
                            {
                              key: "amount", header: "المبلغ", align: "end", width: "7rem", className: "tabular-nums",
                              render: (c) => formatCurrency(Number(c.amount)),
                              exportValue: (c) => Number(c.amount),
                            },
                            {
                              key: "settledAmount", header: "مسوّى", align: "end", width: "7rem",
                              className: "tabular-nums text-status-success-foreground",
                              render: (c) => (c.settledAmount > 0 ? formatCurrency(c.settledAmount) : "—"),
                              exportValue: (c) => c.settledAmount,
                            },
                            {
                              key: "remainingAmount", header: "متبقي", align: "end", width: "7rem",
                              className: "tabular-nums font-semibold",
                              render: (c) => (c.remainingAmount > 0.01 ? formatCurrency(c.remainingAmount) : "—"),
                              exportValue: (c) => c.remainingAmount,
                            },
                            {
                              key: "status", header: "الحالة", width: "6rem",
                              render: (c) => {
                                const status = STATUS_DEFS[c.status];
                                return (
                                  <Badge variant="outline" className={`text-[10px] ${status.color}`}>
                                    {status.label}
                                    {c.status === "overdue" && c.daysOverdue > 0 && (
                                      <span className="ml-1">({c.daysOverdue}ي)</span>
                                    )}
                                  </Badge>
                                );
                              },
                              exportValue: (c) => STATUS_DEFS[c.status]?.label ?? c.status,
                            },
                            {
                              key: "_actions", header: "", width: "4rem", sortable: false,
                              render: (c) => (
                                <Button asChild variant="ghost" size="icon" title="فتح في نافذة جديدة" className="h-7 w-7"><Link href={`/finance/custodies/${c.id}`}><ExternalLink className="w-3 h-3" /></Link></Button>
                              ),
                            },
                          ] satisfies DataTableColumn<CustodyRow>[]}
                        />
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
