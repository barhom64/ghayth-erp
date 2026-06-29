import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Edit, Wrench, Car, User, CheckCircle2, XCircle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "مجدول",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  cancelled: "ملغى",
  overdue: "متأخر",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "completed") return "success" as const;
  if (status === "in_progress") return "info" as const;
  if (status === "cancelled") return "destructive" as const;
  if (status === "overdue") return "destructive" as const;
  if (status === "scheduled") return "muted" as const;
  return "default" as const;
}

const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  preventive: "وقائية",
  corrective: "تصحيحية",
  emergency: "طارئة",
  inspection: "فحص",
};

export default function MaintenanceDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/fleet/maintenance/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("maintenance_request", id ?? 0);
  const { toast } = useToast();
  const [actionBusy, setActionBusy] = useState(false);

  const { data: maintenance, isLoading, error, refetch } = useApiQuery<any>(
    ["maintenance-detail", String(id)],
    `/fleet/maintenance/${id}`,
    !!id
  );

  // Lifecycle transitions — backend has dedicated POST endpoints (not
  // the bare PATCH /:id) so the side-effects fire: complete bumps the
  // vehicle's lastServiceDate + odometer; cancel releases the workshop
  // booking. Buttons are status-gated to match the backend's 409 guard.
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeOdometer, setCompleteOdometer] = useState("");
  // البند ٤ ج-٥ — مَن يتحمّل الصيانة (يلتقطه المُكمِل، يصل المحاسب كافتراض).
  const [completeCostBearer, setCompleteCostBearer] = useState("company");
  const handleComplete = () => {
    if (!id) return;
    setCompleteOdometer("");
    setCompleteCostBearer("company");
    setCompleteOpen(true);
  };
  const confirmComplete = async () => {
    if (!id) return;
    setCompleteOpen(false);
    setActionBusy(true);
    try {
      await apiFetch(`/fleet/maintenance/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          ...(completeOdometer ? { odometer: Number(completeOdometer) } : {}),
          costBearer: completeCostBearer,
        }),
      });
      toast({ title: "تم إكمال الصيانة" });
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذر الإكمال", description: err.message });
    } finally {
      setActionBusy(false);
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
    setActionBusy(true);
    try {
      await apiFetch(`/fleet/maintenance/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      });
      toast({ title: "تم إلغاء الصيانة" });
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذر الإلغاء", description: err.message });
    } finally {
      setActionBusy(false);
    }
  };

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!maintenance) return out;
    if (maintenance.vehicleId) {
      out.push({
        type: "vehicle",
        id: maintenance.vehicleId,
        label: maintenance.vehiclePlateNumber || maintenance.plateNumber || `مركبة #${maintenance.vehicleId}`,
        sublabel: "المركبة",
        href: `/fleet/${maintenance.vehicleId}`,
        icon: Car,
      });
    }
    if (maintenance.driverId) {
      out.push({
        type: "driver",
        id: maintenance.driverId,
        label: maintenance.driverName || `سائق #${maintenance.driverId}`,
        sublabel: "السائق",
        href: `/fleet/drivers/${maintenance.driverId}`,
        icon: User,
      });
    }
    if (maintenance.vendorId) {
      out.push({
        type: "vendor",
        id: maintenance.vendorId,
        label: maintenance.vendorName || `مورد #${maintenance.vendorId}`,
        sublabel: "الورشة / المورد",
      });
    }
    return out;
  }, [maintenance]);


  const editDelete = useDetailEditDelete({
    entityLabel: "الصيانة",
    patchPath: `/fleet/maintenance/${id}`,
    deletePath: `/fleet/maintenance/${id}`,
    listPath: "/fleet/maintenance",
    initialValues: maintenance,
    fields: [
      { key: "description", label: "الوصف" },
      { key: "cost", label: "التكلفة", type: "number" },
      { key: "odometer", label: "العداد", type: "number" },
      { key: "notes", label: "ملاحظات" },
    ],
    invalidateKeys: [["maintenance-detail", String(id)], ["fleet-maintenance"]],
    onSaved: () => refetch(),
  });

  const cost = maintenance?.cost || maintenance?.amount || 0;

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-3">
        <InlineEditCard hook={editDelete} />
      </div>
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            بيانات الصيانة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero cost */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-3xl font-bold text-gray-900">
              {formatCurrency(cost)}
            </span>
            <span className="text-xs text-muted-foreground">ر.س</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(maintenance?.vehiclePlateNumber || maintenance?.plateNumber) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">رقم اللوحة</p>
                <span className="text-status-neutral-foreground font-mono">{maintenance.vehiclePlateNumber || maintenance.plateNumber}</span>
              </div>
            )}
            {(maintenance?.maintenanceType || maintenance?.type) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">نوع الصيانة</p>
                <Badge variant="outline">
                  {MAINTENANCE_TYPE_LABELS[maintenance.maintenanceType || maintenance.type] || maintenance.maintenanceType || maintenance.type}
                </Badge>
              </div>
            )}
            {(maintenance?.vendorName || maintenance?.workshop) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الورشة / المورد</p>
                <span className="text-status-neutral-foreground">{maintenance.vendorName || maintenance.workshop}</span>
              </div>
            )}
            {(maintenance?.scheduledDate || maintenance?.date) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">التاريخ المجدول</p>
                <span className="text-status-neutral-foreground">{formatDateAr(maintenance.scheduledDate || maintenance.date)}</span>
              </div>
            )}
            {(maintenance?.completionDate || maintenance?.completedAt) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الإنجاز</p>
                <span className="text-status-neutral-foreground">{formatDateAr(maintenance.completionDate || maintenance.completedAt)}</span>
              </div>
            )}
            {(maintenance?.mileage || maintenance?.mileageAtService) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الكيلومترات عند الصيانة</p>
                <span className="text-status-neutral-foreground">{maintenance.mileage || maintenance.mileageAtService} كم</span>
              </div>
            )}
            {maintenance?.nextServiceMileage && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الصيانة القادمة عند</p>
                <span className="text-status-neutral-foreground">{maintenance.nextServiceMileage} كم</span>
              </div>
            )}
          </div>

          {(maintenance?.description || maintenance?.notes) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الوصف</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{maintenance.description || maintenance.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Car className="h-4 w-4 text-muted-foreground" />
              المركبة
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {maintenance?.vehicleId ? (
              <div className="space-y-1">
                <p className="font-semibold font-mono">{maintenance.vehiclePlateNumber || maintenance.plateNumber || `#${maintenance.vehicleId}`}</p>
                {(maintenance.vehicleMake || maintenance.vehicleModel) && (
                  <p className="text-xs text-muted-foreground">
                    {[maintenance.vehicleMake, maintenance.vehicleModel].filter(Boolean).join(" ")}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">لا توجد مركبة مرتبطة</p>
            )}
          </CardContent>
        </Card>

        {maintenance?.driverId && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                السائق
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{maintenance.driverName || `سائق #${maintenance.driverId}`}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {id && <EntityComments entityType="maintenance" entityId={id} />}
      {id && <EntityTags entityType="maintenance" entityId={id} />}
    </div>
  );

  return (
    <>
    <DetailPageLayout
      title={maintenance?.ref ? `صيانة ${maintenance.ref}` : "تفاصيل الصيانة"}
      subtitle={
        maintenance?.maintenanceType || maintenance?.type
          ? MAINTENANCE_TYPE_LABELS[maintenance.maintenanceType || maintenance.type] || maintenance.maintenanceType || maintenance.type
          : undefined
      }
      backPath="/fleet/maintenance"
      refNumber={`MNT-${id}`}
      status={
        maintenance
          ? { label: STATUS_LABELS[maintenance.status] || maintenance.status || "-", tone: statusTone(maintenance.status) }
          : undefined
      }
      typeLabel={
        maintenance?.maintenanceType || maintenance?.type
          ? MAINTENANCE_TYPE_LABELS[maintenance.maintenanceType || maintenance.type] || maintenance.maintenanceType || maintenance.type
          : undefined
      }
      createdAt={maintenance?.createdAt}
      updatedAt={maintenance?.updatedAt}
      relatedEntities={relatedEntities}
      entityType="maintenance"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {maintenance && (
            <PrintButton
              entityType="maintenance_request"
              entityId={maintenance.id ?? id}
             />
          )}
          {maintenance && !["completed", "cancelled"].includes(maintenance.status) && (
            <>
              <GuardedButton
                perm="fleet:update"
                variant="outline"
                size="sm"
                className="text-status-success-foreground"
                onClick={handleComplete}
                disabled={actionBusy}
              >
                <CheckCircle2 className="h-4 w-4 ms-1" />
                إكمال
              </GuardedButton>
              <GuardedButton
                perm="fleet:update"
                variant="outline"
                size="sm"
                className="text-status-error-foreground"
                onClick={handleCancel}
                disabled={actionBusy}
              >
                <XCircle className="h-4 w-4 ms-1" />
                إلغاء
              </GuardedButton>
            </>
          )}
          <DetailActionButtons hook={editDelete} editPerm="fleet:update" deletePerm="fleet:delete" />
        </>
      }
    />
    <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إكمال الصيانة</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs">قراءة عداد المركبة (اختياري)</Label>
          <Input type="number" inputMode="numeric" value={completeOdometer} onChange={(e) => setCompleteOdometer(e.target.value)} />
        </div>
        <div className="space-y-2 pb-2">
          <Label className="text-xs">مَن يتحمّل التكلفة</Label>
          <Select value={completeCostBearer} onValueChange={setCompleteCostBearer}>
            <SelectTrigger data-testid="maint-complete-cost-bearer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="company">الشركة (مصروف صيانة المركبة)</SelectItem>
              <SelectItem value="driver">السائق (يُسترَدّ بخصم الراتب)</SelectItem>
              <SelectItem value="insurance">التأمين (ذمة مدينة مستردّة)</SelectItem>
              <SelectItem value="warranty">الضمان (ذمة مدينة مستردّة)</SelectItem>
              <SelectItem value="third_party">طرف ثالث (ذمة مدينة مستردّة)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">يصل المحاسب كافتراض عند ترحيل القيد — يبقى تعديله ممكنًا.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCompleteOpen(false)}>إلغاء</Button>
          <Button onClick={confirmComplete} disabled={actionBusy} rateLimitAware>تأكيد الإكمال</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إلغاء الصيانة</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs">سبب الإلغاء (اختياري)</Label>
          <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCancelOpen(false)}>تراجع</Button>
          <Button variant="destructive" onClick={confirmCancel} disabled={actionBusy} rateLimitAware>تأكيد الإلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
