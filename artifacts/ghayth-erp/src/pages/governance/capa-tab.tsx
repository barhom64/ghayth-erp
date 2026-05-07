import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable } from "@/components/ui/data-table";
import { CheckCircle2, Plus, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { formatDateAr } from "@/lib/formatters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";

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

  const [newForm, setNewForm] = useState({ finding: "", rootCause: "", correctiveAction: "", preventiveAction: "", responsiblePerson: "", dueDate: "", status: "open" });
  const [showNew, setShowNew] = useState(false);
  const handleCreate = async () => {
    if (!newForm.finding) return;
    try {
      await import("@/lib/api").then(({ apiFetch }) => apiFetch("/governance/capa", {
        method: "POST",
        body: JSON.stringify(newForm),
      }));
      toast({ title: "تم إنشاء الإجراء التصحيحي" });
      setShowNew(false);
      setNewForm({ finding: "", rootCause: "", correctiveAction: "", preventiveAction: "", responsiblePerson: "", dueDate: "", status: "open" });
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
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters config={{ searchPlaceholder: "بحث بالإجراءات التصحيحية...", statuses: [{ value: "open", label: "مفتوح" }, { value: "in_progress", label: "جاري" }, { value: "closed", label: "مغلق" }, { value: "overdue", label: "متأخر" }], showDateRange: true }} values={filters} onChange={setFilters} resultCount={filteredItems.length} />
        </div>
        {canWrite && <Button size="sm" onClick={() => setShowNew(!showNew)}><Plus className="h-4 w-4 me-1" />إجراء تصحيحي جديد</Button>}
      </div>
      {showNew && (
        <Card className="border-dashed">
          <CardContent className="p-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">الملاحظة *</label>
              <Input className="text-sm" value={newForm.finding} onChange={e => setNewForm(p => ({ ...p, finding: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">المسؤول</label>
              <Input className="text-sm" value={newForm.responsiblePerson} onChange={e => setNewForm(p => ({ ...p, responsiblePerson: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">تاريخ الاستحقاق</label>
              <UnifiedDateInput inputClassName="text-sm" value={newForm.dueDate} onChange={(iso) => setNewForm(p => ({ ...p, dueDate: iso }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">السبب الجذري</label>
              <Textarea className="text-sm" rows={2} value={newForm.rootCause} onChange={e => setNewForm(p => ({ ...p, rootCause: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الإجراء التصحيحي</label>
              <Textarea className="text-sm" rows={2} value={newForm.correctiveAction} onChange={e => setNewForm(p => ({ ...p, correctiveAction: e.target.value }))} />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button size="sm" onClick={handleCreate} rateLimitAware>حفظ</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>إلغاء</Button>
            </div>
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
                    <RowActions onEdit={() => startEdit(item.id, { finding: item.finding, responsiblePerson: item.responsiblePerson || "", dueDate: item.dueDate || "", status: item.status || "open" })} onDelete={() => startDelete(item.id)} />
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
