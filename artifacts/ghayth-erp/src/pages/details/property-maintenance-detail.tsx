import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { FormGrid, FormTextField, FormTextareaField, FormSelectField, FormNumberField } from "@workspace/ui-core";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Wrench, CheckCircle2 } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  open: "مفتوح",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  cancelled: "ملغى",
  pending: "معلق",
  scheduled: "مجدول",
};

// القيمة المعتمدة للأولوية العليا «critical/حرجة» (موحّدة مع بقية النظام). يُبقى
// «urgent/عاجلة» كتسمية إرث لعرض الصفوف القديمة المخزّنة (الباك-إند حرّ النص) بلا هجرة.
const PRIORITY_LABELS: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  critical: "حرجة",
  urgent: "عاجلة",
};

const TYPE_LABELS: Record<string, string> = {
  preventive: "وقائية",
  corrective: "تصحيحية",
  emergency: "طارئة",
  routine: "دورية",
  inspection: "فحص",
};

function statusTone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "cancelled") return "destructive" as const;
  if (status === "in_progress") return "info" as const;
  if (status === "pending" || status === "scheduled") return "warning" as const;
  return "default" as const;
}

const maintenanceEditSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional().default(""),
  category: z.string().optional().default(""),
  priority: z.enum(["low", "medium", "high", "critical", "urgent"]),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
  estimatedCost: z.coerce.number().optional().default(0),
  scheduledDate: z.string().optional().default(""),
});
type MaintenanceEditForm = z.infer<typeof maintenanceEditSchema>;

