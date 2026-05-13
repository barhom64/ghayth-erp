import { useParams } from "wouter";
import { useApiQuery } from "@/lib/api";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Link } from "wouter";
import {
  AlertTriangle, Shield, DollarSign, Calendar, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiGrid } from "@/components/shared/kpi-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { SEVERITY_LEVELS, INCIDENT_LABELS } from "@/lib/hr-type-maps";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
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
  const { extraTabs, hideTabs } = useRegistryTabs("violation", id ?? "");

  const { data, isLoading, isError } = useApiQuery<any>(["hr-violation-detail", id], id ? `/hr/violations/${id}` : null);
  const item = data?.data ?? data;

  const severity = item
    ? (SEVERITY_LEVELS[item.severity] ?? { label: item.severity || "متوسطة", color: "bg-surface-subtle text-muted-foreground" })
    : { label: "—", color: "" };
  const memos: any[] = item?.memos || [];

  const statusToneMap: Record<string, "success" | "warning" | "destructive" | "info" | "muted" | "default"> = {
    approved: "success",
    pending_employee: "info",
    pending_manager: "info",
    pending_hr_decision: "warning",
    draft: "muted",
    rejected: "destructive",
  };

  const statusLabelMap: Record<string, string> = {
    draft: "مسودة",
    pending_employee: "بانتظار الموظف",
    pending_manager: "بانتظار المدير",
    pending_hr_decision: "بانتظار HR",
    approved: "مُنفَّذ",
    rejected: "مرفوضة",
  };

  const overviewContent = item ? (
    <div className="space-y-4">
      {/* KPI cards */}
      <KpiGrid items={[
        { label: "الموظف", value: item.employeeName, icon: User, color: "text-status-info-foreground bg-status-info-surface", size: "sm" },
        { label: "النوع", value: INCIDENT_LABELS[item.type] || item.type, icon: AlertTriangle, color: "text-status-warning-foreground bg-status-warning-surface", size: "sm" },
        { label: "الخصم", value: formatCurrency(Number(item.deduction || 0)), icon: DollarSign, color: "text-status-error-foreground bg-status-error-surface", size: "sm" },
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
              <p className="text-muted-foreground">الموظف</p>
              <p className="font-medium">{item.employeeName}</p>
              {item.empNumber && <p className="text-xs text-muted-foreground">#{item.empNumber}</p>}
            </div>
            <div>
              <p className="text-muted-foreground">المسمى الوظيفي</p>
              <p className="font-medium">{item.jobTitle || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">الفرع</p>
              <p className="font-medium">{item.branchName || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">نوع المخالفة</p>
              <p className="font-medium">{INCIDENT_LABELS[item.type] || item.type}</p>
            </div>
            <div>
              <p className="text-muted-foreground">الدرجة</p>
              <Badge variant="outline" className={cn("text-xs", severity.color)}>
                {severity.label}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground">مبلغ الخصم</p>
              <p className="font-medium text-status-error-foreground">{formatCurrency(Number(item.deduction || 0))}</p>
            </div>
            <div>
              <p className="text-muted-foreground">الفترة</p>
              <p className="font-medium font-mono">{item.period || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">تاريخ التسجيل</p>
              <p className="font-medium">{item.createdAt ? formatDateAr(item.createdAt) : "—"}</p>
            </div>
            {item.description && (
              <div className="col-span-full">
                <p className="text-muted-foreground">الوصف</p>
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
              <Shield className="h-4 w-4 text-status-info-foreground" />
              محاضر التحقيق المرتبطة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "memoNumber", header: "رقم المحضر", sortable: true, render: (v) => (
                  <Link href={`/hr/discipline/memos/${v.id}`}>
                    <span className="font-mono text-xs text-status-info-foreground hover:underline cursor-pointer">{v.memoNumber}</span>
                  </Link>
                ) },
                { key: "penaltyLabel", header: "الجزاء", sortable: true, render: (v) => <span className="text-status-neutral-foreground">{v.penaltyLabel || "—"}</span> },
                { key: "totalDeductionAmount", header: "المبلغ", sortable: true, render: (v) => <span className="font-medium text-status-error-foreground">{formatCurrency(Number(v.totalDeductionAmount || 0))}</span> },
                { key: "status", header: "الحالة", sortable: true, render: (v) => <PageStatusBadge status={v.status} domain="memo" /> },
                { key: "createdAt", header: "التاريخ", sortable: true, render: (v) => <span className="text-muted-foreground">{v.createdAt ? formatDateAr(v.createdAt) : "—"}</span> },
              ] as DataTableColumn<any>[]}
              data={memos}
              noToolbar
              emptyMessage="لا توجد محاضر"
              pageSize={10}
            />
          </CardContent>
        </Card>
      )}
    </div>
  ) : null;

  return (
    <DetailPageLayout
      title={`مخالفة — ${item?.employeeName || ""}`}
      subtitle={item ? `${INCIDENT_LABELS[item.type] || item.type} — ${item.period}` : undefined}
      backPath="/hr/violations"
      status={item ? {
        label: statusLabelMap[item.status] || item.status || severity.label,
        tone: statusToneMap[item.status] || "default",
      } : undefined}
      entityType="violation"
      entityId={Number(id)}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      isLoading={isLoading}
      error={isError ? true : undefined}
     
      createdAt={item?.createdAt}
      overview={overviewContent}
      actions={
        <Badge className={cn("text-sm px-3 py-1", severity.color)}>{severity.label}</Badge>
      }
    />
  );
}
