import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@workspace/ui-core";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Shield, Plus, Eye } from "lucide-react";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { formatDateAr } from "@/lib/formatters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { Link, useLocation } from "wouter";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";

export function ComplianceTab() {
  const [, navigate] = useLocation();
  const { data: complianceResp, isLoading, isError, error, refetch } = useApiQuery<any>(["gov-compliance"], "/governance/compliance");
  const items = asList(complianceResp);
  const [previewComp, setPreviewComp] = useState<any>(null);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const compFields: PreviewField[] = [
    { label: "اللائحة", key: "regulation" },
    { label: "المسؤول", key: "responsiblePerson" },
    { label: "الوصف", key: "description" },
    { label: "التاريخ", key: "createdAt", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];
  const filteredCompliance = applyFilters(items, filters, { searchFields: ["regulation", "responsiblePerson"], statusField: "status", dateField: "createdAt" });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/governance/compliance",
    queryKeys: [["gov-compliance"], ["gov-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "regulation", label: "اللائحة/النظام" },
    { key: "responsiblePerson", label: "المسؤول" },
    { key: "description", label: "الوصف" },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "compliant", label: "ممتثل" }, { value: "non_compliant", label: "غير ممتثل" }, { value: "partial", label: "جزئي" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "regulation", header: "اللائحة", sortable: true, render: (i) => <span className="font-medium">{i.regulation}</span> },
    { key: "responsiblePerson", header: "المسؤول", sortable: true, render: (i) => <span className="text-muted-foreground">{i.responsiblePerson || "-"}</span> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (i) => formatDateAr(i.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (i) => <PageStatusBadge status={i.status} /> },
    {
      key: "actions", header: "إجراءات",
      render: (i) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setPreviewComp(i)}><Eye className="h-4 w-4" /></Button>
          <RowActions
            onEdit={() => startEdit(i.id, { regulation: i.regulation, responsiblePerson: i.responsiblePerson || "", description: i.description || "", status: i.status || "compliant" })}
            onDelete={() => startDelete(i.id)}
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
              searchPlaceholder: "بحث باللائحة أو المسؤول...",
              statuses: [
                { value: "compliant", label: "ممتثل" },
                { value: "non_compliant", label: "غير ممتثل" },
                { value: "partial", label: "جزئي" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filteredCompliance, [
              { key: "regulation", label: "اللائحة" },
              { key: "responsiblePerson", label: "المسؤول" },
              { key: "status", label: "الحالة" },
              { key: "createdAt", label: "التاريخ" },
            ], "compliance")}
            resultCount={filteredCompliance.length}
          />
        </div>
        {canWrite && (
          <Link href="/governance/compliance/create">
            <GuardedButton perm="governance:create" size="sm"><Plus className="h-4 w-4 me-1" />إضافة</GuardedButton>
          </Link>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle>الامتثال</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredCompliance}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            onRowClick={(i) => navigate(`/governance/compliance/${i.id}`)}
            emptyMessage="لا توجد بيانات"
            emptyIcon={<Shield className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            renderRowExtras={(i) => {
              if (editingId === i.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(i.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === i.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(i.id)} onCancel={cancelDelete} isPending={isPending} itemName={i.regulation} entityType="compliance" entityId={i.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewComp} onOpenChange={() => setPreviewComp(null)} title="تفاصيل الامتثال" data={previewComp} fields={compFields} />
    </div>
  );
}
