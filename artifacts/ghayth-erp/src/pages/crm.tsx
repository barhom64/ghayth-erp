import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useApiQuery, asList } from "@/lib/api";
import { Target, BarChart3, Plus, Eye } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { useAppContext } from "@/contexts/app-context";

const STAGE_LABELS: Record<string, string> = {
  lead: "عميل محتمل",
  qualified: "مؤهل",
  proposal: "عرض سعر",
  negotiation: "تفاوض",
  closed_won: "تم الإغلاق (ربح)",
  closed_lost: "تم الإغلاق (خسارة)",
};

export default function CRM() {
  const [tab, setTab] = useState("opportunities");
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">إدارة علاقات العملاء</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="opportunities" className="gap-2"><Target className="h-4 w-4" /> الفرص</TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-2"><BarChart3 className="h-4 w-4" /> خط الأنابيب</TabsTrigger>
        </TabsList>
        <TabsContent value="opportunities" className="mt-6"><OpportunitiesTab /></TabsContent>
        <TabsContent value="pipeline" className="mt-6"><PipelineTab /></TabsContent>
      </Tabs>
    </div>
  );
}

const OPP_STAGE_OPTIONS = [
  { value: "lead", label: "عميل محتمل" },
  { value: "qualified", label: "مؤهل" },
  { value: "proposal", label: "عرض سعر" },
  { value: "negotiation", label: "تفاوض" },
  { value: "closed_won", label: "تم الإغلاق (ربح)" },
  { value: "closed_lost", label: "تم الإغلاق (خسارة)" },
];

function OpportunitiesTab() {
  const [, navigate] = useLocation();
  const { roleLevel, scopeQueryString } = useAppContext();
  const canManage = roleLevel >= 50;
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
  const { data: stats } = useApiQuery(["crm-stats", scopeQueryString], `/crm/stats?${scopeQueryString}`);
  const [page, setPage] = useState(1);
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [filters, setFilters] = useFilters();
  const pageSize = 20;
  const { data: oppsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["crm-opportunities", String(page), scopeQueryString],
    `/crm/opportunities?page=${page}&limit=${pageSize}${scopeSuffix}`
  );
  const opportunities = asList(oppsResp);
  const total = oppsResp?.total || opportunities.length;

  const filtered = applyFilters(opportunities, filters, {
    searchFields: ["title", "contactName", "clientName"],
    statusField: "",
    dateField: "",
  });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/crm/opportunities",
    queryKeys: [["crm-opportunities", String(page)], ["crm-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "title", label: "الفرصة" },
    { key: "stage", label: "المرحلة", type: "select" as const, options: Object.entries(STAGE_LABELS).map(([k, v]) => ({ value: k, label: v })) },
    { key: "value", label: "القيمة", type: "number" as const },
    { key: "probability", label: "الاحتمالية", type: "number" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "open", label: "مفتوح" }, { value: "closed", label: "مغلق" }] },
  ];

  const previewFields: PreviewField[] = [
    { label: "الفرصة", key: "title" },
    { label: "العميل", key: "clientName" },
    { label: "القيمة", key: "value", type: "currency" },
    { label: "المرحلة", key: "stage", type: "badge" },
    { label: "الاحتمالية", key: "probability" },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "title", header: "الفرصة", sortable: true, render: (o) => <span className="font-medium">{o.title}</span> },
    { key: "contactName", header: "جهة الاتصال", sortable: true, render: (o) => o.contactName || o.clientName || "-" },
    { key: "stage", header: "المرحلة", sortable: true, render: (o) => <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">{STAGE_LABELS[o.stage] || o.stage}</span> },
    { key: "value", header: "القيمة", sortable: true, render: (o) => <span className="font-bold">{formatCurrency(o.value || 0)}</span> },
    { key: "probability", header: "الاحتمالية", sortable: true, render: (o) => `${o.probability}%` },
    { key: "assigneeName", header: "المسؤول", sortable: true, render: (o) => o.assigneeName || "-" },
    { key: "status", header: "الحالة", sortable: true, render: (o) => <StatusBadge status={o.status} /> },
    {
      key: "actions",
      header: "الإجراءات",
      render: (o) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => setPreviewItem(o)}><Eye className="h-4 w-4" /></Button>
          <RowActions
            canEdit={canManage}
            onEdit={() => startEdit(o.id, { title: o.title, stage: o.stage, value: o.value || 0, probability: o.probability || 0, status: o.status || "open" })}
            onDelete={() => startDelete(o.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">إجمالي الفرص</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.totalOpportunities || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-blue-600">فرص مفتوحة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600">{stats?.openOpportunities || 0}</div></CardContent></Card>
        <Card className="bg-emerald-600 text-white"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">قيمة المكسوب</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(stats?.wonValue || 0)}</div></CardContent></Card>
        <Card className="bg-primary text-primary-foreground"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">قيمة خط الأنابيب</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(stats?.pipelineValue || 0)}</div></CardContent></Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالفرصة أو جهة الاتصال...",
              statuses: [
                { value: "open", label: "مفتوح" },
                { value: "closed", label: "مغلق" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered || [], [
              { key: "title", label: "الفرصة" },
              { key: "contactName", label: "جهة الاتصال" },
              { key: "stage", label: "المرحلة" },
              { key: "value", label: "القيمة" },
              { key: "probability", label: "الاحتمالية" },
              { key: "assigneeName", label: "المسؤول" },
              { key: "status", label: "الحالة" },
            ], "فرص المبيعات")}
            resultCount={filtered?.length}
          />
        </div>
        <Link href="/crm/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> فرصة جديدة</Button>
        </Link>
      </div>

      <Card>
        <CardHeader><CardTitle>الفرص التجارية</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد فرص"
            emptyIcon={<Target className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={pageSize}
            page={page}
            total={total}
            onPageChange={setPage}
            onRowClick={(o) => navigate(`/crm/leads/${o.id}`)}
            renderRowExtras={(o) => {
              if (editingId === o.id) {
                return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(o.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              }
              if (deletingId === o.id) {
                return <InlineDeleteConfirm onConfirm={() => handleDelete(o.id)} onCancel={cancelDelete} isPending={isPending} itemName={o.title} entityType="opportunity" entityId={o.id} />;
              }
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة الفرصة" data={previewItem} fields={previewFields} />
    </div>
  );
}

function PipelineTab() {
  const { data: pipelineResp, isLoading } = useApiQuery<any>(["crm-pipeline"], "/crm/pipeline");
  const pipeline = asList(pipelineResp);
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">خط أنابيب المبيعات</h2>
      {isLoading ? <Skeleton className="h-40 w-full" /> : (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {pipeline?.map(p => (
            <Card key={p.stage} className="text-center">
              <CardHeader className="pb-2"><CardTitle className="text-sm">{STAGE_LABELS[p.stage] || p.stage}</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{p.count}</div>
                <div className="text-sm text-muted-foreground mt-1">{formatCurrency(p.value || 0)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
