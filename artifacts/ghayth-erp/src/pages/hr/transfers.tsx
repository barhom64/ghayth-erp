import { useState } from "react";
import { z } from "zod";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  ArrowRightLeft, Plus, CheckCircle, XCircle, Clock,
  FileText, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@workspace/ui-core";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { ApprovalActions } from "@workspace/workflow-kit";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { TRANSFER_STATUS } from "@/lib/hr-type-maps";
import {
  FormShell, FormTextField, FormSelectField, FormDateField, FormGrid,
} from "@/components/form-shell";

// employeeId + toBranchId required (was `if (!form.employeeId || !form.toBranchId)`
// toast guard — now caught at schema validation before any network call).
const transferSchema = z.object({
  employeeId: z.string().min(1, "الموظف مطلوب"),
  toBranchId: z.string().min(1, "الفرع المستقبل مطلوب"),
  reason: z.string().trim(),
  effectiveDate: z.string(),
});
type TransferForm = z.infer<typeof transferSchema>;
const defaultTransferForm: TransferForm = {
  employeeId: "", toBranchId: "", reason: "", effectiveDate: "",
};

const STATUS_OPTIONS = Object.entries(TRANSFER_STATUS).map(([value, { label }]) => ({ value, label }));
const STATUS_MAP = TRANSFER_STATUS;

export default function TransfersPage() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError, refetch } = useApiQuery<any>(["transfers"], "/hr/transfers");
  const transfers = asList(data?.data || data);

  const { data: employees } = useApiQuery<any>(["employees-active"], "/employees?status=active&limit=200");
  const { data: branches } = useApiQuery<any>(["branches"], "/settings/branches");
  const employeeList = asList(employees?.data || employees);
  const branchList = asList(branches?.data || branches);

  const createTransferMut = useApiMutation("/hr/transfers", "POST", [["transfers"]], {
    successMessage: "تم إرسال طلب النقل",
  });

  const handleSubmit = async (values: TransferForm) => {
    await createTransferMut.mutateAsync(values);
    setShowForm(false);
    refetch();
  };

  const filtered = applyFilters(transfers, filters, {
    searchFields: ["employeeName", "empNumber", "fromBranchName", "toBranchName"],
    statusField: "status",
    dateField: "createdAt",
  });

  const pendingCount = transfers.filter((t: any) => t.status === "pending").length;
  const approvedCount = transfers.filter((t: any) => t.status === "approved").length;
  const rejectedCount = transfers.filter((t: any) => t.status === "rejected").length;

  const kpis = [
    {
      label: "إجمالي الطلبات",
      value: transfers.length,
      icon: FileText,
      color: "text-status-info-foreground bg-status-info-surface",
    },
    {
      label: "بانتظار الموافقة",
      value: pendingCount,
      icon: Clock,
      color: "text-status-warning-foreground bg-status-warning-surface",
    },
    {
      label: "تم اعتمادها",
      value: approvedCount,
      icon: CheckCircle,
      color: "text-status-success-foreground bg-status-success-surface",
    },
    {
      label: "مرفوضة",
      value: rejectedCount,
      icon: XCircle,
      color: "text-status-error-foreground bg-status-error-surface",
    },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.employeeName} color="blue" />
          <div>
            <span className="font-medium text-sm block">{v.employeeName}</span>
            {v.empNumber && (
              <span className="text-xs text-muted-foreground">#{v.empNumber}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "fromBranchName",
      header: "من",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-muted-foreground">
          {v.fromBranchName || `فرع #${v.fromBranchId}`}
        </span>
      ),
    },
    {
      key: "toBranchName",
      header: "إلى",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-1.5">
          <ArrowRightLeft className="h-3.5 w-3.5 text-status-info" />
          <span className="text-sm font-medium text-status-info-foreground">
            {v.toBranchName || `فرع #${v.toBranchId}`}
          </span>
        </div>
      ),
    },
    {
      key: "reason",
      header: "السبب",
      render: (v) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {v.reason || "—"}
        </span>
      ),
    },
    {
      key: "effectiveDate",
      header: "تاريخ التفعيل",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-muted-foreground">
          {v.effectiveDate ? v.effectiveDate.split("T")[0] : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => {
        const st = STATUS_MAP[v.status] || { label: v.status, color: "bg-surface-subtle text-muted-foreground" };
        return (
          <Badge variant="outline" className={cn("text-xs", st.color)}>
            {st.label}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (v) => {
        if (v.status !== "pending") return null;
        return (
          <ApprovalActions
            entityType="transfer"
            entityId={v.id}
            currentStatus={v.status}
            approveEndpoint={`/hr/transfers/${v.id}/approve`}
            rejectEndpoint={`/hr/transfers/${v.id}/approve`}
            approveMethod="PATCH"
            rejectMethod="PATCH"
            approveBody={(notes) => ({ approved: true, notes })}
            rejectBody={(notes) => ({ approved: false, notes })}
            pendingStatuses={["pending"]}
            onDone={() => refetch()}
          />
        );
      },
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="نقل الموظفين"
      subtitle="إدارة طلبات نقل الموظفين بين الفروع والأقسام"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <GuardedButton perm="hr:create" onClick={() => setShowForm(!showForm)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          طلب نقل جديد
        </GuardedButton>
      }
    >
      {/* KPI cards */}
      <KpiGrid items={kpis} />

      {/* Pending alert */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-status-warning-surface border border-status-warning-surface rounded-lg text-sm text-status-warning-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            يوجد <strong>{pendingCount}</strong> طلب نقل بانتظار الموافقة
          </span>
        </div>
      )}

      {/* Inline create form — full-page card per CONTRIBUTING.md §3.4
          (no modal for create/edit; FormShell + zod for validation). */}
      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">طلب نقل موظف</CardTitle>
          </CardHeader>
          <CardContent>
            <FormShell
              schema={transferSchema}
              defaultValues={defaultTransferForm}
              submitLabel="إرسال الطلب"
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values, ctx) => {
                await handleSubmit(values);
                ctx.reset();
              }}
            >
              <FormGrid cols={2}>
                <FormSelectField
                  name="employeeId"
                  label="الموظف"
                  required
                  options={[
                    { value: "", label: "اختر موظفاً" },
                    ...employeeList.map((e: any) => ({ value: String(e.id), label: e.name })),
                  ]}
                />
                <FormSelectField
                  name="toBranchId"
                  label="الفرع المستقبل"
                  required
                  options={[
                    { value: "", label: "اختر فرعاً" },
                    ...branchList.map((b: any) => ({ value: String(b.id), label: b.name })),
                  ]}
                />
                <FormDateField name="effectiveDate" label="تاريخ التفعيل" />
                <FormTextField name="reason" label="سبب النقل" placeholder="السبب..." />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الفرع...",
          statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد طلبات نقل — قدّم طلب نقل جديد للبدء"
        pageSize={20}
        onRowClick={(row) => navigate(`/hr/transfers/${row.id}`)}
      />
    </PageShell>
  );
}
