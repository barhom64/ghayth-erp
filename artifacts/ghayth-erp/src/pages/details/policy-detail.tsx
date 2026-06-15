import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import {
  DetailPageLayout,
  type RelatedEntity,
  type ExtraTab,
  EntityComments,
} from "@workspace/entity-kit";
import {
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormSelectField,
  FormDateField,
  FormShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, FileText, ListChecks, Link2, Plus, X } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  active: "ساري",
  archived: "مؤرشف",
  under_review: "قيد المراجعة",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "active") return "success" as const;
  if (status === "archived") return "destructive" as const;
  if (status === "under_review") return "info" as const;
  if (status === "draft") return "warning" as const;
  return "default" as const;
}

const policyEditSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional().default(""),
  category: z.string().optional().default(""),
  status: z.enum(["draft", "active", "archived", "under_review"]),
  effectiveDate: z.string().optional().default(""),
  expiryDate: z.string().optional().default(""),
});
type PolicyEditForm = z.infer<typeof policyEditSchema>;

const complianceActionSchema = z.object({
  action: z.string().min(1, "وصف الإجراء مطلوب"),
  status: z.enum(["open", "in_progress", "done", "overdue"]),
  responsiblePerson: z.string(),
  dueDate: z.string(),
  notes: z.string(),
});
type ComplianceActionForm = z.infer<typeof complianceActionSchema>;
const defaultComplianceActionForm: ComplianceActionForm = {
  action: "", status: "open", responsiblePerson: "", dueDate: "", notes: "",
};

function AddComplianceActionForm({ policyId, onSuccess }: { policyId: number; onSuccess: () => void }) {
  const saveMut = useApiMutation<unknown, ComplianceActionForm>(
    `/governance/policies/${policyId}/compliance-actions`,
    "POST",
    [["policy-compliance-actions", String(policyId)]],
    { successMessage: "تمت إضافة الإجراء", onSuccess },
  );
  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <h4 className="font-semibold mb-3 text-sm">إجراء امتثال جديد</h4>
        <FormShell
          schema={complianceActionSchema}
          defaultValues={defaultComplianceActionForm}
          submitLabel="حفظ الإجراء"
          onSubmit={async (values, ctx) => {
            await saveMut.mutateAsync(values);
            ctx.reset();
          }}
        >
          <FormGrid cols={2}>
            <FormTextField name="action" label="الإجراء" required className="md:col-span-2" />
            <FormSelectField
              name="status"
              label="الحالة"
              options={[
                { value: "open", label: "مفتوح" },
                { value: "in_progress", label: "قيد التنفيذ" },
                { value: "done", label: "منجز" },
                { value: "overdue", label: "متأخر" },
              ]}
            />
            <FormDateField name="dueDate" label="الموعد المستهدف" />
            <FormTextField name="responsiblePerson" label="المسؤول" />
            <FormTextareaField name="notes" label="ملاحظات" className="md:col-span-2" />
          </FormGrid>
        </FormShell>
      </CardContent>
    </Card>
  );
}

