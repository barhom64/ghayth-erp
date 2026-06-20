import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery } from "@/lib/api";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { FormGrid, FormTextField, FormTextareaField, FormSelectField } from "@workspace/ui-core";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, ClipboardCheck } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  planned: "مخطط",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  cancelled: "ملغى",
};

const TYPE_LABELS: Record<string, string> = {
  internal: "داخلي",
  external: "خارجي",
  compliance: "امتثال",
  financial: "مالي",
  operational: "تشغيلي",
};

const RISK_LABELS: Record<string, string> = {
  high: "مرتفع",
  medium: "متوسط",
  low: "منخفض",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "completed") return "success" as const;
  if (status === "cancelled") return "destructive" as const;
  if (status === "in_progress") return "info" as const;
  return "default" as const;
}

function riskTone(risk?: string | null) {
  if (!risk) return "default" as const;
  if (risk === "high") return "destructive" as const;
  if (risk === "medium") return "warning" as const;
  if (risk === "low") return "success" as const;
  return "default" as const;
}

const auditEditSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional().default(""),
  type: z.enum(["internal", "external", "compliance", "financial", "operational"]),
  status: z.enum(["planned", "in_progress", "completed", "cancelled"]),
  scheduledDate: z.string().optional().default(""),
  auditorName: z.string().optional().default(""),
});
type AuditEditForm = z.infer<typeof auditEditSchema>;

export default function AuditDetail() {
  const [, params] = useRoute("/governance/audits/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("audit", id ?? 0);
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["audit", String(id)],
    `/governance/audits/${id}`,
    !!id
  );

  const audit = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!audit) return out;
    if (audit.departmentId) {
      out.push({
        type: "department",
        id: audit.departmentId,
        label: audit.departmentName || `قسم #${audit.departmentId}`,
        sublabel: "القسم",
      });
    }
    return out;
  }, [audit]);


  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            بيانات التدقيق
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {audit?.type && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">النوع</p>
                <Badge variant="outline">
                  {TYPE_LABELS[audit.type] || audit.type}
                </Badge>
              </div>
            )}
            {audit?.riskLevel && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">مستوى المخاطر</p>
                <Badge variant={riskTone(audit.riskLevel) === "destructive" ? "destructive" : "outline"}>
                  {RISK_LABELS[audit.riskLevel] || audit.riskLevel}
                </Badge>
              </div>
            )}
            {audit?.auditor && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المدقق</p>
                <span className="text-status-neutral-foreground">{audit.auditor}</span>
              </div>
            )}
            {(audit?.department || audit?.departmentName) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">القسم</p>
                <span className="text-status-neutral-foreground">{audit.department || audit.departmentName}</span>
              </div>
            )}
            {audit?.startDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ البداية</p>
                <span className="text-status-neutral-foreground">{formatDateAr(audit.startDate)}</span>
              </div>
            )}
            {audit?.endDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ النهاية</p>
                <span className="text-status-neutral-foreground">{formatDateAr(audit.endDate)}</span>
              </div>
            )}
          </div>

          {audit?.scope && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">نطاق التدقيق</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{audit.scope}</p>
            </div>
          )}

          {(audit?.findings || audit?.findingsSummary) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملخص النتائج</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{audit.findings || audit.findingsSummary}</p>
            </div>
          )}

          {audit?.recommendations && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">التوصيات</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{audit.recommendations}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">معلومات إضافية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {audit?.createdAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الإنشاء</p>
                <span className="text-status-neutral-foreground">{formatDateAr(audit.createdAt)}</span>
              </div>
            )}
            {audit?.createdByName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">أنشئ بواسطة</p>
                <span className="text-status-neutral-foreground">{audit.createdByName}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="audit" entityId={id} />}
      {id && <EntityTags entityType="audit" entityId={id} />}
    </div>
  );

  return (
    <>
    <DetailPageLayout
      title={audit?.title || "تفاصيل التدقيق"}
      subtitle={audit?.type ? TYPE_LABELS[audit.type] || audit.type : undefined}
      backPath="/governance/audits"
      refNumber={`AUD-${id}`}
      status={
        audit
          ? { label: STATUS_LABELS[audit.status] || audit.status || "-", tone: statusTone(audit.status) }
          : undefined
      }
      typeLabel={audit?.type ? TYPE_LABELS[audit.type] || audit.type : undefined}
      createdAt={audit?.createdAt}
      updatedAt={audit?.updatedAt}
      createdByName={audit?.createdByName}
      relatedEntities={relatedEntities}
      entityType="audit"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      actions={
        <>
          {audit && (
            <PrintButton
              entityType="audit_record"
              entityId={id ?? 0}
             />
          )}
          <GuardedButton
            perm="governance:update"
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            disabled={!audit || ["completed", "cancelled"].includes(audit?.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
    {audit && id && (
      <EntityEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="تعديل التدقيق"
        schema={auditEditSchema}
        defaultValues={{
          title: audit.title ?? "",
          description: audit.description ?? "",
          type: (audit.type ?? "internal") as AuditEditForm["type"],
          status: (audit.status ?? "planned") as AuditEditForm["status"],
          scheduledDate: audit.scheduledDate ?? "",
          auditorName: audit.auditorName ?? "",
        }}
        endpoint={`/governance/audits/${id}`}
        invalidateKeys={[["audit", String(id)], ["gov-audits"]]}
        onSaved={() => refetch()}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="العنوان" required className="md:col-span-2" />
          <FormSelectField
            name="type"
            label="النوع"
            options={[
              { value: "internal", label: "داخلي" },
              { value: "external", label: "خارجي" },
              { value: "compliance", label: "امتثال" },
              { value: "financial", label: "مالي" },
              { value: "operational", label: "تشغيلي" },
            ]}
          />
          <FormSelectField
            name="status"
            label="الحالة"
            options={[
              { value: "planned", label: "مخطط" },
              { value: "in_progress", label: "قيد التنفيذ" },
              { value: "completed", label: "مكتمل" },
              { value: "cancelled", label: "ملغى" },
            ]}
          />
          <FormTextField name="scheduledDate" label="التاريخ المجدول" type="date" />
          <FormTextField name="auditorName" label="المدقق" />
          <FormTextareaField name="description" label="الوصف" className="md:col-span-2" />
        </FormGrid>
      </EntityEditDialog>
    )}
    </>
  );
}
