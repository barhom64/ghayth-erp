import { useState } from "react";
import { z } from "zod";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PageStatusBadge } from "@workspace/ui-core";
import { DataTable } from "@workspace/ui-core";
import { Activity, Plus, Eye } from "lucide-react";
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
  FormSelectField,
  FormGrid,
} from "@workspace/ui-core";

const complianceActionSchema = z.object({
  title: z.string().trim().min(1, "العنوان مطلوب"),
  regulation: z.string().trim(),
  owner: z.string().trim(),
  dueDate: z.string(),
  description: z.string().trim(),
  status: z.enum(["open", "in_progress", "done", "overdue"]),
});
type ComplianceActionForm = z.infer<typeof complianceActionSchema>;
const defaultComplianceAction: ComplianceActionForm = {
  title: "", regulation: "", owner: "", dueDate: "", description: "", status: "open",
};
const STATUS_OPTIONS = [
  { value: "open", label: "مفتوح" },
  { value: "in_progress", label: "جاري" },
  { value: "done", label: "منجز" },
  { value: "overdue", label: "متأخر" },
];

export function ComplianceActionsTab() {
  const { data: actionsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["gov-compliance-actions"], "/governance/compliance-actions");
  const items = asList(actionsResp);
  const [filters, setFilters] = useFilters();
  const [previewItem, setPreviewItem] = useState<any>(null);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const { toast } = useToast();
  const qc = useQueryClient();

  const filteredItems = applyFilters(items, filters, { searchFields: ["title", "regulation", "owner"], statusField: "status", dateField: "dueDate" });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/governance/compliance-actions",
    queryKeys: [["gov-compliance-actions"], ["gov-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "title", label: "العنوان" },
    { key: "regulation", label: "اللائحة" },
    { key: "owner", label: "المسؤول" },
    { key: "dueDate", label: "تاريخ الاستحقاق", type: "date" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "open", label: "مفتوح" }, { value: "in_progress", label: "جاري" }, { value: "done", label: "منجز" }, { value: "overdue", label: "متأخر" }] },
  ];

  const [showNew, setShowNew] = useState(false);
  const handleCreate = async (values: ComplianceActionForm) => {
    try {
      await apiFetch("/governance/compliance-actions", {
        method: "POST",
        body: JSON.stringify(values),
      });
      toast({ title: "تم إنشاء الإجراء" });
      setShowNew(false);
      qc.invalidateQueries({ queryKey: ["gov-compliance-actions"] });
    } catch { toast({ variant: "destructive", title: "خطأ في الحفظ" }); }
  };

  const previewFields: PreviewField[] = [
    { label: "العنوان", key: "title" },
    { label: "اللائحة", key: "regulation" },
    { label: "المسؤول", key: "owner" },
    { label: "الوصف", key: "description" },
    { label: "تاريخ الاستحقاق", key: "dueDate", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters config={{ searchPlaceholder: "بحث بالإجراء أو اللائحة...", statuses: [{ value: "open", label: "مفتوح" }, { value: "in_progress", label: "جاري" }, { value: "done", label: "منجز" }, { value: "overdue", label: "متأخر" }], showDateRange: true }} values={filters} onChange={setFilters} resultCount={filteredItems.length} />
        </div>
        {canWrite && <GuardedButton perm="governance:create" size="sm" onClick={() => setShowNew(!showNew)}><Plus className="h-4 w-4 me-1" />إجراء جديد</GuardedButton>}
      </div>
      {showNew && (
        <Card className="border-dashed">
          <CardContent className="p-4">
            <FormShell
              schema={complianceActionSchema}
              defaultValues={defaultComplianceAction}
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
                <FormTextField name="title" label="العنوان" required />
                <FormTextField name="regulation" label="اللائحة" />
                <FormTextField name="owner" label="المسؤول" />
                <FormDateField name="dueDate" label="تاريخ الاستحقاق" />
                <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
                <FormTextareaField name="description" label="الوصف" rows={2} className="col-span-2" />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>إجراءات الامتثال</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "title", header: "الإجراء", sortable: true, searchable: true, render: (item) => <span className="font-medium">{item.title}</span> },
              { key: "regulation", header: "اللائحة", sortable: true, searchable: true, render: (item) => <span className="text-muted-foreground">{item.regulation || "-"}</span> },
              { key: "owner", header: "المسؤول", sortable: true, searchable: true, render: (item) => <span>{item.owner || "-"}</span> },
              { key: "dueDate", header: "تاريخ الاستحقاق", sortable: true, render: (item) => item.dueDate ? formatDateAr(item.dueDate) : "-" },
              { key: "status", header: "الحالة", sortable: true, render: (item) => <PageStatusBadge status={item.status} /> },
              {
                key: "actions", header: "إجراءات",
                render: (item) => (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewItem(item)}><Eye className="h-4 w-4" /></Button>
                    <RowActions onEdit={() => startEdit(item.id, { title: item.title, regulation: item.regulation || "", owner: item.owner || "", dueDate: item.dueDate || "", status: item.status || "open" })} onDelete={() => startDelete(item.id)} deletePerm="governance:delete" />
                  </div>
                ),
              },
            ]}
            data={filteredItems}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد إجراءات"
            emptyIcon={<Activity className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            rowClassName={(item) => cn(editingId === item.id && "bg-muted/50", deletingId === item.id && "bg-destructive/5")}
            renderRowExtras={(item) => {
              if (editingId === item.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(item.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === item.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(item.id)} onCancel={cancelDelete} isPending={isPending} itemName={item.title} entityType="compliance-action" entityId={item.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="تفاصيل الإجراء" data={previewItem} fields={previewFields} />
    </div>
  );
}
