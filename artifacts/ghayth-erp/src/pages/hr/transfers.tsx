import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowRightLeft, Plus, CheckCircle, XCircle, Clock,
  FileText, AlertTriangle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { ApprovalActions } from "@/components/approval-actions";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { TRANSFER_STATUS } from "@/lib/hr-type-maps";
import { DatePicker } from "@/components/ui/date-picker";

const STATUS_OPTIONS = Object.entries(TRANSFER_STATUS).map(([value, { label }]) => ({ value, label }));
const STATUS_MAP = TRANSFER_STATUS;

export default function TransfersPage() {
  const [filters, setFilters] = useFilters();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employeeId: "", toBranchId: "", reason: "", effectiveDate: "" });

  const { data, isLoading, isError, refetch } = useApiQuery<any>(["transfers"], "/hr/transfers");
  const transfers = asList(data?.data || data);

  const { data: employees } = useApiQuery<any>(["employees-active"], "/employees?status=active&limit=200");
  const { data: branches } = useApiQuery<any>(["branches"], "/settings/branches");
  const employeeList = asList(employees?.data || employees);
  const branchList = asList(branches?.data || branches);

  const createTransferMut = useApiMutation("/hr/transfers", "POST", [["transfers"]], {
    successMessage: "تم إرسال طلب النقل",
  });

  const handleSubmit = () => {
    if (!form.employeeId || !form.toBranchId) {
      toast({ title: "الموظف والفرع مطلوبان", variant: "destructive" });
      return;
    }
    createTransferMut.mutate(form, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ employeeId: "", toBranchId: "", reason: "", effectiveDate: "" });
        refetch();
      },
    });
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
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "بانتظار الموافقة",
      value: pendingCount,
      icon: Clock,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "تم اعتمادها",
      value: approvedCount,
      icon: CheckCircle,
      color: "text-green-600 bg-green-50",
    },
    {
      label: "مرفوضة",
      value: rejectedCount,
      icon: XCircle,
      color: "text-red-600 bg-red-50",
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
              <span className="text-xs text-gray-400">#{v.empNumber}</span>
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
        <span className="text-sm text-gray-600">
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
          <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-sm font-medium text-blue-700">
            {v.toBranchName || `فرع #${v.toBranchId}`}
          </span>
        </div>
      ),
    },
    {
      key: "reason",
      header: "السبب",
      render: (v) => (
        <span className="text-sm text-gray-500 truncate max-w-[200px] block">
          {v.reason || "—"}
        </span>
      ),
    },
    {
      key: "effectiveDate",
      header: "تاريخ التفعيل",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-gray-600">
          {v.effectiveDate ? v.effectiveDate.split("T")[0] : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => {
        const st = STATUS_MAP[v.status] || { label: v.status, color: "bg-gray-100 text-gray-600" };
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
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <PageShell
      title="نقل الموظفين"
      subtitle="إدارة طلبات نقل الموظفين بين الفروع والأقسام"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          طلب نقل جديد
        </Button>
      }
    >
      {/* KPI cards */}
      <KpiGrid items={kpis} />

      {/* Pending alert */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            يوجد <strong>{pendingCount}</strong> طلب نقل بانتظار الموافقة
          </span>
        </div>
      )}

      {/* Inline create form */}
      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">طلب نقل موظف</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label>الموظف <span className="text-red-500">*</span></Label>
              <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر موظفاً" /></SelectTrigger>
                <SelectContent>
                  {employeeList.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الفرع المستقبل <span className="text-red-500">*</span></Label>
              <Select value={form.toBranchId} onValueChange={(v) => setForm({ ...form, toBranchId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر فرعاً" /></SelectTrigger>
                <SelectContent>
                  {branchList.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>تاريخ التفعيل</Label>
              <DatePicker value={form.effectiveDate} onChange={(v) => setForm({ ...form, effectiveDate: v })} />
            </div>
            <div>
              <Label>سبب النقل</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="السبب..." />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button onClick={handleSubmit} disabled={createTransferMut.isPending}>
                {createTransferMut.isPending ? "جاري الإرسال..." : "إرسال الطلب"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
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
      />
    </PageShell>
  );
}
