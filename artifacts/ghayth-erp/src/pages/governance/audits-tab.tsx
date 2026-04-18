import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ClipboardCheck, Plus, Eye } from "lucide-react";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { Link } from "wouter";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export function AuditsTab() {
  const { data: auditsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["gov-audits"], "/governance/audits");
  const audits = asList(auditsResp);
  const [previewAudit, setPreviewAudit] = useState<any>(null);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const auditFields: PreviewField[] = [
    { label: "العنوان", key: "title" },
    { label: "المدقق", key: "auditorName" },
    { label: "النطاق", key: "scope" },
    { label: "النتائج", key: "findings" },
    { label: "التاريخ", key: "createdAt", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];
  const filteredAudits = applyFilters(audits, filters, { searchFields: ["title", "auditorName"], statusField: "status", dateField: "createdAt" });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/governance/audits",
    queryKeys: [["gov-audits"], ["gov-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "title", label: "العنوان" },
    { key: "auditorName", label: "المدقق" },
    { key: "scope", label: "النطاق" },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "planned", label: "مخطط" }, { value: "in_progress", label: "جاري" }, { value: "completed", label: "مكتمل" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "title", header: "العنوان", sortable: true, render: (a) => <span className="font-medium">{a.title}</span> },
    { key: "auditorName", header: "المدقق", sortable: true, render: (a) => <span className="text-muted-foreground">{a.auditorName || "-"}</span> },
    { key: "scope", header: "النطاق", sortable: true, render: (a) => <span className="max-w-[200px] truncate inline-block">{a.scope || "-"}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (a) => <PageStatusBadge status={a.status} /> },
    {
      key: "actions", header: "إجراءات",
      render: (a) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setPreviewAudit(a)}><Eye className="h-4 w-4" /></Button>
          <RowActions
            onEdit={() => startEdit(a.id, { title: a.title, auditorName: a.auditorName || "", scope: a.scope || "", status: a.status || "planned" })}
            onDelete={() => startDelete(a.id)}
          />
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالعنوان أو المدقق...",
              statuses: [
                { value: "planned", label: "مخطط" },
                { value: "in_progress", label: "جاري" },
                { value: "completed", label: "مكتمل" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filteredAudits, [
              { key: "title", label: "العنوان" },
              { key: "auditorName", label: "المدقق" },
              { key: "scope", label: "النطاق" },
              { key: "status", label: "الحالة" },
            ], "audits")}
            resultCount={filteredAudits.length}
          />
        </div>
        {canWrite && (
          <Link href="/governance/audits/create">
            <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة تدقيق</Button>
          </Link>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle>التدقيق</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredAudits}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا يوجد تدقيق"
            emptyIcon={<ClipboardCheck className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            renderRowExtras={(a) => {
              if (editingId === a.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(a.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === a.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(a.id)} onCancel={cancelDelete} isPending={isPending} itemName={a.title} entityType="audit" entityId={a.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewAudit} onOpenChange={() => setPreviewAudit(null)} title="تفاصيل التدقيق" data={previewAudit} fields={auditFields} />
    </div>
  );
}
