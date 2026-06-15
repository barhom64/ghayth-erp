import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@workspace/entity-kit";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@workspace/workflow-kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { Edit, CalendarDays, XCircle, ChevronsUp, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
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
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["leave", String(id)],
    `/hr/leaves/${id}`,
    !!id
  );

  const leave = data;
  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("leave_request", id ?? 0);

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


  const [confirmEscalate, setConfirmEscalate] = useState(false);
  const handleEscalate = () => {
    if (!id) return;
    setConfirmEscalate(true);
  };
  const confirmedEscalate = async () => {
    setConfirmEscalate(false);
    if (!id) return;
    try {
      await apiFetch(`/hr/leave-requests/${id}/escalate`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      toast({ title: "تم تصعيد الطلب" });
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذر التصعيد", description: err.message });
    }
  };

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const handleCancel = () => {
    if (!id) return;
    setCancelReason("");
    setCancelOpen(true);
  };
  const confirmCancel = async () => {
    if (!id) return;
    setCancelOpen(false);
    setCancelling(true);
    try {
      await apiFetch(`/hr/leave-requests/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      });
      toast({ title: "تم إلغاء الإجازة" });
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذر الإلغاء", description: err.message });
    } finally {
      setCancelling(false);
    }
  };

  const handleEdit = () => {
    setLocation(`/hr/leaves/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
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
                <p className="text-xs text-muted-foreground mb-0.5">نوع الإجازة</p>
                <Badge variant="outline">
                  {LEAVE_TYPE_LABELS[leave.leaveType] || leave.leaveType}
                </Badge>
              </div>
            )}
            {leave?.startDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ البداية</p>
                <span className="text-status-neutral-foreground">{formatDateAr(leave.startDate)}</span>
              </div>
            )}
            {leave?.endDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ النهاية</p>
                <span className="text-status-neutral-foreground">{formatDateAr(leave.endDate)}</span>
              </div>
            )}
            {duration && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المدة</p>
                <span className="text-status-neutral-foreground">{duration} يوم</span>
              </div>
            )}
            {leave?.createdAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الطلب</p>
                <span className="text-status-neutral-foreground">{formatDateAr(leave.createdAt)}</span>
              </div>
            )}
          </div>

          {(leave?.reason || leave?.description) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">سبب الإجازة</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{leave.reason || leave.description}</p>
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
    <>
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
      extraTabs={registryExtraTabs}
      hideTabs={registryHideTabs}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {leave && (
            <EntityPrintButton
              entityType="leave_request"
              entityId={leave.id ?? id}
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
          <GuardedButton
            perm="hr:update"
            variant="outline"
            size="sm"
            className="text-status-error-foreground"
            onClick={handleCancel}
            disabled={!leave || leave.status !== "approved" || cancelling}
            title={leave && leave.status !== "approved" ? "الإلغاء متاح للإجازات المعتمدة فقط" : undefined}
          >
            <XCircle className="h-4 w-4 ms-1" />
            إلغاء الإجازة
          </GuardedButton>
          {leave && leave.status === "pending" && (
            <GuardedButton
              perm="hr:update"
              variant="outline"
              size="sm"
              onClick={handleEscalate}
              title="يصبح متاحاً بعد 48 ساعة من بدء المرحلة الحالية"
            >
              <ChevronsUp className="h-4 w-4 ms-1" />
              تصعيد
            </GuardedButton>
          )}
          {leave && leave.status === "pending" && (
            <GuardedButton
              perm="hr:delete"
              variant="outline"
              size="sm"
              className="text-status-error-foreground"
              onClick={() => setDeleting(true)}
              title="حذف الطلب — متاح للطلبات المعلقة فقط"
            >
              <Trash2 className="h-4 w-4 ms-1" />
              حذف
            </GuardedButton>
          )}
        </>
      }
    />
    {deleting && leave && id && (
      <ConfirmDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        entity={{ type: "leave-request", id, name: `طلب إجازة #${id}` }}
        deletePath={`/hr/leave-requests/${id}`}
        invalidateKeys={[["leave", String(id)], ["leaves"], ["leave-requests"]]}
        successMessage="تم حذف طلب الإجازة"
        onDeleted={() => setLocation("/hr/leaves")}
      />
    )}
    {/* GAP_MATRIX P1 UI-unification §6.2 — ConfirmActionDialog replaces raw AlertDialog */}
    <ConfirmActionDialog
      open={confirmEscalate}
      onOpenChange={(o) => { if (!o) setConfirmEscalate(false); }}
      variant="caution"
      title="تأكيد التصعيد"
      description="سيتم تصعيد الطلب للمرحلة التالية إذا انقضت مهلة 48 ساعة. متابعة؟"
      confirmLabel="تأكيد التصعيد"
      onConfirm={confirmedEscalate}
    />
    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إلغاء الإجازة</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs">سبب الإلغاء (اختياري)</Label>
          <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCancelOpen(false)}>تراجع</Button>
          <Button variant="destructive" onClick={confirmCancel} disabled={cancelling} rateLimitAware>تأكيد الإلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
