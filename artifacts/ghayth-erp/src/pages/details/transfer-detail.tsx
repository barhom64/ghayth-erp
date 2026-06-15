import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@workspace/entity-kit";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ApprovalActions, ActionHistory } from "@workspace/workflow-kit";
import { Edit, ArrowLeftRight, UserCheck, UserX } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";


/**
 * TransferDetail — detail page for a single employee transfer.
 *
 * Route: /hr/transfers/:id
 * Fetches from: /hr/transfers/${id}
 */

const STATUS_LABELS: Record<string, string> = {
  pending: "معلق",
  pending_receiving_manager: "بانتظار استلام الفرع",
  approved: "معتمد",
  rejected: "مرفوض",
  completed: "مكتمل",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (["approved", "completed"].includes(status)) return "success" as const;
  if (status === "rejected") return "destructive" as const;
  if (status === "pending") return "info" as const;
  return "default" as const;
}

export default function TransferDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/hr/transfers/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["hr-transfer", String(id)],
    `/hr/transfers/${id}`,
    !!id
  );

  const transfer = data;
  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("transfer", id ?? 0);
  const [receiving, setReceiving] = useState(false);
  // Dialog state replaces window.prompt for the receive/reject action.
  // `confirming` is null when closed, true|false when open (kind of action).
  const [confirming, setConfirming] = useState<boolean | null>(null);
  const [receiveNotes, setReceiveNotes] = useState("");

  const handleReceive = (confirmed: boolean) => {
    if (!id) return;
    setReceiveNotes("");
    setConfirming(confirmed);
  };
  const submitReceive = async () => {
    if (!id || confirming === null) return;
    const confirmed = confirming;
    if (!confirmed && !receiveNotes.trim()) {
      toast({ variant: "destructive", title: "سبب الرفض مطلوب" });
      return;
    }
    setConfirming(null);
    setReceiving(true);
    try {
      await apiFetch(`/hr/transfers/${id}/receive`, {
        method: "PATCH",
        body: JSON.stringify({ confirmed, notes: receiveNotes.trim() || undefined }),
      });
      toast({ title: confirmed ? "تم استقبال الموظف" : "تم رفض الاستقبال" });
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذر التنفيذ", description: err.message });
    } finally {
      setReceiving(false);
    }
  };

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!transfer) return out;
    if (transfer.employeeId) {
      out.push({
        type: "employee",
        id: transfer.employeeId,
        label: transfer.employeeName || `موظف #${transfer.employeeId}`,
        sublabel: "الموظف",
        href: `/employees/${transfer.employeeId}`,
      });
    }
    return out;
  }, [transfer]);


  const handleEdit = () => {
    setLocation(`/hr/transfers/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            بيانات النقل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {transfer?.employeeName && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">اسم الموظف</p>
                <span className="text-status-neutral-foreground font-bold">{transfer.employeeName}</span>
              </div>
            )}
            {transfer?.fromDepartment && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">من القسم</p>
                <Badge variant="outline">{transfer.fromDepartment}</Badge>
              </div>
            )}
            {transfer?.toDepartment && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">إلى القسم</p>
                <Badge variant="secondary">{transfer.toDepartment}</Badge>
              </div>
            )}
            {transfer?.fromBranch && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">من الفرع</p>
                <span className="text-status-neutral-foreground">{transfer.fromBranch}</span>
              </div>
            )}
            {transfer?.toBranch && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">إلى الفرع</p>
                <span className="text-status-neutral-foreground">{transfer.toBranch}</span>
              </div>
            )}
            {transfer?.transferDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ النقل</p>
                <span className="text-status-neutral-foreground">{formatDateAr(transfer.transferDate)}</span>
              </div>
            )}
            {transfer?.reason && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">السبب</p>
                <span className="text-status-neutral-foreground">{transfer.reason}</span>
              </div>
            )}
          </div>

          {transfer?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{transfer.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Approval actions — visible while pending */}
        {id && transfer && transfer.status === "pending" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="transfer"
                entityId={id}
                currentStatus={transfer.status}
                approveEndpoint={`/hr/transfers/${id}/approve`}
                rejectEndpoint={`/hr/transfers/${id}/approve`}
                returnEndpoint={`/hr/transfers/${id}/return`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ notes })}
                pendingStatuses={["pending", "returned"]}
                invalidateKeys={[["transfers"]]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث طلب النقل" });
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Receiving-branch confirmation — Stage 2 of the transfer
            flow. The destination branch manager must accept the
            employee before the transfer becomes complete. */}
        {id && transfer && transfer.status === "pending_receiving_manager" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">استقبال الفرع المستلم</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                يتطلب تأكيد مدير الفرع المستلم لإتمام النقل.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="default"
                  className="gap-1"
                  disabled={receiving}
                  onClick={() => handleReceive(true)}
                >
                  <UserCheck className="h-4 w-4" />
                  تأكيد الاستقبال
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-status-error-foreground"
                  disabled={receiving}
                  onClick={() => handleReceive(false)}
                >
                  <UserX className="h-4 w-4" />
                  رفض الاستقبال
                </Button>
              </div>
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
              <ActionHistory entityType="transfer" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  );

  return (
    <>
    <DetailPageLayout
      title={transfer?.employeeName ? `نقل ${transfer.employeeName}` : "تفاصيل النقل"}
      subtitle={
        transfer
          ? `${transfer.fromDepartment || ""} → ${transfer.toDepartment || ""}`
          : undefined
      }
      backPath="/hr/transfers"
      refNumber={`TRF-${id}`}
      status={
        transfer
          ? { label: STATUS_LABELS[transfer.status] || transfer.status || "-", tone: statusTone(transfer.status) }
          : undefined
      }
      createdAt={transfer?.createdAt}
      updatedAt={transfer?.updatedAt}
      createdByName={transfer?.createdByName}
      assignedToName={transfer?.approvedByName}
      relatedEntities={relatedEntities}
      entityType="transfer"
      entityId={id ?? 0}
      overview={overview}
      extraTabs={registryExtraTabs}
      hideTabs={registryHideTabs}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {transfer && (
            <PrintButton
              entityType="transfer"
              entityId={id ?? 0}
             />
          )}
          <GuardedButton
            perm="hr:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={
              !transfer || ["approved", "rejected", "completed"].includes(transfer.status)
            }
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
    <Dialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirming ? "تأكيد استقبال الموظف" : "رفض الاستقبال"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs">{confirming ? "ملاحظات (اختياري)" : "سبب الرفض (مطلوب)"}</Label>
          <Textarea
            value={receiveNotes}
            onChange={(e) => setReceiveNotes(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirming(null)}>إلغاء</Button>
          <Button onClick={submitReceive} disabled={receiving} rateLimitAware>
            {confirming ? "تأكيد الاستقبال" : "تأكيد الرفض"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
