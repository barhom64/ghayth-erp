import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { Edit, CalendarDays } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";


const STATUS_LABELS: Record<string, string> = {
  pending: "معلق",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغى",
  returned: "مُرجع",
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "إجازة سنوية",
  sick: "إجازة مرضية",
  emergency: "إجازة طارئة",
  unpaid: "إجازة بدون راتب",
  maternity: "إجازة أمومة",
  paternity: "إجازة أبوة",
  compassionate: "إجازة عزاء",
  hajj: "إجازة حج",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "approved") return "success" as const;
  if (["rejected", "cancelled"].includes(status)) return "destructive" as const;
  if (status === "returned") return "warning" as const;
  if (status === "pending") return "info" as const;
  return "default" as const;
}

function calculateDuration(startDate?: string | null, endDate?: string | null): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays > 0 ? diffDays : null;
}

export default function LeaveDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/hr/leaves/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["leave", String(id)],
    id ? `/hr/leaves/${id}` : null,
    !!id
  );

  const leave = data;

  const duration = useMemo(() => {
    if (leave?.duration) return leave.duration;
    return calculateDuration(leave?.startDate, leave?.endDate);
  }, [leave?.duration, leave?.startDate, leave?.endDate]);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!leave) return out;
    if (leave.employeeId) {
      out.push({
        type: "employee",
        id: leave.employeeId,
        label: leave.employeeName || `موظف #${leave.employeeId}`,
        sublabel: "الموظف",
        href: `/employees/${leave.employeeId}`,
      });
    }
    return out;
  }, [leave]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!leave) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: leave.ref || `LV-${id}` },
          { label: "الموظف", value: leave.employeeName || "-" },
          { label: "نوع الإجازة", value: LEAVE_TYPE_LABELS[leave.leaveType] || leave.leaveType || "-" },
          { label: "تاريخ البداية", value: formatDateAr(leave.startDate) },
          { label: "تاريخ النهاية", value: formatDateAr(leave.endDate) },
          { label: "المدة (أيام)", value: duration ? `${duration} يوم` : "-" },
          { label: "الحالة", value: STATUS_LABELS[leave.status] || leave.status || "-" },
          { label: "تاريخ الطلب", value: formatDateAr(leave.createdAt) },
        ],
      },
    ];
    if (leave.reason || leave.description) {
      sections.push({ kind: "text", title: "سبب الإجازة", body: leave.reason || leave.description });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "مقدم الطلب", name: leave.employeeName || "" },
        { label: "المعتمد", name: leave.approvedByName || "" },
      ],
    });
    return sections;
  }, [leave, duration, id]);

  const handleEdit = () => {
    setLocation(`/hr/leaves/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-gray-500" />
            بيانات الإجازة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Employee name hero */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-xl font-bold text-gray-900">
              {leave?.employeeName || "-"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {leave?.leaveType && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">نوع الإجازة</p>
                <Badge variant="outline">
                  {LEAVE_TYPE_LABELS[leave.leaveType] || leave.leaveType}
                </Badge>
              </div>
            )}
            {leave?.startDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ البداية</p>
                <span className="text-gray-800">{formatDateAr(leave.startDate)}</span>
              </div>
            )}
            {leave?.endDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ النهاية</p>
                <span className="text-gray-800">{formatDateAr(leave.endDate)}</span>
              </div>
            )}
            {duration && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">المدة</p>
                <span className="text-gray-800">{duration} يوم</span>
              </div>
            )}
            {leave?.createdAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الطلب</p>
                <span className="text-gray-800">{formatDateAr(leave.createdAt)}</span>
              </div>
            )}
          </div>

          {(leave?.reason || leave?.description) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">سبب الإجازة</p>
              <p className="text-gray-800 whitespace-pre-wrap">{leave.reason || leave.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Approval actions — visible while pending */}
        {id && leave && ["pending", "returned"].includes(leave.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="leave"
                entityId={id}
                currentStatus={leave.status}
                approveEndpoint={`/hr/leave-requests/${id}/approve`}
                rejectEndpoint={`/hr/leave-requests/${id}/approve`}
                returnEndpoint={`/hr/leave-requests/${id}/approve`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, reason: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, reason: notes })}
                returnBody={(notes) => ({ approved: "returned", reason: notes })}
                pendingStatuses={["pending", "returned"]}
                invalidateKeys={[["leaves"], ["leave-requests"], ["leave-balance"], ["leave-stats"]]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث الإجازة" });
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Action history */}
        {id && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionHistory entityType="leave" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  );

  return (
    <DetailPageLayout
      title={leave?.ref ? `إجازة ${leave.ref}` : "تفاصيل الإجازة"}
      subtitle={
        leave?.leaveType
          ? LEAVE_TYPE_LABELS[leave.leaveType] || leave.leaveType
          : undefined
      }
      backPath="/hr/leaves"
      refNumber={leave?.ref || (id ? `LV-${id}` : undefined)}
      status={
        leave
          ? { label: STATUS_LABELS[leave.status] || leave.status || "-", tone: statusTone(leave.status) }
          : undefined
      }
      typeLabel={
        leave?.leaveType
          ? LEAVE_TYPE_LABELS[leave.leaveType] || leave.leaveType
          : undefined
      }
      createdAt={leave?.createdAt}
      updatedAt={leave?.updatedAt}
      createdByName={leave?.createdByName || leave?.employeeName}
      assignedToName={leave?.approvedByName}
      relatedEntities={relatedEntities}
      entityType="leave"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {leave && (
            <EntityPrintButton
              branchId={leave.branchId}
              title={leave.ref ? `إجازة ${leave.ref}` : "إجازة"}
              ref={leave.ref || `LV-${id}`}
              date={formatDateAr(leave.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="hr:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={
              !leave || ["approved", "rejected", "cancelled"].includes(leave.status)
            }
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