export default function PolicyDetail() {
  const [, params] = useRoute("/governance/policies/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs: registryExtraTabs, hideTabs } = useRegistryTabs("policy", id ?? 0);
  const [editOpen, setEditOpen] = useState(false);
  const [showAddAction, setShowAddAction] = useState(false);

  // Sub-resource fetches for the new Compliance Actions + Module Links tabs.
  const { data: actionsResp, refetch: refetchActions } = useApiQuery<{ data: any[] }>(
    ["policy-compliance-actions", String(id)],
    `/governance/policies/${id}/compliance-actions`,
    !!id,
  );
  const { data: linksResp } = useApiQuery<{ data: any[] }>(
    ["policy-module-links", String(id)],
    `/governance/policies/${id}/module-links`,
    !!id,
  );
  const complianceActions = asList(actionsResp?.data ?? actionsResp);
  const moduleLinks = asList(linksResp?.data ?? linksResp);

  const ACTION_STATUS_LABELS: Record<string, string> = {
    open: "مفتوح",
    in_progress: "قيد التنفيذ",
    done: "منجز",
    overdue: "متأخر",
  };

  const handleActionAdded = () => {
    setShowAddAction(false);
    refetchActions();
  };

  const customTabs: ExtraTab[] = [
    {
      key: "compliance-actions",
      label: "إجراءات الامتثال",
      icon: ListChecks,
      badge: complianceActions.length || undefined,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">إجراءات الامتثال للسياسة</h3>
            <GuardedButton perm="governance:create" size="sm" onClick={() => setShowAddAction(!showAddAction)}>
              {showAddAction ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إجراء جديد</>}
            </GuardedButton>
          </div>
          {showAddAction && id && <AddComplianceActionForm policyId={id} onSuccess={handleActionAdded} />}
          {complianceActions.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا توجد إجراءات امتثال مسجلة</p>
              </CardContent>
            </Card>
          ) : (
            <DataTable
              columns={[
                { key: "title", header: "الإجراء", render: (a) => <span className="text-sm">{a.title || a.action}</span> },
                { key: "status", header: "الحالة", sortable: true, render: (a) => (
                  <Badge variant="outline">{ACTION_STATUS_LABELS[a.status] || a.status || "—"}</Badge>
                )},
                { key: "owner", header: "المسؤول", render: (a) => a.owner || a.responsiblePerson || "—" },
                { key: "dueDate", header: "الموعد", render: (a) => a.dueDate ? formatDateAr(a.dueDate) : "—" },
                { key: "createdAt", header: "التاريخ", render: (a) => formatDateAr(a.createdAt) },
              ] as DataTableColumn<any>[]}
              data={complianceActions}
              noToolbar
              pageSize={10}
            />
          )}
        </div>
      ),
    },
    {
      key: "module-links",
      label: "ارتباطات الوحدات",
      icon: Link2,
      badge: moduleLinks.length || undefined,
      content: (
        <div className="space-y-4">
          <h3 className="font-semibold text-sm">الوحدات المرتبطة بالسياسة</h3>
          {moduleLinks.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Link2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا توجد ارتباطات بوحدات النظام</p>
                <p className="text-xs mt-1">
                  يتم إنشاء الروابط تلقائياً عند تطبيق السياسة على وحدة معينة.
                </p>
              </CardContent>
            </Card>
          ) : (
            <DataTable
              columns={[
                { key: "module", header: "الوحدة", render: (l) => <span className="font-mono text-xs">{l.module || l.moduleKey || "—"}</span> },
                { key: "scope", header: "النطاق", render: (l) => l.scope || "—" },
                { key: "createdAt", header: "التاريخ", render: (l) => l.createdAt ? formatDateAr(l.createdAt) : "—" },
              ] as DataTableColumn<any>[]}
              data={moduleLinks}
              noToolbar
              pageSize={10}
            />
          )}
        </div>
      ),
    },
  ];

  const extraTabs = [...customTabs, ...registryExtraTabs];

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["policy", String(id)],
    `/governance/policies/${id}`,
    !!id
  );

  const policy = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!policy) return out;
    if (policy.departmentId) {
      out.push({
        type: "department",
        id: policy.departmentId,
        label: policy.departmentName || `قسم #${policy.departmentId}`,
        sublabel: "القسم",
      });
    }
    if (policy.ownerId) {
      out.push({
        type: "employee",
        id: policy.ownerId,
        label: policy.ownerName || `موظف #${policy.ownerId}`,
        sublabel: "المسؤول",
        href: `/hr/employees/${policy.ownerId}`,
      });
    }
    return out;
  }, [policy]);


  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            بيانات السياسة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {policy?.category && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">التصنيف</p>
                <Badge variant="outline">{policy.category}</Badge>
              </div>
            )}
            {policy?.version && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الإصدار</p>
                <Badge variant="secondary">{policy.version}</Badge>
              </div>
            )}
            {policy?.effectiveDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ السريان</p>
                <span className="text-status-neutral-foreground">{formatDateAr(policy.effectiveDate)}</span>
              </div>
            )}
            {policy?.reviewDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ المراجعة</p>
                <span className="text-status-neutral-foreground">{formatDateAr(policy.reviewDate)}</span>
              </div>
            )}
            {(policy?.owner || policy?.ownerName) && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">المسؤول</p>
                <span className="text-status-neutral-foreground">{policy.owner || policy.ownerName}</span>
              </div>
            )}
          </div>

          {policy?.summary && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الملخص</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{policy.summary}</p>
            </div>
          )}

          {(policy?.content || policy?.fullContent) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">المحتوى الكامل</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">
                {policy.content || policy.fullContent}
              </p>
            </div>
          )}

          {policy?.complianceRequirements && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">متطلبات الامتثال</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{policy.complianceRequirements}</p>
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
            {policy?.createdAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الإنشاء</p>
                <span className="text-status-neutral-foreground">{formatDateAr(policy.createdAt)}</span>
              </div>
            )}
            {policy?.createdByName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">أنشئ بواسطة</p>
                <span className="text-status-neutral-foreground">{policy.createdByName}</span>
              </div>
            )}
            {policy?.updatedAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">آخر تحديث</p>
                <span className="text-status-neutral-foreground">{formatDateAr(policy.updatedAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="policy" entityId={id} />}
      {id && <EntityTags entityType="policy" entityId={id} />}
    </div>
  );

  return (
    <>
    <DetailPageLayout
      title={policy?.title || "تفاصيل السياسة"}
      subtitle={policy?.category}
      backPath="/governance/policies"
      refNumber={`POL-${id}`}
      status={
        policy
          ? { label: STATUS_LABELS[policy.status] || policy.status || "-", tone: statusTone(policy.status) }
          : undefined
      }
      typeLabel={policy?.category}
      createdAt={policy?.createdAt}
      updatedAt={policy?.updatedAt}
      createdByName={policy?.createdByName}
      assignedToName={policy?.owner || policy?.ownerName}
      relatedEntities={relatedEntities}
      entityType="policy"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {policy && (
            <PrintButton
              entityType="policy"
              entityId={id ?? 0}
             />
          )}
          <GuardedButton
            perm="governance:update"
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            disabled={!policy || policy?.status === "archived"}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
    {policy && id && (
      <EntityEditDialog<PolicyEditForm>
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="تعديل السياسة"
        schema={policyEditSchema}
        defaultValues={{
          title: policy.title ?? "",
          description: policy.description ?? "",
          category: policy.category ?? "",
          status: (policy.status ?? "draft") as PolicyEditForm["status"],
          effectiveDate: policy.effectiveDate ?? "",
          expiryDate: policy.expiryDate ?? "",
        }}
        endpoint={`/governance/policies/${id}`}
        invalidateKeys={[["policy", String(id)], ["gov-policies"]]}
        onSaved={() => refetch()}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="العنوان" required className="md:col-span-2" />
          <FormTextField name="category" label="الفئة" />
          <FormSelectField
            name="status"
            label="الحالة"
            options={[
              { value: "draft", label: "مسودة" },
              { value: "active", label: "ساري" },
              { value: "under_review", label: "قيد المراجعة" },
              { value: "archived", label: "مؤرشف" },
            ]}
          />
          <FormTextField name="effectiveDate" label="تاريخ السريان" type="date" />
          <FormTextField name="expiryDate" label="تاريخ الانتهاء" type="date" />
          <FormTextareaField name="description" label="الوصف" className="md:col-span-2" />
        </FormGrid>
      </EntityEditDialog>
    )}
    </>
  );
}
