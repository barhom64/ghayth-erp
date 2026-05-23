import { useState } from "react";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { FileCheck, Plus, Eye, GitBranch } from "lucide-react";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { formatDateAr } from "@/lib/formatters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";

export function PoliciesTab() {
  const [, navigate] = useLocation();
  const { data: policiesResp, isLoading, isError, error, refetch } = useApiQuery<any>(["gov-policies"], "/governance/policies");
  const policies = asList(policiesResp);
  const [previewItem, setPreviewItem] = useState<any>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const policyFields: PreviewField[] = [
    { label: "العنوان", key: "title" },
    { label: "التصنيف", key: "category", type: "badge" },
    { label: "الإصدار", key: "version" },
    { label: "الوصف", key: "description" },
    { label: "تاريخ النفاذ", key: "effectiveDate", type: "date" },
    { label: "تاريخ الانتهاء", key: "expiryDate", type: "date" },
    { label: "التاريخ", key: "createdAt", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];
  const filteredPolicies = applyFilters(policies, filters, { searchFields: ["title", "category"], statusField: "status", dateField: "effectiveDate" });

  const handleNewVersion = async (policyId: number) => {
    try {
      await apiFetch(`/governance/policies/${policyId}/new-version`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast({ title: "تم إنشاء إصدار جديد" });
      qc.invalidateQueries({ queryKey: ["gov-policies"] });
    } catch {
      toast({ variant: "destructive", title: "خطأ في إنشاء إصدار جديد" });
    }
  };

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/governance/policies",
    queryKeys: [["gov-policies"], ["gov-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "title", label: "العنوان" },
    { key: "category", label: "التصنيف" },
    { key: "description", label: "الوصف" },
    { key: "effectiveDate", label: "تاريخ النفاذ", type: "date" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "active", label: "نشط" }, { value: "draft", label: "مسودة" }, { value: "archived", label: "مؤرشف" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "title", header: "العنوان", sortable: true,
      render: (p) => (
        <div>
          <span className="font-medium">{p.title}</span>
          {p.parentId && <Badge variant="outline" className="ms-2 text-[10px]">فرعي</Badge>}
        </div>
      ),
    },
    { key: "category", header: "التصنيف", sortable: true, render: (p) => <span className="text-muted-foreground">{p.category || "-"}</span> },
    {
      key: "version", header: "الإصدار", sortable: true,
      render: (p) => (
        <Badge variant="outline" className="text-xs">
          <GitBranch className="w-3 h-3 me-1" />v{p.version || 1}
        </Badge>
      ),
    },
    { key: "effectiveDate", header: "تاريخ النفاذ", sortable: true, render: (p) => p.effectiveDate ? formatDateAr(p.effectiveDate) : "-" },
    { key: "status", header: "الحالة", sortable: true, render: (p) => <PageStatusBadge status={p.status} /> },
    {
      key: "actions", header: "إجراءات",
      render: (p) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setPreviewItem(p)}><Eye className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => handleNewVersion(p.id)} title="إصدار جديد"><GitBranch className="h-4 w-4" /></Button>
          <RowActions
            onEdit={() => startEdit(p.id, { title: p.title, category: p.category || "", description: p.description || "", effectiveDate: p.effectiveDate || "", status: p.status || "draft" })}
            onDelete={() => startDelete(p.id)}
            deletePerm="governance:delete"
          />
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالعنوان أو التصنيف...",
              statuses: [
                { value: "active", label: "نشط" },
                { value: "draft", label: "مسودة" },
                { value: "archived", label: "مؤرشف" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filteredPolicies, [
              { key: "title", label: "العنوان" },
              { key: "category", label: "التصنيف" },
              { key: "version", label: "الإصدار" },
              { key: "effectiveDate", label: "تاريخ النفاذ" },
              { key: "status", label: "الحالة" },
            ], "policies")}
            resultCount={filteredPolicies.length}
          />
        </div>
        {canWrite && (
          <Link href="/governance/policies/create">
            <GuardedButton perm="governance:create" size="sm"><Plus className="h-4 w-4 me-1" />إضافة سياسة</GuardedButton>
          </Link>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle>السياسات</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredPolicies}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            onRowClick={(p) => navigate(`/governance/policies/${p.id}`)}
            emptyMessage="لا توجد سياسات"
            emptyIcon={<FileCheck className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            renderRowExtras={(p) => {
              if (editingId === p.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(p.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === p.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(p.id)} onCancel={cancelDelete} isPending={isPending} itemName={p.title} entityType="policy" entityId={p.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="تفاصيل السياسة" data={previewItem} fields={policyFields} />
    </div>
  );
}
