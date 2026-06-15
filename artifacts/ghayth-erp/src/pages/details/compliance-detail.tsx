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
import { ApprovalActions } from "@workspace/workflow-kit";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Edit, ShieldCheck } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  compliant: "ملتزم",
  non_compliant: "غير ملتزم",
  partial: "جزئي",
  pending_review: "قيد المراجعة",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "compliant") return "success" as const;
  if (status === "non_compliant") return "destructive" as const;
  if (status === "partial") return "warning" as const;
  if (status === "pending_review") return "info" as const;
  return "default" as const;
}

const complianceEditSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional().default(""),
  regulation: z.string().optional().default(""),
  status: z.enum(["compliant", "non_compliant", "partial", "pending_review"]),
  assessmentDate: z.string().optional().default(""),
});
type ComplianceEditForm = z.infer<typeof complianceEditSchema>;

export default function ComplianceDetail() {
  const [, params] = useRoute("/governance/compliance/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("compliance", id ?? 0);
  const [editOpen, setEditOpen] = useState(false);

  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["compliance", String(id)],
    `/governance/compliance/${id}`,
    !!id
  );

  const compliance = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!compliance) return out;
    if (compliance.departmentId) {
      out.push({
        type: "department",
        id: compliance.departmentId,
        label: compliance.departmentName || `قسم #${compliance.departmentId}`,
        sublabel: "القسم",
      });
    }
    if (compliance.responsiblePartyId) {
      out.push({
        type: "employee",
        id: compliance.responsiblePartyId,
        label: compliance.responsiblePartyName || `موظف #${compliance.responsiblePartyId}`,
        sublabel: "المسؤول",
        href: `/hr/employees/${compliance.responsiblePartyId}`,
      });
    }
    return out;
  }, [compliance]);


  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            بيانات الامتثال
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {compliance?.framework && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الإطار</p>
                <Badge variant="outline">{compliance.framework}</Badge>
              </div>
            )}
            {compliance?.assessmentDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ التقييم</p>
                <span className="text-status-neutral-foreground">{formatDateAr(compliance.assessmentDate)}</span>
              </div>
            )}
            {(compliance?.nextReview || compliance?.nextReviewDate) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ المراجعة التالية</p>
                <span className="text-status-neutral-foreground">
                  {formatDateAr(compliance.nextReview || compliance.nextReviewDate)}
                </span>
              </div>
            )}
            {(compliance?.responsibleParty || compliance?.responsiblePartyName) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المسؤول</p>
                <span className="text-status-neutral-foreground">
                  {compliance.responsibleParty || compliance.responsiblePartyName}
                </span>
              </div>
            )}
            {(compliance?.requirement || compliance?.title) && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">المتطلب</p>
                <span className="text-status-neutral-foreground">
                  {compliance.requirement || compliance.title}
                </span>
              </div>
            )}
          </div>

          {compliance?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الوصف</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{compliance.description}</p>
            </div>
          )}

          {compliance?.evidence && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الأدلة</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{compliance.evidence}</p>
            </div>
          )}

          {compliance?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{compliance.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Approval actions */}
        {id && compliance && ["pending", "pending_review", "returned"].includes(compliance.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="compliance"
                entityId={id}
                currentStatus={compliance.status}
                approveEndpoint={`/governance/compliance/${id}`}
                rejectEndpoint={`/governance/compliance/${id}`}
                returnEndpoint={`/governance/compliance/${id}`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ status: "compliant", notes: notes || undefined })}
                rejectBody={(notes) => ({ status: "non_compliant", notes })}
                returnBody={(notes) => ({ status: "returned", notes })}
                pendingStatuses={["pending", "pending_review", "returned"]}
                invalidateKeys={[["compliance"]]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث الامتثال" });
                }}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">معلومات إضافية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {compliance?.createdAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الإنشاء</p>
                <span className="text-status-neutral-foreground">{formatDateAr(compliance.createdAt)}</span>
              </div>
            )}
            {compliance?.createdByName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">أنشئ بواسطة</p>
                <span className="text-status-neutral-foreground">{compliance.createdByName}</span>
              </div>
            )}
            {compliance?.updatedAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">آخر تحديث</p>
                <span className="text-status-neutral-foreground">{formatDateAr(compliance.updatedAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {id && <ApprovalTimeline entityType="compliance" entityId={id} />}

      {id && <EntityComments entityType="compliance" entityId={id} />}
      {id && <EntityTags entityType="compliance" entityId={id} />}
    </div>
  );

  return (
    <>
    <DetailPageLayout
      title={compliance?.requirement || compliance?.title || "تفاصيل الامتثال"}
      subtitle={compliance?.framework}
      backPath="/governance/compliance"
      refNumber={`CMP-${id}`}
      status={
        compliance
          ? {
              label: STATUS_LABELS[compliance.status] || compliance.status || "-",
              tone: statusTone(compliance.status),
            }
          : undefined
      }
      typeLabel={compliance?.framework}
      createdAt={compliance?.createdAt}
      updatedAt={compliance?.updatedAt}
      createdByName={compliance?.createdByName}
      assignedToName={compliance?.responsibleParty || compliance?.responsiblePartyName}
      relatedEntities={relatedEntities}
      entityType="compliance"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      actions={
        <>
          {compliance && (
            <PrintButton
              entityType="compliance"
              entityId={id ?? 0}
             />
          )}
          <GuardedButton
            perm="governance:update"
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            disabled={!compliance}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
    {compliance && id && (
      <EntityEditDialog<ComplianceEditForm>
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="تعديل سجل الامتثال"
        schema={complianceEditSchema}
        defaultValues={{
          title: compliance.title ?? "",
          description: compliance.description ?? "",
          regulation: compliance.regulation ?? "",
          status: (compliance.status ?? "pending_review") as ComplianceEditForm["status"],
          assessmentDate: compliance.assessmentDate ?? "",
        }}
        endpoint={`/governance/compliance/${id}`}
        invalidateKeys={[["compliance", String(id)], ["gov-compliance"]]}
        onSaved={() => refetch()}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="العنوان" required className="md:col-span-2" />
          <FormTextField name="regulation" label="اللائحة / المرجع" />
          <FormSelectField
            name="status"
            label="الحالة"
            options={[
              { value: "compliant", label: "ملتزم" },
              { value: "partial", label: "جزئي" },
              { value: "non_compliant", label: "غير ملتزم" },
              { value: "pending_review", label: "قيد المراجعة" },
            ]}
          />
          <FormTextField name="assessmentDate" label="تاريخ التقييم" type="date" />
          <FormTextareaField name="description" label="الوصف" className="md:col-span-2" />
        </FormGrid>
      </EntityEditDialog>
    )}
    </>
  );
}
