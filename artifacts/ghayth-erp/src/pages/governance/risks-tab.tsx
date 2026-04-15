import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AlertTriangle, Plus, Eye } from "lucide-react";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { formatDateAr } from "@/lib/formatters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { Link } from "wouter";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

export function RisksTab() {
  const { data: risksResp, isLoading, isError, error, refetch } = useApiQuery<any>(["gov-risks"], "/governance/risks");
  const risks = asList(risksResp);
  const [previewRisk, setPreviewRisk] = useState<any>(null);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const riskFields: PreviewField[] = [
    { label: "الخطر", key: "title" },
    { label: "الشدة", key: "severity", type: "badge" },
    { label: "الوصف", key: "description" },
    { label: "خطة التخفيف", key: "mitigationPlan" },
    { label: "التاريخ", key: "createdAt", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];
  const filteredRisks = applyFilters(risks, filters, { searchFields: ["title", "description"], statusField: "status", dateField: "createdAt" });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/governance/risks",
    queryKeys: [["gov-risks"], ["gov-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "title", label: "العنوان" },
    { key: "severity", label: "الشدة", type: "select" as const, options: [{ value: "low", label: "منخفض" }, { value: "medium", label: "متوسط" }, { value: "high", label: "عالي" }] },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "open", label: "مفتوح" }, { value: "closed", label: "مغلق" }] },
    { key: "description", label: "الوصف" },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "title", header: "الخطر", sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
    { key: "severity", header: "الشدة", sortable: true, render: (r) => <PageStatusBadge status={r.severity} /> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <PageStatusBadge status={r.status} /> },
    {
      key: "actions", header: "إجراءات",
      render: (r) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setPreviewRisk(r)}><Eye className="h-4 w-4" /></Button>
          <RowActions
            onEdit={() => startEdit(r.id, { title: r.title, severity: r.severity || "medium", status: r.status || "open", description: r.description || "" })}
            onDelete={() => startDelete(r.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالخطر أو الوصف...",
              statuses: [
                { value: "open", label: "مفتوح" },
                { value: "closed", label: "مغلق" },
              ],
              showDateRange: true,
              extraFilters: [
                { key: "severity", label: "الشدة", options: [{ value: "low", label: "منخفض" }, { value: "medium", label: "متوسط" }, { value: "high", label: "عالي" }] },
              ],
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filteredRisks, [
              { key: "title", label: "الخطر" },
              { key: "severity", label: "الشدة" },
              { key: "status", label: "الحالة" },
              { key: "createdAt", label: "التاريخ" },
            ], "risks")}
            resultCount={filteredRisks.length}
          />
        </div>
        {canWrite && (
          <Link href="/governance/risks/create">
            <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة خطر</Button>
          </Link>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle>المخاطر</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredRisks}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد مخاطر"
            emptyIcon={<AlertTriangle className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            renderRowExtras={(r) => {
              if (editingId === r.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(r.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === r.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(r.id)} onCancel={cancelDelete} isPending={isPending} itemName={r.title} entityType="risk" entityId={r.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewRisk} onOpenChange={() => setPreviewRisk(null)} title="تفاصيل الخطر" data={previewRisk} fields={riskFields} />
    </div>
  );
}
