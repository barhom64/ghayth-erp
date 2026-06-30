import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { GuardedButton, usePermission } from "@/components/shared/permission-gate";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  CheckSquare, XSquare, Search, ExternalLink, CheckCircle2,
  AlertTriangle, Filter, Users, Receipt, BarChart3, ListChecks,
} from "lucide-react";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";

/**
 * Expense Bulk Approvals
 *
 * Practical approver tool: lists all pending expenses, multi-select,
 * approve or reject many in one shot. Saves the approver from clicking
 * 50 individual buttons every week.
 *
 * Endpoints:
 *   GET /finance/expenses?status=pending
 *   PATCH /finance/expenses/:id/approve  body: { approved: true|false, notes? }
 */

interface Expense {
  id: number;
  ref: string;
  description?: string;
  amount?: number | string;
  totalAmount?: number | string;
  status: string;
  createdAt: string;
  employeeName?: string | null;
  branchName?: string | null;
  costCenter?: string | null;
}
interface ListResp {
  data: Expense[];
  total: number;
}

export default function ExpenseBulkApprovalsPage() {
  const today = todayLocal();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null);

  const { data, isLoading, refetch } = useApiQuery<ListResp>(
    ["exp-bulk-pending"],
    `/finance/expenses?status=pending`,
  );

  const approveMutation = useApiMutation<void>(
    (body: { id: number }) => `/finance/expenses/${body.id}/approve`,
    "PATCH",
    [["exp-bulk-pending"], ["expenses"]],
  );

  const filtered = useMemo(() => {
    const rows = data?.data ?? [];
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter(e =>
      (e.ref ?? "").toLowerCase().includes(s) ||
      (e.description ?? "").toLowerCase().includes(s) ||
      (e.employeeName ?? "").toLowerCase().includes(s)
    );
  }, [data, search]);

  const canApprove = usePermission("finance.journal.approve");
  const selectedRows = filtered.filter(r => selected.has(r.id));
  const selectedTotal = selectedRows.reduce(
    (s, r) => s + Number(r.totalAmount ?? r.amount ?? 0), 0
  );

  const runBulk = async (action: "approve" | "reject") => {
    if (action === "reject" && !rejectReason.trim()) return;
    setProgress({ done: 0, total: selectedRows.length, errors: [] });
    const errors: string[] = [];
    let done = 0;
    for (const row of selectedRows) {
      try {
        await approveMutation.mutateAsync({
          id: row.id,
          approved: action === "approve",
          notes: action === "reject" ? rejectReason : undefined,
        } as any);
      } catch (e) {
        errors.push(`${row.ref}: ${(e as Error)?.message ?? "خطأ"}`);
      }
      done += 1;
      setProgress({ done, total: selectedRows.length, errors });
    }
    setConfirming(null);
    setSelected(new Set());
    setRejectReason("");
    setRejectMode(false);
    refetch?.();
  };

  return (
    <PageShell
      title="اعتماد المصاريف بالجملة"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "اعتماد المصاريف بالجملة" },
      ]}
      subtitle="اختر عدة مصاريف واعتمدها أو ارفضها مرة واحدة — توفير وقت المعتمد"
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/expenses">
              <Receipt className="h-3.5 w-3.5 ml-1" />
              قائمة المصاريف
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/expense-burn-rate">
              <BarChart3 className="h-3.5 w-3.5 ml-1" />
              معدل الحرق
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/approvals-inbox">
              <ListChecks className="h-3.5 w-3.5 ml-1" />
              صندوق الاعتمادات
            </Link></Button>
          <PrintButton
            entityType="report_finance_expense_bulk_approvals"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: "الاعتماد الجماعي للمصاريف", total: filtered.length },
              items: filtered.map((e: any) => ({
                "المرجع": e.ref || e.id,
                "البيان": e.description || "—",
                "الفئة": e.category || "—",
                "المبلغ": e.amount ?? 0,
                "تاريخ الإنشاء": e.createdAt || "—",
                "الحالة": e.status || "—",
              })),
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="text-xs text-muted-foreground mb-1 block">بحث</label>
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="مرجع أو وصف أو موظف..."
                className="pr-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Receipt className="w-3 h-3" />
                  بانتظار الاعتماد
                </div>
                <div className="text-2xl font-bold tabular-nums">{filtered.length}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  مجموع: {formatCurrency(filtered.reduce((s, r) => s + Number(r.totalAmount ?? r.amount ?? 0), 0))}
                </div>
              </CardContent>
            </Card>
            <Card className={selected.size > 0 ? "border-status-info-foreground" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <CheckSquare className="w-3 h-3 text-status-info-foreground" />
                  محدد
                </div>
                <div className={`text-2xl font-bold tabular-nums ${selected.size > 0 ? "text-status-info-foreground" : ""}`}>
                  {selected.size}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  مجموع: {formatCurrency(selectedTotal)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex flex-col gap-2">
                <GuardedButton
                  perm="finance.journal.approve"
                  onClick={() => setConfirming("approve")}
                  disabled={selected.size === 0}
                  size="sm"
                  className="bg-status-success-foreground hover:bg-status-success-foreground/90"
                >
                  <CheckSquare className="w-4 h-4 ml-1" />
                  اعتماد المحدد ({selected.size})
                </GuardedButton>
                <Button
                  variant="outline"
                  onClick={() => { setRejectMode(true); setConfirming("reject"); }}
                  disabled={selected.size === 0}
                  size="sm"
                  className="border-status-danger-foreground text-status-danger-foreground hover:bg-status-danger-surface"
                >
                  <XSquare className="w-4 h-4 ml-1" />
                  رفض المحدد
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Confirm panels */}
          {confirming === "approve" && (
            <Card className="mb-4 border-status-success-foreground border-2 bg-status-success-surface">
              <CardContent className="pt-6">
                <div className="flex items-start gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-status-success-foreground" />
                  <div>
                    <div className="font-semibold">تأكيد الاعتماد</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      سيتم اعتماد <strong>{selected.size}</strong> مصروف بمجموع{" "}
                      <strong>{formatCurrency(selectedTotal)}</strong>. لا يمكن التراجع.
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => runBulk("approve")} disabled={approveMutation.isPending} className="flex-1" rateLimitAware>
                    {approveMutation.isPending ? `جاري... ${progress?.done ?? 0}/${progress?.total ?? 0}` : "تأكيد الاعتماد"}
                  </Button>
                  <Button variant="outline" onClick={() => setConfirming(null)} disabled={approveMutation.isPending}>
                    إلغاء
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {confirming === "reject" && (
            <Card className="mb-4 border-status-danger-foreground border-2 bg-status-danger-surface">
              <CardContent className="pt-6">
                <div className="flex items-start gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-status-danger-foreground" />
                  <div className="flex-1">
                    <div className="font-semibold">رفض المحدد</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      سيتم رفض <strong>{selected.size}</strong> مصروف. أدخل السبب (إلزامي).
                    </div>
                  </div>
                </div>
                <Input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="سبب الرفض (سيُسجَّل في سجل التدقيق)..."
                  className="mb-3"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => runBulk("reject")}
                    disabled={approveMutation.isPending || !rejectReason.trim()}
                    className="flex-1 bg-status-danger-foreground hover:bg-status-danger-foreground/90"
                    rateLimitAware
                  >
                    {approveMutation.isPending ? `جاري... ${progress?.done ?? 0}/${progress?.total ?? 0}` : "تأكيد الرفض"}
                  </Button>
                  <Button variant="outline" onClick={() => { setConfirming(null); setRejectReason(""); setRejectMode(false); }} disabled={approveMutation.isPending}>
                    إلغاء
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Progress + errors */}
          {progress && progress.done < progress.total && (
            <Card className="mb-4">
              <CardContent className="pt-4">
                <div className="text-sm mb-2">
                  جاري المعالجة: {progress.done}/{progress.total}
                </div>
                <div className="h-2 bg-muted rounded overflow-hidden">
                  <div
                    className="bg-status-info-foreground h-full transition-all"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}
          {progress && progress.done === progress.total && progress.errors.length > 0 && (
            <Card className="mb-4 border-status-danger-foreground">
              <CardContent className="pt-4">
                <div className="text-sm font-semibold text-status-danger-foreground mb-2">
                  {progress.errors.length} عملية فشلت:
                </div>
                <ul className="text-xs space-y-1">
                  {progress.errors.slice(0, 5).map((e, i) => (
                    <li key={i} className="text-status-danger-foreground">• {e}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Table */}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-status-success-foreground" />
                لا توجد مصاريف بانتظار الاعتماد 🎉
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">المصاريف المعلقة ({filtered.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  noToolbar
                  selectable
                  data={filtered}
                  onSelectionChange={(ids) => setSelected(new Set(ids))}
                  bulkActions={[
                    {
                      label: `اعتماد المحدد (${selected.size})`,
                      icon: <CheckSquare className="w-3.5 h-3.5" />,
                      onClick: () => setConfirming("approve"),
                      disabled: !canApprove,
                    },
                    {
                      label: "رفض المحدد",
                      icon: <XSquare className="w-3.5 h-3.5" />,
                      onClick: () => { setRejectMode(true); setConfirming("reject"); },
                    },
                  ]}
                  columns={[
                    {
                      key: "ref", header: "المرجع", ltr: true,
                      render: (e) => <span className="font-mono text-xs">{e.ref}</span>,
                    },
                    {
                      key: "description", header: "الوصف", className: "max-w-xs",
                      render: (e) => (
                        <span className="block max-w-xs truncate" title={e.description ?? ""}>
                          {e.description ?? "—"}
                        </span>
                      ),
                    },
                    {
                      key: "employeeName", header: "الموظف",
                      render: (e) => <span className="text-xs">{e.employeeName ?? "—"}</span>,
                    },
                    {
                      key: "createdAt", header: "التاريخ",
                      render: (e) => (
                        <span className="text-xs whitespace-nowrap">{formatDateAr(e.createdAt.split("T")[0])}</span>
                      ),
                    },
                    {
                      key: "totalAmount", header: "المبلغ", align: "end",
                      render: (e) => (
                        <span className="tabular-nums font-semibold">
                          {formatCurrency(Number(e.totalAmount ?? e.amount ?? 0))}
                        </span>
                      ),
                      exportValue: (e) => Number(e.totalAmount ?? e.amount ?? 0),
                    },
                    {
                      key: "_action", header: "", width: "2rem", sortable: false,
                      render: (e) => (
                        <Button asChild variant="ghost" size="icon" title="فتح في نافذة جديدة" className="h-7 w-7" onClick={(ev) => ev.stopPropagation()}><Link href={`/finance/expenses/${e.id}`}>
                            <ExternalLink className="w-3 h-3" />
                          </Link></Button>
                      ),
                    },
                  ] satisfies DataTableColumn<Expense>[]}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}
