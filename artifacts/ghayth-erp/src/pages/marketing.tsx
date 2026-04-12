import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Megaphone, Plus, DollarSign, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

export default function MarketingPage() {
  const { data: stats } = useApiQuery<any>(["mkt-stats"], "/marketing/stats");
  const { data: campaignsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["mkt-campaigns"], "/marketing/campaigns");
  const items = asList(campaignsResp);
  const [filters, setFilters] = useFilters();
  const pageSize = 20;
  const [previewCampaign, setPreviewCampaign] = useState<any>(null);
  const campaignFields: PreviewField[] = [
    { label: "الحملة", key: "name" },
    { label: "القناة", key: "channel", type: "badge" },
    { label: "الميزانية", key: "budget", type: "currency" },
    { label: "المصروف", key: "spent", type: "currency" },
    { label: "الوصف", key: "description" },
    { label: "التاريخ", key: "createdAt", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];
  const s = stats || {};

  const statusMap: Record<string, { label: string; color: string }> = {
    draft: { label: "مسودة", color: "bg-gray-100 text-gray-700" },
    active: { label: "نشط", color: "bg-green-100 text-green-700" },
    paused: { label: "متوقف", color: "bg-yellow-100 text-yellow-700" },
    completed: { label: "مكتمل", color: "bg-blue-100 text-blue-700" },
  };

  const filtered = applyFilters(items, filters, { searchFields: ["name", "channel"], statusField: "status", dateField: "createdAt" });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/marketing/campaigns",
    queryKeys: [["mkt-campaigns"], ["mkt-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "name", label: "الحملة" },
    { key: "channel", label: "القناة" },
    { key: "budget", label: "الميزانية", type: "number" as const },
    { key: "spent", label: "المصروف", type: "number" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: Object.entries(statusMap).map(([k, v]) => ({ value: k, label: v.label })) },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "الحملة", sortable: true, render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "channel", header: "القناة", sortable: true, render: (c) => <span className="text-muted-foreground">{c.channel || "-"}</span> },
    { key: "budget", header: "الميزانية", sortable: true, render: (c) => formatCurrency(Number(c.budget) || 0) },
    { key: "spent", header: "المصروف", sortable: true, render: (c) => formatCurrency(Number(c.spent) || 0) },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (c) => formatDateAr(c.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (c) => <StatusBadge status={c.status} /> },
    {
      key: "actions",
      header: "إجراءات",
      align: "end",
      width: "100px",
      render: (c) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setPreviewCampaign(c)}><Eye className="h-4 w-4" /></Button>
          <RowActions
            onEdit={() => startEdit(c.id, { name: c.name, channel: c.channel || "", budget: Number(c.budget) || 0, spent: Number(c.spent) || 0, status: c.status || "draft" })}
            onDelete={() => startDelete(c.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الحملات", value: s.totalCampaigns || 0, icon: Megaphone, color: "text-pink-600 bg-pink-50" },
          { label: "حملات نشطة", value: s.activeCampaigns || 0, icon: Megaphone, color: "text-green-600 bg-green-50" },
          { label: "الميزانية", value: formatCurrency(s.totalBudget || 0), icon: DollarSign, color: "text-blue-600 bg-blue-50" },
          { label: "المصروف", value: formatCurrency(s.totalSpent || 0), icon: DollarSign, color: "text-red-600 bg-red-50" },
        ].map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">الحملات التسويقية</h1>
        <Link href="/marketing/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />حملة جديدة</Button>
        </Link>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالحملة أو القناة...",
          statuses: Object.entries(statusMap).map(([k, v]) => ({ value: k, label: v.label })),
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <Card>
        <CardHeader><CardTitle>الحملات</CardTitle></CardHeader>
        <CardContent>
          <DataTable<any>
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد حملات"
            emptyIcon={<Megaphone className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={pageSize}
            renderRowExtras={(c) => {
              if (editingId === c.id) {
                return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(c.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              }
              if (deletingId === c.id) {
                return <InlineDeleteConfirm onConfirm={() => handleDelete(c.id)} onCancel={cancelDelete} isPending={isPending} itemName={c.name} entityType="campaign" entityId={c.id} />;
              }
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewCampaign} onOpenChange={() => setPreviewCampaign(null)} title="تفاصيل الحملة" data={previewCampaign} fields={campaignFields} />
    </div>
  );
}
