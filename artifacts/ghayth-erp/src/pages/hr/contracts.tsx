/**
 * /hr/contracts — صفحة إدارة عقود الموظفين
 *
 * تعرض جدول بكل العقود مع فلترة حسب الحالة وحالة الاعتماد،
 * وقائمة إجراءات (تقديم، اعتماد، رفض، توقيع، تفعيل، إنهاء) على كل صف.
 */
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus, FileText } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { formatDateAr } from "@/lib/formatters";

// ─── Arabic Maps ────────────────────────────────────────────────────

const APPROVAL_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "bg-gray-100 text-gray-700" },
  pending_approval: { label: "بانتظار الاعتماد", color: "bg-yellow-100 text-yellow-700" },
  approved: { label: "معتمد", color: "bg-blue-100 text-blue-700" },
  rejected: { label: "مرفوض", color: "bg-red-100 text-red-700" },
};

const CONTRACT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "bg-gray-100 text-gray-700" },
  pending_approval: { label: "بانتظار الاعتماد", color: "bg-yellow-100 text-yellow-700" },
  approved: { label: "معتمد", color: "bg-blue-100 text-blue-700" },
  rejected: { label: "مرفوض", color: "bg-red-100 text-red-700" },
  signed: { label: "موقّع", color: "bg-purple-100 text-purple-700" },
  active: { label: "نشط", color: "bg-green-100 text-green-700" },
  terminated: { label: "منتهي", color: "bg-red-100 text-red-700" },
};

const CONTRACT_TYPE_MAP: Record<string, string> = {
  full_time: "دوام كامل",
  part_time: "دوام جزئي",
  contract: "عقد مؤقت",
  probation: "فترة تجربة",
};

const STATUS_OPTIONS = [
  { value: "draft", label: "مسودة" },
  { value: "pending_approval", label: "بانتظار الاعتماد" },
  { value: "approved", label: "معتمد" },
  { value: "rejected", label: "مرفوض" },
  { value: "signed", label: "موقّع" },
  { value: "active", label: "نشط" },
  { value: "terminated", label: "منتهي" },
];

// ─── Component ──────────────────────────────────────────────────────

