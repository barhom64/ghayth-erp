import { useState } from "react";
import { z } from "zod";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  FormShell,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormGrid,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
  PageShell,
  PageStatusBadge,
} from "@workspace/ui-core";
import { Banknote, DollarSign, Plus, X, Clock, CheckCircle } from "lucide-react";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { useAppContext } from "@/contexts/app-context";
import { ApprovalActions } from "@workspace/workflow-kit";
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
  if (isError) return <ErrorState />;

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
      render: (s) => <span className="font-mono text-status-info-foreground text-sm">{s.ref}</span>,
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
          entityType="salary-advance"
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
        <GuardedButton perm="finance:create" size="sm" onClick={() => setShowForm((v) => !v)}>
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
        </GuardedButton>
      }
    >
      <KpiGrid items={[
        { label: "عدد السلف", value: formatNumber(summary.total || 0), icon: Banknote, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "قيد الانتظار", value: formatNumber(items.filter((s: any) => s.status === "pending").length), icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
        { label: "معتمدة", value: formatNumber(items.filter((s: any) => s.status === "approved").length), icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
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

const advanceSchema = z.object({
  employeeName: z.string().trim().min(1, "اسم الموظف مطلوب"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون موجبًا"),
  deductMonths: z.coerce.number().int().positive("عدد الأشهر يجب أن يكون موجبًا"),
  description: z.string().trim(),
  sourceAccountCode: z.string(),
});
type AdvanceForm = z.infer<typeof advanceSchema>;

function CreateAdvanceForm({ onDone }: { onDone: () => void }) {
  const createMut = useApiMutation<unknown, AdvanceForm>(
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>سلفة جديدة</CardTitle>
      </CardHeader>
      <CardContent>
        <FormShell
          schema={advanceSchema}
          defaultValues={{
            employeeName: "",
            amount: 0,
            deductMonths: 1,
            description: "",
            sourceAccountCode: "",
          }}
          submitLabel="حفظ"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onDone}>
              <X className="w-4 h-4 me-1" /> إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await createMut.mutateAsync(values);
          }}
        >
          <FormGrid cols={3}>
            <FormTextField name="employeeName" label="اسم الموظف" required />
            <FormNumberField name="amount" label="المبلغ" required />
            <FormNumberField name="deductMonths" label="أشهر الخصم" required />
            <FormSelectField
              name="sourceAccountCode"
              label="مصدر الصرف"
              options={[
                { value: "", label: "الخزنة النقدية (1100)" },
                ...sourceAccounts.map((a: any) => ({
                  value: a.code,
                  label: `${a.code} - ${a.name}`,
                })),
              ]}
            />
            <FormTextField name="description" label="الوصف" />
          </FormGrid>
        </FormShell>
      </CardContent>
    </Card>
  );
}
