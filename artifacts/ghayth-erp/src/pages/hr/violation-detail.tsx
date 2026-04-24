import { useParams, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  AlertTriangle, Shield, DollarSign, Calendar, User, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiGrid } from "@/components/shared/kpi-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { SEVERITY_LEVELS, INCIDENT_LABELS } from "@/lib/hr-type-maps";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { PageStatusBadge } from "@/components/page-status-badge";
import { ProcessStages, type StageStep } from "@/components/shared/entity-timeline";

const VIOLATION_LIFECYCLE = [
  { key: "draft",               label: "مسودة" },
  { key: "pending_employee",    label: "بانتظار الموظف" },
  { key: "pending_manager",     label: "بانتظار المدير" },
  { key: "pending_hr_decision", label: "بانتظار HR" },
  { key: "approved",            label: "مُنفَّذ" },
];

function buildViolationSteps(status: string | undefined): StageStep[] {
  const s = status ?? "draft";
  if (s === "rejected") {
    return [{ label: "مرفوضة", status: "rejected" }];
  }
  const idx = VIOLATION_LIFECYCLE.findIndex((x) => x.key === s);
  return VIOLATION_LIFECYCLE.map((step, i): StageStep => {
    if (idx === -1) return { label: step.label, status: "pending" };
    if (i < idx)    return { label: step.label, status: "completed" };
    if (i === idx)  return { label: step.label, status: "current" };
    return { label: step.label, status: "pending" };
  });
}

