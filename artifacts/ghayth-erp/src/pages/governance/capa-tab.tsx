import { useState } from "react";
import { z } from "zod";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PageStatusBadge } from "@workspace/ui-core";
import { DataTable } from "@workspace/ui-core";
import { CheckCircle2, Plus, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { formatDateAr } from "@/lib/formatters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  FormShell,
  FormTextField,
  FormTextareaField,
  FormDateField,
  FormGrid,
} from "@workspace/ui-core";

// New: validation now lives in zod (was: bare `if (!newForm.finding) return`).
// status enum is closed — typo in the option list fails typecheck.
const capaSchema = z.object({
  finding: z.string().trim().min(1, "الملاحظة مطلوبة"),
  rootCause: z.string().trim(),
  correctiveAction: z.string().trim(),
  preventiveAction: z.string().trim(),
  responsiblePerson: z.string().trim(),
  dueDate: z.string(),
  status: z.enum(["open", "in_progress", "closed", "overdue"]),
});
type CapaForm = z.infer<typeof capaSchema>;
const defaultCapaForm: CapaForm = {
  finding: "",
  rootCause: "",
  correctiveAction: "",
  preventiveAction: "",
  responsiblePerson: "",
  dueDate: "",
  status: "open",
};

export function CAPATab() {
  const { data: capaResp, isLoading, isError, error, refetch } = useApiQuery<any>(["gov-capa"], "/governance/capa");
  const items = asList(capaResp);
  const [filters, setFilters] = useFilters();
  const [previewItem, setPreviewItem] = useState<any>(null);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const { toast } = useToast();
  const qc = useQueryClient();

  const filteredItems = applyFilters(items, filters, { searchFields: ["finding", "rootCause", "responsiblePerson"], statusField: "status", dateField: "dueDate" });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/governance/capa",
    queryKeys: [["gov-capa"], ["gov-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "finding", label: "الملاحظة" },
    { key: "responsiblePerson", label: "المسؤول" },
    { key: "dueDate", label: "تاريخ الاستحقاق", type: "date" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "open", label: "مفتوح" }, { value: "in_progress", label: "جاري" }, { value: "closed", label: "مغلق" }, { value: "overdue", label: "متأخر" }] },
  ];

  const [showNew, setShowNew] = useState(false);
  const handleCreate = async (values: CapaForm) => {
    try {
      await apiFetch("/governance/capa", {
        method: "POST",
        body: JSON.stringify(values),
      });
      toast({ title: "تم إنشاء الإجراء التصحيحي" });
      setShowNew(false);
      qc.invalidateQueries({ queryKey: ["gov-capa"] });
    } catch { toast({ variant: "destructive", title: "خطأ في الحفظ" }); }
  };

  const previewFields: PreviewField[] = [
    { label: "الملاحظة", key: "finding" },
    { label: "السبب الجذري", key: "rootCause" },
    { label: "الإجراء التصحيحي", key: "correctiveAction" },
    { label: "الإجراء الوقائي", key: "preventiveAction" },
    { label: "المسؤول", key: "responsiblePerson" },
    { label: "تاريخ الاستحقاق", key: "dueDate", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters config={{ searchPlaceholder: "بحث بالإجراءات التصحيحية...", statuses: [{ value: "open", label: "مفتوح" }, { value: "in_progress", label: "جاري" }, { value: "closed", label: "مغلق" }, { value: "overdue", label: "متأخر" }], showDateRange: true }} values={filters} onChange={setFilters} resultCount={filteredItems.length} />
        </div>
        {canWrite && <GuardedButton perm="governance:create" size="sm" onClick={() => setShowNew(!showNew)}><Plus className="h-4 w-4 me-1" />إجراء تصحيحي جديد</GuardedButton>}
      </div>
      {showNew && (
        <Card className="border-dashed">
          <CardContent className="p-4">
            <FormShell
              schema={capaSchema}
              defaultValues={defaultCapaForm}
              submitLabel="حفظ"
              secondaryActions={
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowNew(false)}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values, ctx) => {
                await handleCreate(values);
                ctx.reset();
              }}
            >
              <FormGrid cols={2}>
                <FormTextField name="finding" label="الملاحظة" required className="col-span-2" />
                <FormTextField name="responsiblePerson" label="المسؤول" />
                <FormDateField name="dueDate" label="تاريخ الاستحقاق" />
                <FormTextareaField name="rootCause" label="السبب الجذري" rows={2} />
                <FormTextareaField name="correctiveAction" label="الإجراء التصحيحي" rows={2} />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>الإجراءات التصحيحية والوقائية</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "finding", header: "الملاحظة", sortable: true, searchable: true, render: (item) => <span className="font-medium max-w-[200px] truncate inline-block">{item.finding}</span> },
              { key: "responsiblePerson", header: "المسؤول", sortable: true, searchable: true, render: (item) => <span>{item.responsiblePerson || "-"}</span> },
              { key: "dueDate", header: "الاستحقاق", sortable: true, render: (item) => item.dueDate ? formatDateAr(item.dueDate) : "-" },
              { key: "status", header: "الحالة", sortable: true, render: (item) => <PageStatusBadge status={item.status} /> },
              {
                key: "actions", header: "إجراءات",
                render: (item) => (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewItem(item)}><Eye className="h-4 w-4" /></Button>
                    <RowActions onEdit={() => startEdit(item.id, { finding: item.finding, responsiblePerson: item.responsiblePerson || "", dueDate: item.dueDate || "", status: item.status || "open" })} onDelete={() => startDelete(item.id)} deletePerm="governance:delete" />
                  </div>
                ),
              },
            ]}
            data={filteredItems}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد إجراءات تصحيحية"
            emptyIcon={<CheckCircle2 className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            rowClassName={(item) => cn(editingId === item.id && "bg-muted/50", deletingId === item.id && "bg-destructive/5")}
            renderRowExtras={(item) => {
              if (editingId === item.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(item.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === item.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(item.id)} onCancel={cancelDelete} isPending={isPending} itemName={item.finding} entityType="capa" entityId={item.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="تفاصيل الإجراء التصحيحي" data={previewItem} fields={previewFields} />
    </div>
  );
}
