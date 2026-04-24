import { useParams, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Timer, Calendar, DollarSign, Clock, User } from "lucide-react";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { cn } from "@/lib/utils";
import { KpiGrid } from "@/components/shared/kpi-card";
import { ProcessStages, type StageStep } from "@/components/shared/entity-timeline";
import { OVERTIME_STATUS } from "@/lib/hr-type-maps";

const OVERTIME_LIFECYCLE = [
  { key: "pending",  label: "بانتظار الموافقة" },
  { key: "approved", label: "معتمد" },
  { key: "paid",     label: "تم الصرف" },
];

function buildOvertimeSteps(status: string | undefined): StageStep[] {
  const s = status ?? "pending";
  if (s === "rejected") {
    return [{ label: "مرفوض", status: "rejected" }];
  }
  const idx = OVERTIME_LIFECYCLE.findIndex((x) => x.key === s);
  return OVERTIME_LIFECYCLE.map((step, i): StageStep => {
    if (idx === -1) return { label: step.label, status: "pending" };
    if (i < idx)    return { label: step.label, status: "completed" };
    if (i === idx)  return { label: step.label, status: "current" };
    return { label: step.label, status: "pending" };
  });
}

export default function OvertimeDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useApiQuery<any>(["hr-overtime-detail", id], `/hr/overtime/${id}`);
  const item = data?.data ?? data;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  if (!item) {
    return (
      <PageShell title="الطلب غير موجود" breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { href: "/hr/overtime", label: "الوقت الإضافي" }]}>
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Timer size={36} className="mx-auto mb-3 opacity-40" />
            <p>طلب الوقت الإضافي غير موجود</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/hr/overtime")}>
              العودة
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const st = OVERTIME_STATUS[item.status] ?? { label: item.status, color: "bg-gray-100 text-gray-600" };

  const kpis = [
    { label: "الموظف", value: item.employeeName, icon: User, color: "text-blue-600 bg-blue-50" },
    { label: "الساعات", value: `${Number(item.hours).toFixed(1)} ساعة`, icon: Clock, color: "text-purple-600 bg-purple-50" },
    { label: "المعامل", value: `×${Number(item.multiplier || 1.5).toFixed(2)}`, icon: Timer, color: "text-cyan-600 bg-cyan-50" },
    { label: "المبلغ", value: formatCurrency(Number(item.totalAmount || 0)), icon: DollarSign, color: "text-green-600 bg-green-50" },
  ];

  return (
    <PageShell
      title={`طلب وقت إضافي ${item?.requestNumber || ""}`}
      subtitle={item ? `${item.employeeName} — ${item.jobTitle || ""}` : undefined}
      loading={isLoading}
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/overtime", label: "الوقت الإضافي" },
        { label: item.requestNumber },
      ]}
      actions={
        <Badge className={cn("text-sm px-3 py-1", st.color)}>{st.label}</Badge>
      }
    >
      {/* KPI cards */}
      <KpiGrid items={kpis.map(k => ({ ...k, size: "sm" as const }))} />

      {/* شريط مراحل الوقت الإضافي */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">دورة حياة الطلب</p>
          <ProcessStages steps={buildOvertimeSteps(item.status)} />
        </CardContent>
      </Card>

      {/* تفاصيل الطلب */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">تفاصيل الطلب</CardTitle>
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
              <p className="text-gray-500">تاريخ العمل الإضافي</p>
              <p className="font-medium">{item.overtimeDate ? formatDateAr(item.overtimeDate) : "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">الوقت</p>
              <p className="font-medium font-mono">
                {item.startTime?.slice(0, 5)} — {item.endTime?.slice(0, 5)}
              </p>
            </div>
            <div>
              <p className="text-gray-500">الراتب الأساسي</p>
              <p className="font-medium">{formatCurrency(Number(item.salary || 0))}</p>
            </div>
            <div>
              <p className="text-gray-500">فترة الرواتب</p>
              <p className="font-medium font-mono">{item.payrollPeriod || "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">تاريخ الطلب</p>
              <p className="font-medium">{item.createdAt ? formatDateAr(item.createdAt) : "—"}</p>
            </div>
            {item.approvedAt && (
              <div>
                <p className="text-gray-500">تاريخ الموافقة</p>
                <p className="font-medium">{formatDateAr(item.approvedAt)}</p>
              </div>
            )}
            {item.reason && (
              <div className="col-span-full">
                <p className="text-gray-500">السبب</p>
                <p className="font-medium">{item.reason}</p>
              </div>
            )}
            {item.rejectReason && (
              <div className="col-span-full">
                <p className="text-gray-500">سبب الرفض</p>
                <p className="font-medium text-red-600">{item.rejectReason}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* حساب المبلغ */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">حساب التعويض</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">الأجر اليومي</span>
              <span>{formatCurrency(Number(item.salary || 0) / 30)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">الأجر بالساعة</span>
              <span>{formatCurrency(Number(item.salary || 0) / 30 / 8)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">عدد الساعات</span>
              <span>{Number(item.hours).toFixed(1)} ساعة</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">معامل الضرب</span>
              <span>×{Number(item.multiplier || 1.5).toFixed(2)}</span>
            </div>
            <hr className="border-gray-200" />
            <div className="flex justify-between font-bold text-base">
              <span>إجمالي التعويض</span>
              <span className="text-green-700">{formatCurrency(Number(item.totalAmount || 0))}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base">إجراءات الاعتماد</CardTitle></CardHeader>
        <CardContent>
          <ApprovalActions
            entityType="overtime"
            entityId={Number(id)}
            approveEndpoint={`/hr/overtime/${id}/approve`}
            rejectEndpoint={`/hr/overtime/${id}/reject`}
            approveMethod="PATCH"
            rejectMethod="PATCH"
            invalidateKeys={[["hr-overtime-detail", id || ""], ["hr-overtime"]]}
          />
        </CardContent>
      </Card>
      <ActionHistory entityType="overtime" entityId={Number(id)} />

      <ApprovalTimeline entityType="hr_overtime_request" entityId={Number(id)} />
      <EntityDocuments entityType="hr_overtime_request" entityId={Number(id)} />
    </PageShell>
  );
}
