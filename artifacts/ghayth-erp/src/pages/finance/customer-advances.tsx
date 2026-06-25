import { useMemo, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn, AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  Plus, Wallet, ArrowDownToLine, DollarSign,
  ChevronDown, ChevronRight, ExternalLink, Users, CheckCircle2,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface CustomerAdvance {
  id: number;
  ref: string;
  amount: number | string;
  appliedAmount: number | string;
  remaining: number | string;
  method: string | null;
  receivedDate: string | null;
  status: "open" | "partially_applied" | "fully_applied" | "cancelled" | string;
  journalId: number | null;
  createdAt: string | null;
  clientId?: number | null;
  clientName: string | null;
}

interface ClientGroup {
  clientId: number | null;
  clientName: string;
  advances: CustomerAdvance[];
  totalReceived: number;
  totalApplied: number;
  totalRemaining: number;
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  open: { label: "مفتوحة", tone: "bg-status-info-surface text-status-info-foreground" },
  partially_applied: { label: "مطبقة جزئياً", tone: "bg-status-warning-surface text-status-warning-foreground" },
  fully_applied: { label: "مطبقة بالكامل", tone: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "ملغاة", tone: "bg-muted text-muted-foreground" },
};

const METHOD_LABEL: Record<string, string> = {
  cash: "نقدي",
  bank_transfer: "تحويل بنكي",
  check: "شيك",
  credit_card: "بطاقة ائتمان",
};

type ViewMode = "flat" | "grouped";

export default function CustomerAdvancesPage() {
  const [, navigate] = useLocation();
  const search = typeof window !== "undefined" ? window.location.search : "";
  const initialView: ViewMode = new URLSearchParams(search).get("view") === "grouped" ? "grouped" : "flat";

  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [filters, setFilters] = useFilters();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useApiQuery<{ data: CustomerAdvance[] }>(
    ["customer-advances", filters.status],
    `/finance/customer-advances${filters.status ? `?status=${filters.status}` : ""}`,
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (viewMode === "grouped") url.searchParams.set("view", "grouped");
    else url.searchParams.delete("view");
    window.history.replaceState({}, "", url);
  }, [viewMode]);

  const rows = data?.data ?? [];

  const filteredRows = useMemo(
    () => applyFilters(rows, filters, { searchFields: ["clientName", "ref"] }),
    [rows, filters],
  );
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filteredRows);

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

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const totalsByStatus = filteredRows.reduce(
    (acc, r) => {
      const amt = Number(r.amount);
      const rem = Number(r.remaining);
      acc.total += amt;
      acc.remaining += rem;
      acc.applied += Number(r.appliedAmount);
      if (r.status === "open" || r.status === "partially_applied") {
        acc.openCount += 1;
        acc.openAmount += rem;
      }
      return acc;
    },
    { total: 0, remaining: 0, applied: 0, openCount: 0, openAmount: 0 },
  );

  const toggle = (key: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const cols: DataTableColumn<CustomerAdvance>[] = [
    { key: "ref", header: "المرجع", render: (r) => <span className="font-mono text-xs">{r.ref}</span> },
    { key: "clientName", header: "العميل", render: (r) => r.clientName ?? <span className="italic text-muted-foreground">— محذوف —</span> },
    { key: "receivedDate", header: "تاريخ الاستلام", render: (r) => <span className="text-xs">{r.receivedDate ? formatDateAr(r.receivedDate) : "—"}</span> },
    { key: "method", header: "الطريقة", render: (r) => <Badge variant="outline" className="text-xs">{METHOD_LABEL[r.method ?? ""] ?? r.method ?? "—"}</Badge> },
    { key: "amount", header: "إجمالي", render: (r) => <span className="font-mono">{formatCurrency(Number(r.amount))}</span> },
    { key: "appliedAmount", header: "مُطبَّق", render: (r) => <span className="font-mono text-emerald-700">{formatCurrency(Number(r.appliedAmount))}</span> },
    { key: "remaining", header: "متبقي", render: (r) => <span className="font-mono font-bold text-status-warning-foreground">{formatCurrency(Number(r.remaining))}</span> },
    {
      key: "status", header: "الحالة",
      render: (r) => {
        const s = STATUS_LABEL[r.status] ?? { label: r.status, tone: "bg-muted" };
        return <Badge className={`text-xs ${s.tone}`}>{s.label}</Badge>;
      },
    },
    {
      key: "actions", header: "الإجراءات",
      render: (r) => (
        <div className="flex gap-1">
          {Number(r.remaining) > 0 && (
            <GuardedButton perm="finance:create" variant="outline" size="sm"
              onClick={() => navigate(`/finance/customer-advances/${r.id}/apply`)}>
              <ArrowDownToLine className="h-3 w-3 me-1" /> تطبيق
            </GuardedButton>
          )}
          {r.journalId && (
            <Button asChild variant="ghost" size="sm"><Link href={`/finance/journal/${r.journalId}`}>القيد</Link></Button>
          )}
        </div>
      ),
    },
  ];

  // Grouped (per-client accordion) view columns — matches the previous raw
  // grouped table exactly (no client column; conditional applied/remaining
  // displays; icon-only action links). Distinct from the flat-view `cols`.
  const groupedCols: DataTableColumn<CustomerAdvance>[] = [
    { key: "ref", header: "المرجع", sortable: false, className: "font-mono text-xs", render: (a) => a.ref },
    { key: "date", header: "التاريخ", sortable: false, className: "text-xs", render: (a) => (a.receivedDate ? formatDateAr(a.receivedDate.split("T")[0]) : "—") },
    { key: "method", header: "الطريقة", sortable: false, className: "text-xs", render: (a) => METHOD_LABEL[a.method ?? ""] ?? a.method ?? "—" },
    { key: "amount", header: "المبلغ", sortable: false, align: "end", className: "tabular-nums", render: (a) => formatCurrency(Number(a.amount)) },
    { key: "applied", header: "المُطبَّق", sortable: false, align: "end", className: "tabular-nums text-status-success-foreground", render: (a) => (Number(a.appliedAmount) > 0 ? formatCurrency(Number(a.appliedAmount)) : "—") },
    {
      key: "remaining", header: "المتبقي", sortable: false, align: "end",
      className: "tabular-nums font-semibold",
      cellClassName: (a) => (Number(a.remaining) > 0 ? "text-status-info-foreground" : undefined),
      render: (a) => (Number(a.remaining) > 0.01 ? formatCurrency(Number(a.remaining)) : "—"),
    },
    {
      key: "status", header: "الحالة", sortable: false,
      render: (a) => {
        const s = STATUS_LABEL[a.status] ?? { label: a.status, tone: "bg-muted" };
        return <Badge className={`text-[10px] ${s.tone}`}>{s.label}</Badge>;
      },
    },
    {
      key: "actions", header: "", sortable: false,
      render: (a) => (
        <div className="flex gap-1">
          {Number(a.remaining) > 0 && (
            <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="تطبيق على فاتورة"><Link href={`/finance/customer-advances/${a.id}/apply`}><ArrowDownToLine className="w-3 h-3" /></Link></Button>
          )}
          {a.journalId && (
            <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="القيد"><Link href={`/finance/journal/${a.journalId}`}><ExternalLink className="w-3 h-3" /></Link></Button>
          )}
        </div>
      ),
    },
  ];

  const customersWithRemaining = groups.filter((g) => g.totalRemaining > 0.01).length;

  return (
    <PageShell
      title="دفعات مقدمة من العملاء"
      subtitle="دفعات العملاء المقدمة — مبالغ مستلمة قبل الفاتورة، تُسجّل في حساب الالتزامات وتُطبَّق لاحقاً على فواتير العميل"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "دفعات مقدمة" },
      ]}
      actions={
        <>
          <GuardedButton perm="finance:create" onClick={() => navigate("/finance/customer-advances/create")}>
            <Plus className="h-4 w-4 me-1" /> دفعة مقدمة جديدة
          </GuardedButton>
          <PrintButton
            entityType="report_finance_customer_advances"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "دفعات مقدمة من العملاء", total: printRows.length },
              items: printRows.map((a) => ({
                "المرجع": a.ref || "—",
                "العميل": a.clientName || "—",
                "المبلغ": Number(a.amount || 0),
                "المطبق": Number(a.appliedAmount || 0),
                "المتبقي": Number(a.remaining || 0),
                "الطريقة": METHOD_LABEL[a.method || ""] || a.method || "—",
                "تاريخ الاستلام": a.receivedDate || "—",
                "الحالة": STATUS_LABEL[a.status]?.label || a.status,
              })),
            })}
          />
        </>
      }
    >
      <FinanceTabsNav />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">عدد الدفعات</p>
            <p className="text-lg font-bold font-mono">{filteredRows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المُستلم</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(totalsByStatus.total)}</p>
          </CardContent>
        </Card>
        <Card className="border-status-warning-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Wallet className="h-3 w-3" /> الرصيد المتبقي
            </p>
            <p className="text-lg font-bold font-mono text-status-warning-foreground">{formatCurrency(totalsByStatus.remaining)}</p>
            <p className="text-[10px] text-muted-foreground">قابل للتطبيق على فواتير</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Users className="h-3 w-3" /> عملاء بأرصدة
            </p>
            <p className="text-lg font-bold font-mono">{customersWithRemaining}</p>
            <p className="text-[10px] text-muted-foreground">من {groups.length} عميل</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1 me-2 border rounded-md p-0.5">
          <Button
            variant={viewMode === "flat" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setViewMode("flat")}
          >
            قائمة مفصلة
          </Button>
          <Button
            variant={viewMode === "grouped" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setViewMode("grouped")}
          >
            تجميع حسب العميل
          </Button>
        </div>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "اسم عميل أو مرجع...",
          statuses: [
            { value: "open", label: "مفتوحة" },
            { value: "partially_applied", label: "مطبقة جزئياً" },
            { value: "fully_applied", label: "مطبقة بالكامل" },
          ],
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filteredRows.length}
      />

      {viewMode === "flat" ? (
        <Card>
          <CardContent className="p-0">
            <DataTable
              columns={cols}
              onSortedDataChange={setPrintRows}
              data={filteredRows}
              pageSize={50}
              noToolbar
              emptyMessage="لا توجد دفعات مقدمة"
            />
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-status-success-foreground" />
            لا توجد دفعات مقدمة لهذا الفلتر
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const key = `c_${g.clientId ?? g.clientName}`;
            const isOpen = expanded.has(key);
            return (
              <Card key={key}>
                <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30" onClick={() => toggle(key)}>
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
                    <DataTable
                      noToolbar
                      pageSize={0}
                      data={g.advances}
                      rowKey={(a) => a.id}
                      columns={groupedCols}
                    />
                    {g.clientId && (
                      <div className="flex justify-end gap-2 mt-3 border-t pt-3">
                        <Button asChild size="sm" variant="outline"><Link href={`/finance/customer-360-sheet?clientId=${g.clientId}`}>
                            <Users className="w-4 h-4 ml-1" />
                            ملف العميل 360°
                          </Link></Button>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