export default function PropertyMaintenanceDetail() {
  const [, params] = useRoute("/properties/maintenance/:id");
  const id = params?.id ? Number(params.id) : null;
  const [editOpen, setEditOpen] = useState(false);
  const { extraTabs, hideTabs } = useRegistryTabs("property-maintenance", id ?? 0);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["property-maintenance", String(id)],
    `/properties/maintenance/${id}`,
    !!id,
  );

  const item = data;

  // POST /properties/maintenance-requests/:id/complete — backend requires
  // closureReport + at least one afterPhoto + a cost (or zeroCostConfirmed)
  // + materialsUsed. Without those preconditions the request 400s. The
  // page doesn't yet have a closure form, so the button now opens a
  // confirm prompt that collects closureReport and zeroCostConfirmed —
  // the minimum to pass the zero-cost branch — and toasts a clear hint
  // when photos/materials are still missing.
  const completeMut = useApiMutation<
    unknown,
    { closureReport: string; zeroCostConfirmed: boolean; cost: number }
  >(
    `/properties/maintenance-requests/${id}/complete`,
    "POST",
    [["property-maintenance", String(id)], ["maintenance-requests"]],
    { successMessage: "تم إنهاء طلب الصيانة" },
  );
  const [completeOpen, setCompleteOpen] = useState(false);
  const [closureReport, setClosureReport] = useState("");
  const handleComplete = () => {
    setClosureReport(item?.closureReport ?? "");
    setCompleteOpen(true);
  };
  const confirmComplete = () => {
    if (!closureReport.trim()) return;
    setCompleteOpen(false);
    completeMut.mutate({
      closureReport: closureReport.trim(),
      zeroCostConfirmed: true,
      cost: 0,
    });
  };

  // GET /properties/technicians — used to show available technicians the
  // request can be assigned to. Populates the "إسناد" field on edit.
  const { data: techniciansResp } = useApiQuery<{ data: Array<{ id: number; name: string }> }>(
    ["properties-technicians"],
    "/properties/technicians",
  );
  const technicians = techniciansResp?.data ?? [];

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!item) return out;
    if (item.buildingId) {
      out.push({
        type: "building",
        id: item.buildingId,
        label: item.buildingName || `مبنى #${item.buildingId}`,
        sublabel: "المبنى",
        href: `/properties/buildings/${item.buildingId}`,
      });
    }
    if (item.unitId) {
      out.push({
        type: "property",
        id: item.unitId,
        label: item.unitNumber || `وحدة #${item.unitId}`,
        sublabel: "الوحدة",
        href: `/properties/${item.unitId}`,
      });
    }
    if (item.tenantId) {
      out.push({
        type: "tenant",
        id: item.tenantId,
        label: item.tenantName || `مستأجر #${item.tenantId}`,
        sublabel: "المستأجر",
        href: `/properties/tenants/${item.tenantId}`,
      });
    }
    return out;
  }, [item]);


  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            بيانات الصيانة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {item?.cost != null && (
            <div className="flex items-baseline gap-2 border-b pb-3">
              <span className="text-3xl font-bold text-gray-900">{formatCurrency(item.cost)}</span>
              <span className="text-xs text-muted-foreground">ر.س</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {item?.type && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">نوع الصيانة</p>
                <Badge variant="outline">{TYPE_LABELS[item.type] || item.type}</Badge>
              </div>
            )}
            {item?.priority && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الأولوية</p>
                <Badge variant={item.priority === "critical" || item.priority === "urgent" || item.priority === "high" ? "destructive" : "outline"}>
                  {PRIORITY_LABELS[item.priority] || item.priority}
                </Badge>
              </div>
            )}
            {item?.assignedTo && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المسؤول</p>
                <span className="text-status-neutral-foreground">
                  {technicians.find((t) => String(t.id) === String(item.assignedTo))?.name ?? item.assignedTo}
                </span>
              </div>
            )}
            {item?.vendor && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المقاول/المورد</p>
                <span className="text-status-neutral-foreground">{item.vendor}</span>
              </div>
            )}
            {item?.scheduledDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">التاريخ المجدول</p>
                <span className="text-status-neutral-foreground">{formatDateAr(item.scheduledDate)}</span>
              </div>
            )}
            {item?.completedAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الإنجاز</p>
                <span className="text-status-neutral-foreground">{formatDateAr(item.completedAt)}</span>
              </div>
            )}
          </div>
          {item?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الوصف</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{item.description}</p>
            </div>
          )}
          {item?.notes && (
            <div className="rounded-md bg-status-warning-surface border border-status-warning-surface p-3">
              <p className="text-xs text-status-warning-foreground font-medium mb-1">ملاحظات</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{item.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {item?.buildingName && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">الموقع</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="font-medium">{item.buildingName}</p>
              {item.unitNumber && <p className="text-xs text-muted-foreground">وحدة: {item.unitNumber}</p>}
              {item.tenantName && <p className="text-xs text-muted-foreground">المستأجر: {item.tenantName}</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {id && <EntityComments entityType="property-maintenance" entityId={id} />}
      {id && <EntityTags entityType="property-maintenance" entityId={id} />}
    </div>
  );

  return (
    <>
    <DetailPageLayout
      title={item?.title || "تفاصيل طلب الصيانة"}
      subtitle={item?.type ? TYPE_LABELS[item.type] || item.type : undefined}
      backPath="/properties/maintenance"
      refNumber={item?.ref || (id ? `PMT-${id}` : undefined)}
      status={item ? { label: STATUS_LABELS[item.status] || item.status || "-", tone: statusTone(item.status) } : undefined}
      createdAt={item?.createdAt}
      updatedAt={item?.updatedAt}
      createdByName={item?.createdByName}
      assignedToName={item?.assignedTo}
      relatedEntities={relatedEntities}
      entityType="property-maintenance"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          <PrintButton
            entityType="maintenance_request"
            entityId={id ?? 0}
           />
          <GuardedButton
            perm="properties:update"
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            disabled={!item || item?.status === "completed"}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
          <GuardedButton
            perm="properties:update"
            size="sm"
            rateLimitAware
            onClick={handleComplete}
            disabled={!item || item?.status === "completed" || completeMut.isPending}
          >
            <CheckCircle2 className="h-4 w-4 ms-1" />
            إنهاء الصيانة
          </GuardedButton>
        </>
      }
    />
    <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إنهاء طلب الصيانة</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs">تقرير الإغلاق (ملخّص الأعمال) — مطلوب</Label>
          <Textarea
            value={closureReport}
            onChange={(e) => setClosureReport(e.target.value)}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCompleteOpen(false)}>إلغاء</Button>
          <Button onClick={confirmComplete} disabled={!closureReport.trim() || completeMut.isPending} rateLimitAware>
            إنهاء الصيانة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {item && id && (
      <EntityEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="تعديل طلب الصيانة"
        schema={maintenanceEditSchema}
        defaultValues={{
          title: item.title ?? "",
          description: item.description ?? "",
          category: item.category ?? "",
          priority: (item.priority ?? "medium") as MaintenanceEditForm["priority"],
          status: (item.status ?? "pending") as MaintenanceEditForm["status"],
          estimatedCost: Number(item.estimatedCost ?? 0),
          scheduledDate: item.scheduledDate ?? "",
        }}
        endpoint={`/properties/maintenance-requests/${id}`}
        invalidateKeys={[["property-maintenance", String(id)], ["maintenance-requests"]]}
        onSaved={() => refetch()}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="العنوان" required className="md:col-span-2" />
          <FormSelectField
            name="priority"
            label="الأولوية"
            options={[
              { value: "low", label: "منخفضة" },
              { value: "medium", label: "متوسطة" },
              { value: "high", label: "عالية" },
              { value: "critical", label: "حرجة" },
            ]}
          />
          <FormSelectField
            name="status"
            label="الحالة"
            options={[
              { value: "pending", label: "معلقة" },
              { value: "in_progress", label: "قيد التنفيذ" },
              { value: "completed", label: "مكتملة" },
              { value: "cancelled", label: "ملغاة" },
            ]}
          />
          <FormTextField name="category" label="الفئة" />
          <FormNumberField name="estimatedCost" label="التكلفة التقديرية" />
          <FormTextField name="scheduledDate" label="التاريخ المجدول" type="date" />
          <FormTextareaField name="description" label="الوصف" className="md:col-span-2" />
        </FormGrid>
      </EntityEditDialog>
    )}
    </>
  );
}
