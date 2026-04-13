import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/ui/data-table";
import { Activity, Plus, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { formatDateAr } from "@/lib/formatters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

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

  const [newForm, setNewForm] = useState({ title: "", regulation: "", owner: "", dueDate: "", description: "", status: "open" });
  const [showNew, setShowNew] = useState(false);
  const handleCreate = async () => {
    if (!newForm.title) return;
    try {
      await import("@/lib/api").then(({ apiFetch }) => apiFetch("/governance/compliance-actions", {
        method: "POST",
        body: JSON.stringify(newForm),
      }));
      toast({ title: "تم إنشاء الإجراء" });
      setShowNew(false);
      setNewForm({ title: "", regulation: "", owner: "", dueDate: "", description: "", status: "open" });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters config={{ searchPlaceholder: "بحث بالإجراء أو اللائحة...", statuses: [{ value: "open", label: "مفتوح" }, { value: "in_progress", label: "جاري" }, { value: "done", label: "منجز" }, { value: "overdue", label: "متأخر" }], showDateRange: true }} values={filters} onChange={setFilters} resultCount={filteredItems.length} />
        </div>
        {canWrite && <Button size="sm" onClick={() => setShowNew(!showNew)}><Plus className="h-4 w-4 me-1" />إجراء جديد</Button>}
      </div>
      {showNew && (
        <Card className="border-dashed">
          <CardContent className="p-4 grid grid-cols-2 gap-3">
            {editFields.map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                {f.type === "select" ? (
                  <select className="w-full border rounded px-2 py-1 text-sm" value={(newForm as any)[f.key]} onChange={e => setNewForm(p => ({ ...p, [f.key]: e.target.value }))}>
                    {f.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input type={f.type === "date" ? "date" : "text"} className="w-full border rounded px-2 py-1 text-sm" value={(newForm as any)[f.key]} onChange={e => setNewForm(p => ({ ...p, [f.key]: e.target.value }))} />
                )}
              </div>
            ))}
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">الوصف</label>
              <textarea className="w-full border rounded px-2 py-1 text-sm" rows={2} value={newForm.description} onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button size="sm" onClick={handleCreate}>حفظ</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>إجراءات الامتثال</CardTitle></CardHeader>
        <CardContent>
          <DataTable<any>
            columns={[
              { key: "title", header: "الإجراء", sortable: true, searchable: true, render: (item) => <span className="font-medium">{item.title}</span> },
              { key: "regulation", header: "اللائحة", sortable: true, searchable: true, render: (item) => <span className="text-muted-foreground">{item.regulation || "-"}</span> },
              { key: "owner", header: "المسؤول", sortable: true, searchable: true, render: (item) => <span>{item.owner || "-"}</span> },
              { key: "dueDate", header: "تاريخ الاستحقاق", sortable: true, render: (item) => item.dueDate ? formatDateAr(item.dueDate) : "-" },
              { key: "status", header: "الحالة", sortable: true, render: (item) => <StatusBadge status={item.status} /> },
              {
                key: "actions", header: "إجراءات",
                render: (item) => (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewItem(item)}><Eye className="h-4 w-4" /></Button>
                    <RowActions onEdit={() => startEdit(item.id, { title: item.title, regulation: item.regulation || "", owner: item.owner || "", dueDate: item.dueDate || "", status: item.status || "open" })} onDelete={() => startDelete(item.id)} />
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
