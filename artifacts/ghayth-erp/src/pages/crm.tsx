import { useState, Fragment } from "react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useSortedData } from "@/hooks/use-sorted-data";
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
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

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
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "title", label: "الفرصة" },
              { key: "contactName", label: "جهة الاتصال" },
              { key: "stage", label: "المرحلة" },
              { key: "value", label: "القيمة" },
              { key: "probability", label: "الاحتمالية" },
              { key: "assigneeName", label: "المسؤول" },
              { key: "status", label: "الحالة" },
            ], "فرص CRM")}
            resultCount={sortedData?.length}
          />
        </div>
        <Link href="/crm/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> فرصة جديدة</Button>
        </Link>
      </div>

      <Card>
        <CardHeader><CardTitle>الفرص التجارية</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="title" label="الفرصة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="contactName" label="جهة الاتصال" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="stage" label="المرحلة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="value" label="القيمة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="probability" label="الاحتمالية" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="assigneeName" label="المسؤول" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
            <TableHead className="text-start">الإجراءات</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={() => refetch()}
            data={filtered}
            colCount={8}
            emptyMessage="لا توجد فرص"
            emptyIcon={<Target className="h-6 w-6 text-slate-400" />}
          >
            {sortedData?.map(o => (
              <Fragment key={o.id}>
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.title}</TableCell>
                  <TableCell>{o.contactName || o.clientName || "-"}</TableCell>
                  <TableCell><span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">{STAGE_LABELS[o.stage] || o.stage}</span></TableCell>
                  <TableCell className="font-bold">{formatCurrency(o.value || 0)}</TableCell>
                  <TableCell>{o.probability}%</TableCell>
                  <TableCell>{o.assigneeName || "-"}</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                  <TableCell className="text-start">
                    <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewItem(o)}><Eye className="h-4 w-4" /></Button>
                    <RowActions
                      canEdit={canManage}
                      onEdit={() => startEdit(o.id, { title: o.title, stage: o.stage, value: o.value || 0, probability: o.probability || 0, status: o.status || "open" })}
                      onDelete={() => startDelete(o.id)}
                    />
                    </div>
                  </TableCell>
                </TableRow>
                {editingId === o.id && (
                  <TableRow key={`edit-${o.id}`}><TableCell colSpan={8}>
                    <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(o.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                  </TableCell></TableRow>
                )}
                {deletingId === o.id && (
                  <TableRow key={`del-${o.id}`}><TableCell colSpan={8}>
                    <InlineDeleteConfirm onConfirm={() => handleDelete(o.id)} onCancel={cancelDelete} isPending={isPending} itemName={o.title} entityType="opportunity" entityId={o.id} />
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper></Table>
          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
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