export default function ViolationDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useApiQuery<any>(["hr-violation-detail", id], `/hr/violations/${id}`);
  const item = data?.data ?? data;

  if (isLoading) {
    return (
      <PageShell
        title="جارٍ تحميل المخالفة..."
        loading
        breadcrumbs={[
          { href: "/hr", label: "الموارد البشرية" },
          { href: "/hr/violations", label: "المخالفات والجزاءات" },
        ]}
      >
        <Card><CardContent className="py-12"><LoadingSpinner /></CardContent></Card>
      </PageShell>
    );
  }
  if (isError) {
    return (
      <PageShell
        title="تعذّر تحميل المخالفة"
        breadcrumbs={[
          { href: "/hr", label: "الموارد البشرية" },
          { href: "/hr/violations", label: "المخالفات والجزاءات" },
        ]}
      >
        <ErrorState onRetry={() => window.location.reload()} />
      </PageShell>
    );
  }

  if (!item) {
    return (
      <PageShell
        title="المخالفة غير موجودة"
        breadcrumbs={[
          { href: "/hr", label: "الموارد البشرية" },
          { href: "/hr/violations", label: "المخالفات والجزاءات" },
        ]}
      >
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <AlertTriangle size={36} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium mb-1">لا توجد مخالفة بهذا الرقم</p>
            <p className="text-sm mb-4">قد تكون المخالفة محذوفة أو غير متاحة لصلاحياتك.</p>
            <Button variant="outline" onClick={() => navigate("/hr/violations")}>
              العودة إلى قائمة المخالفات
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const severity = SEVERITY_LEVELS[item.severity] ?? { label: item.severity || "متوسطة", color: "bg-gray-100 text-gray-600" };
  const memos: any[] = item.memos || [];

  return (
    <PageShell
      title={`مخالفة — ${item?.employeeName || ""}`}
      subtitle={item ? `${INCIDENT_LABELS[item.type] || item.type} — ${item.period}` : undefined}
      loading={isLoading}
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/violations", label: "المخالفات" },
        { label: item?.employeeName || "..." },
      ]}
      actions={
        <Badge className={cn("text-sm px-3 py-1", severity.color)}>{severity.label}</Badge>
      }
    >
      {/* KPI cards */}
      <KpiGrid items={[
        { label: "الموظف", value: item.employeeName, icon: User, color: "text-blue-600 bg-blue-50", size: "sm" },
        { label: "النوع", value: INCIDENT_LABELS[item.type] || item.type, icon: AlertTriangle, color: "text-amber-600 bg-amber-50", size: "sm" },
        { label: "الخصم", value: formatCurrency(Number(item.deduction || 0)), icon: DollarSign, color: "text-red-600 bg-red-50", size: "sm" },
        { label: "الفترة", value: item.period || "—", icon: Calendar, color: "text-purple-600 bg-purple-50", size: "sm" },
      ]} />

      {/* شريط مراحل المخالفة */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">مراحل المخالفة</p>
          <ProcessStages steps={buildViolationSteps(item.status)} />
        </CardContent>
      </Card>

      {/* تفاصيل المخالفة */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">تفاصيل المخالفة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500">الموظف</p>
              <p className="font-medium">{item.employeeName}</p>
              {item.empNumber && <p className="text-xs text-gray-400">#{item.empNumber}</p>}
            </div>
            <div>
              <p className="text-gray-500">المسمى الوظيفي</p>
              <p className="font-medium">{item.jobTitle || "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">الفرع</p>
              <p className="font-medium">{item.branchName || "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">نوع المخالفة</p>
              <p className="font-medium">{INCIDENT_LABELS[item.type] || item.type}</p>
            </div>
            <div>
              <p className="text-gray-500">الدرجة</p>
              <Badge variant="outline" className={cn("text-xs", severity.color)}>
                {severity.label}
              </Badge>
            </div>
            <div>
              <p className="text-gray-500">مبلغ الخصم</p>
              <p className="font-medium text-red-600">{formatCurrency(Number(item.deduction || 0))}</p>
            </div>
            <div>
              <p className="text-gray-500">الفترة</p>
              <p className="font-medium font-mono">{item.period || "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">تاريخ التسجيل</p>
              <p className="font-medium">{item.createdAt ? formatDateAr(item.createdAt) : "—"}</p>
            </div>
            {item.description && (
              <div className="col-span-full">
                <p className="text-gray-500">الوصف</p>
                <p className="font-medium">{item.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* إجراءات الاعتماد */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">إجراءات الاعتماد</CardTitle>
        </CardHeader>
        <CardContent>
          <ApprovalActions
            entityType="violation"
            entityId={Number(id)}
            approveEndpoint={`/hr/violations/${id}/approve`}
            rejectEndpoint={`/hr/violations/${id}/reject`}
            returnEndpoint={`/hr/violations/${id}/return`}
            approveMethod="PATCH"
            rejectMethod="PATCH"
            returnMethod="PATCH"
            invalidateKeys={[["hr-violation-detail", id || ""], ["violations"]]}
          />
        </CardContent>
      </Card>

      {/* سجل الإجراءات */}
      <ActionHistory entityType="violation" entityId={Number(id)} />

      {/* محاضر التحقيق المرتبطة */}
      {memos.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              محاضر التحقيق المرتبطة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "memoNumber", header: "رقم المحضر", sortable: true, render: (v) => (
                  <Link href={`/hr/discipline/memos/${v.id}`}>
                    <span className="font-mono text-xs text-blue-700 hover:underline cursor-pointer">{v.memoNumber}</span>
                  </Link>
                ) },
                { key: "penaltyLabel", header: "الجزاء", sortable: true, render: (v) => <span className="text-gray-700">{v.penaltyLabel || "—"}</span> },
                { key: "totalDeductionAmount", header: "المبلغ", sortable: true, render: (v) => <span className="font-medium text-red-600">{formatCurrency(Number(v.totalDeductionAmount || 0))}</span> },
                { key: "status", header: "الحالة", sortable: true, render: (v) => <Badge variant="outline" className="text-xs">{v.status}</Badge> },
                { key: "createdAt", header: "التاريخ", sortable: true, render: (v) => <span className="text-gray-500">{v.createdAt ? formatDateAr(v.createdAt) : "—"}</span> },
              ] as DataTableColumn<any>[]}
              data={memos}
              noToolbar
              emptyMessage="لا توجد محاضر"
              pageSize={10}
            />
          </CardContent>
        </Card>
      )}

      <ApprovalTimeline entityType="employee_violation" entityId={Number(id)} />
      <EntityDocuments entityType="employee_violation" entityId={Number(id)} />
    </PageShell>
  );
}
