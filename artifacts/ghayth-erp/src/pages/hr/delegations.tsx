import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton, usePermission } from "@/components/shared/permission-gate";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  PageStatusBadge,
  FormShell,
  FormGrid,
  FormTextField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatDateAr } from "@/lib/formatters";
import { Plus, X } from "lucide-react";

/**
 * HR-010 — Delegations admin page. Lists active/historical delegations from
 * GET /hr/delegations and creates new ones via POST. Server has no
 * PATCH/DELETE for delegations yet, so this page is list + create only.
 */
const delegationSchema = z.object({
  delegateId: z.string().min(1, "يرجى اختيار المُفوَّض إليه"),
  scope: z.string(),
  reason: z.string().min(1, "السبب مطلوب"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
type DelegationForm = z.infer<typeof delegationSchema>;

const DEFAULT_FORM: DelegationForm = {
  delegateId: "",
  scope: "عام",
  reason: "",
  startDate: "",
  endDate: "",
};

export default function DelegationsPage() {
  const [showNew, setShowNew] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const canApprove = usePermission("hr.organization:approve");

  const { data, isLoading, isError, refetch } = useApiQuery<any>(["hr-delegations"], "/hr/delegations");
  const delegations = asList(data?.data || data);

  const { data: empsResp } = useApiQuery<any>(["employees-list"], "/employees?limit=500");
  const employees = asList(empsResp?.data || empsResp);

  const createMut = useApiMutation<any, { delegateId: number; scope?: string; reason: string; startDate?: string; endDate?: string }>(
    "/hr/delegations",
    "POST",
    [["hr-delegations"]],
    {
      successMessage: "تم إنشاء التفويض",
      onSuccess: () => {
        setShowNew(false);
        setFormKey((k) => k + 1);
        refetch();
      },
    },
  );

  const columns: DataTableColumn<any>[] = [
    { key: "delegatorName", header: "المُفوِّض", render: (r) => r.delegatorName || `#${r.delegatorId}` },
    { key: "delegateName", header: "المُفوَّض إليه", render: (r) => r.delegateName || `#${r.delegateId}` },
    { key: "scope", header: "النطاق", render: (r) => r.scope || "—" },
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "startDate", header: "من", render: (r) => (r.startDate ? formatDateAr(r.startDate) : "—") },
    { key: "endDate", header: "إلى", render: (r) => (r.endDate ? formatDateAr(r.endDate) : "—") },
    { key: "reason", header: "السبب", render: (r) => <span className="max-w-[260px] truncate inline-block">{r.reason || "—"}</span> },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="التفويضات"
      subtitle="تفويض الصلاحيات بين الموظفين لفترة محدّدة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "التفويضات" }]}
      actions={
        !showNew ? (
          <GuardedButton perm="hr.organization:approve" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 ml-1" /> تفويض جديد
          </GuardedButton>
        ) : (
          <Button variant="outline" onClick={() => setShowNew(false)}><X className="h-4 w-4 ml-1" /> إلغاء</Button>
        )
      }
    >
      {showNew && (
        <Card className="mb-4 border-status-info-surface">
          <CardHeader className="pb-3"><CardTitle className="text-base">تفويض جديد</CardTitle></CardHeader>
          <CardContent>
            <FormShell
              key={formKey}
              schema={delegationSchema}
              defaultValues={DEFAULT_FORM}
              submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ التفويض"}
              disabled={!canApprove}
              onSubmit={async (values) => {
                await createMut.mutateAsync({
                  delegateId: Number(values.delegateId),
                  scope: values.scope.trim() || undefined,
                  reason: values.reason.trim(),
                  startDate: values.startDate || undefined,
                  endDate: values.endDate || undefined,
                });
              }}
            >
              <FormGrid cols={2}>
                <FormSelectField
                  name="delegateId"
                  label="المُفوَّض إليه"
                  required
                  options={employees.map((e: any) => ({ value: String(e.id), label: e.name || `#${e.id}` }))}
                  placeholder="اختر موظفًا"
                />
                <FormTextField name="scope" label="النطاق" placeholder="عام / مالية / موارد بشرية…" />
                <FormDateField name="startDate" label="تاريخ البداية" />
                <FormDateField name="endDate" label="تاريخ النهاية" />
                <FormTextField name="reason" label="السبب" required placeholder="سبب التفويض" className="md:col-span-2" />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={delegations}
        emptyMessage="لا توجد تفويضات"
        noToolbar
      />
    </PageShell>
  );
}
