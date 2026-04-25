import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, DollarSign, Plus, X, Clock, CheckCircle } from "lucide-react";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { ApprovalActions } from "@/components/approval-actions";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

/**
 * Salary advances list — migrated in R.4 iter 4 to the unified
 * template stack.
 *
 * Before: raw <h1>, `StatusBadge` shim, a duplicated `AdvancedFilters`
 * call (leftover from a previous refactor — the second one rendered
 * with no `config`/`values` and had no visible effect), and a
 * `CreateAdvanceForm` that re-created the same manual
 * `useToast`+`useQueryClient`+try/catch that custodies had before R.3.
 *
 * After:
 *   • PageShell with breadcrumbs + actions slot
 *   • PageStatusBadge with `shared` domain (pending / approved /
 *     rejected / returned) — no new status values needed
 *   • Dead second AdvancedFilters block removed
 *   • CreateAdvanceForm now relies on `useApiMutation`'s built-in
 *     successMessage + invalidateKeys so typed errors surface
 *     automatically through R.1.2's toast pipeline
 *
 * The `ApprovalActions` row action is preserved — it's already the
 * canonical approval workflow helper and its endpoint wiring stays
 * identical.
 */

export default function SalaryAdvancesPage() {
  const [, navigate] = useLocation();
  const { roleLevel, scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["salary-advances", scopeQueryString],
    `/finance/salary-advances${scopeSuffix}`,
  );
  const items = data?.data || [];
  const summary = data?.summary || {};
  const [filters, setFilters] = useFilters();
  const [showForm, setShowForm] = useState(false);
  const canApprove = roleLevel >= 70;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const filtered = applyFilters(items as Record<string, any>[], filters, {
    searchFields: ["description", "ref", "employeeName"],
    statusField: "status",
    dateField: "date",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (s) => <span className="font-mono text-blue-600 text-sm">{s.ref}</span>,
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (s) => <span className="font-medium">{s.employeeName || "-"}</span>,
    },
    {
      key: "description",
      header: "الوصف",
      sortable: true,
      render: (s) => s.description || "-",
    },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (s) => <span className="font-semibold">{formatCurrency(Number(s.amount))}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (s) => <PageStatusBadge status={s.status || "pending"} />,
    },
    {
      key: "date",
      header: "التاريخ",
      sortable: true,
      render: (s) => (
        <span className="text-muted-foreground text-sm">
          {s.date ? formatDateAr(s.date) : "-"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "إجراء",
      hidden: !canApprove,
      render: (s) => (
        <ApprovalActions
          entityType="salary_advance"
          entityId={s.id}
          currentStatus={s.status || "pending"}
          approveEndpoint={`/finance/salary-advances/${s.id}/approve`}
          rejectEndpoint={`/finance/salary-advances/${s.id}/approve`}
          returnEndpoint={`/finance/salary-advances/${s.id}/approve`}
          approveMethod="PATCH"
          rejectMethod="PATCH"
          returnMethod="PATCH"
          approveBody={() => ({ approved: true })}
          rejectBody={(notes) => ({ approved: false, notes })}
          returnBody={(notes) => ({ approved: null, notes })}
          pendingStatuses={["pending"]}
          invalidateKeys={[["salary-advances"]]}
        />
      ),
    },
  ];

  return (
    <PageShell
      title="سلف الرواتب"
      subtitle="سلف الموظفين وخصمها من الرواتب مع دورة اعتماد كاملة"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "سلف الرواتب" }]}
      loading={isLoading}
      actions={
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? (
            <>
              <X className="h-4 w-4 me-1" />
              إلغاء
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 me-1" />
              سلفة جديدة
            </>
          )}
        </Button>
      }
    >
      <KpiGrid items={[
        { label: "عدد السلف", value: formatNumber(summary.total || 0), icon: Banknote, color: "text-blue-600 bg-blue-50" },
        { label: "قيد الانتظار", value: formatNumber(items.filter((s: any) => s.status === "pending").length), icon: Clock, color: "text-amber-600 bg-amber-50" },
        { label: "معتمدة", value: formatNumber(items.filter((s: any) => s.status === "approved").length), icon: CheckCircle, color: "text-green-600 bg-green-50" },
        { label: "إجمالي المبالغ", value: formatCurrency(Number(summary.totalAmount || 0)), icon: DollarSign, color: "text-emerald-600 bg-emerald-50" },
      ]} />

      {showForm && <CreateAdvanceForm onDone={() => setShowForm(false)} />}

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالوصف أو المرجع أو اسم الموظف...",
          statuses: [
            { value: "pending",  label: "قيد الانتظار" },
            { value: "approved", label: "معتمد" },
            { value: "rejected", label: "مرفوض" },
            { value: "returned", label: "مُرجَع" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            (filtered || []) as any[],
            [
              { key: "ref", label: "المرجع" },
              { key: "employeeName", label: "الموظف" },
              { key: "description", label: "الوصف" },
              { key: "amount", label: "المبلغ" },
              { key: "status", label: "الحالة" },
              { key: "date", label: "التاريخ" },
            ],
            "سلف_الرواتب",
          )
        }
        resultCount={filtered?.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد سلف"
        emptyIcon={<Banknote className="h-6 w-6 text-slate-400" />}
        noToolbar
        onRowClick={(row) => navigate(`/finance/salary-advances/${row.id}`)}
      />
    </PageShell>
  );
}

function CreateAdvanceForm({ onDone }: { onDone: () => void }) {
  const createMut = useApiMutation<unknown, any>(
    "/finance/salary-advances",
    "POST",
    [["salary-advances"]],
    {
      successMessage: "تم إضافة السلفة",
      onSuccess: () => onDone(),
    },
  );
  const { data: accountsData } = useApiQuery<{ data: any[] }>(
    ["accounts-list"],
    "/finance/accounts",
  );
  const sourceAccounts = (accountsData?.data || []).filter(
    (a: any) => a.code?.startsWith("11") || a.code?.startsWith("12"),
  );
  const [form, setForm] = useState({
    employeeName: "",
    amount: "",
    deductMonths: "1",
    description: "",
    sourceAccountCode: "",
  });

  const handleSubmit = () => {
    createMut.mutate({
      ...form,
      amount: Number(form.amount),
      deductMonths: Number(form.deductMonths),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>سلفة جديدة</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label>اسم الموظف</Label>
            <Input
              className="mt-1"
              value={form.employeeName}
              onChange={(e) => setForm({ ...form, employeeName: e.target.value })}
            />
          </div>
          <div>
            <Label>المبلغ</Label>
            <Input
              className="mt-1"
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div>
            <Label>أشهر الخصم</Label>
            <Input
              className="mt-1"
              type="number"
              value={form.deductMonths}
              onChange={(e) => setForm({ ...form, deductMonths: e.target.value })}
            />
          </div>
          <div>
            <Label>مصدر الصرف</Label>
            <Select value={form.sourceAccountCode || "_default"} onValueChange={(v) => setForm({ ...form, sourceAccountCode: v === "_default" ? "" : v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="الخزنة النقدية (1100)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_default">الخزنة النقدية (1100)</SelectItem>
                {sourceAccounts.map((a: any) => (
                  <SelectItem key={a.code || a.id} value={a.code}>
                    {a.code} - {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الوصف</Label>
            <Input
              className="mt-1"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onDone}>
            إلغاء
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.employeeName || !form.amount || createMut.isPending}
          >
            {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