export default function ContractsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: any[]; total: number }>(
    ["contracts"],
    "/hr/contracts",
  );

  const submitMutation = useApiMutation<unknown, { id: number }>(
    (body) => `/hr/contracts/${body.id}/submit`,
    "POST",
    [["contracts"]],
    { successMessage: "تم تقديم العقد للاعتماد" },
  );

  const approveMutation = useApiMutation<unknown, { id: number }>(
    (body) => `/hr/contracts/${body.id}/approve`,
    "POST",
    [["contracts"]],
    { successMessage: "تم اعتماد العقد" },
  );

  const rejectMutation = useApiMutation<unknown, { id: number }>(
    (body) => `/hr/contracts/${body.id}/reject`,
    "POST",
    [["contracts"]],
    { successMessage: "تم رفض العقد" },
  );

  const signCompanyMutation = useApiMutation<unknown, { id: number }>(
    (body) => `/hr/contracts/${body.id}/sign-company`,
    "POST",
    [["contracts"]],
    { successMessage: "تم توقيع العقد من الشركة" },
  );

  const activateMutation = useApiMutation<unknown, { id: number }>(
    (body) => `/hr/contracts/${body.id}/activate`,
    "POST",
    [["contracts"]],
    { successMessage: "تم تفعيل العقد" },
  );

  const terminateMutation = useApiMutation<unknown, { id: number }>(
    (body) => `/hr/contracts/${body.id}/terminate`,
    "POST",
    [["contracts"]],
    { successMessage: "تم إنهاء العقد" },
  );

  if (isLoading) return <PageShell title="عقود الموظفين"><LoadingSpinner /></PageShell>;
  if (isError) return <PageShell title="عقود الموظفين"><ErrorState onRetry={() => refetch()} /></PageShell>;

  const contracts = data?.data || [];

  const columns: DataTableColumn<any>[] = [
    { key: "ref", header: "رقم العقد", sortable: true, searchable: true, render: (r: any) => <span className="font-mono text-sm">{r.ref}</span> },
    { key: "employeeName", header: "الموظف", sortable: true, searchable: true, render: (r: any) => <span className="font-medium">{r.employeeName}</span> },
    { key: "contractType", header: "نوع العقد", sortable: true, render: (r: any) => CONTRACT_TYPE_MAP[r.contractType] || r.contractType },
    { key: "startDate", header: "تاريخ البداية", sortable: true, render: (r: any) => <span className="text-sm text-gray-600">{r.startDate ? formatDateAr(r.startDate) : "—"}</span> },
    { key: "endDate", header: "تاريخ النهاية", sortable: true, render: (r: any) => <span className="text-sm text-gray-600">{r.endDate ? formatDateAr(r.endDate) : "—"}</span> },
    { key: "approvalStatus", header: "حالة الاعتماد", sortable: true, render: (r: any) => <StatusBadge value={r.approvalStatus} map={APPROVAL_STATUS_MAP} /> },
    { key: "status", header: "حالة العقد", sortable: true, render: (r: any) => <StatusBadge value={r.status} map={CONTRACT_STATUS_MAP} /> },
    {
      key: "actions", header: "", width: "50px",
      render: (r: any) => (
        <ActionsMenu
          contract={r}
          onSubmit={() => submitMutation.mutate({ id: r.id })}
          onApprove={() => approveMutation.mutate({ id: r.id })}
          onReject={() => rejectMutation.mutate({ id: r.id })}
          onSignCompany={() => signCompanyMutation.mutate({ id: r.id })}
          onActivate={() => activateMutation.mutate({ id: r.id })}
          onTerminate={() => terminateMutation.mutate({ id: r.id })}
        />
      ),
    },
  ];

  return (
    <PageShell
      title="عقود الموظفين"
      subtitle="إدارة جميع عقود الموظفين"
      actions={
        <Link href="/hr/contracts/create">
          <Button className="gap-1.5">
            <Plus className="h-4 w-4" />
            عقد جديد
          </Button>
        </Link>
      }
    >
      <DataTable
        columns={columns}
        data={contracts}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        searchPlaceholder="بحث بالرقم أو اسم الموظف..."
        statusOptions={STATUS_OPTIONS}
        statusField="status"
        emptyMessage="لا توجد عقود"
        emptyIcon={<FileText className="h-6 w-6 text-slate-400" />}
      />
    </PageShell>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function StatusBadge({
  value,
  map,
}: {
  value: string;
  map: Record<string, { label: string; color: string }>;
}) {
  const entry = map[value];
  if (!entry) return <Badge variant="secondary">{value}</Badge>;
  return (
    <Badge variant="secondary" className={entry.color}>
      {entry.label}
    </Badge>
  );
}

function ActionsMenu({
  contract,
  onSubmit,
  onApprove,
  onReject,
  onSignCompany,
  onActivate,
  onTerminate,
}: {
  contract: any;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSignCompany: () => void;
  onActivate: () => void;
  onTerminate: () => void;
}) {
  const status = contract.status;
  const approvalStatus = contract.approvalStatus;

  const canSubmit = status === "draft" || approvalStatus === "draft";
  const canApprove = approvalStatus === "pending_approval";
  const canReject = approvalStatus === "pending_approval";
  const canSign = status === "approved" || approvalStatus === "approved";
  const canActivate = status === "signed";
  const canTerminate = status === "active";

  const hasActions = canSubmit || canApprove || canReject || canSign || canActivate || canTerminate;
  if (!hasActions) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canSubmit && <DropdownMenuItem onClick={onSubmit}>تقديم للاعتماد</DropdownMenuItem>}
        {canApprove && <DropdownMenuItem onClick={onApprove}>اعتماد</DropdownMenuItem>}
        {canReject && <DropdownMenuItem onClick={onReject} className="text-red-600">رفض</DropdownMenuItem>}
        {canSign && <DropdownMenuItem onClick={onSignCompany}>توقيع الشركة</DropdownMenuItem>}
        {canActivate && <DropdownMenuItem onClick={onActivate}>تفعيل</DropdownMenuItem>}
        {canTerminate && <DropdownMenuItem onClick={onTerminate} className="text-red-600">إنهاء العقد</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
