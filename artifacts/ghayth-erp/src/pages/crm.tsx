import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useApiQuery, asList } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Target, BarChart3, Plus, Eye, DollarSign, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
// P4.3 — CRM domain sweep. Shared header + status chips from P1 primitives.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { currencyColumn } from "@/components/data-table-presets";
import { KpiGrid } from "@/components/shared/kpi-card";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { useAppContext } from "@/contexts/app-context";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { CrmTabsNav } from "@/components/shared/crm-tabs-nav";
import { GuardedButton } from "@/components/shared/permission-gate";

// Compose a list-endpoint URL out of the AdvancedFilters state. Scope
// (companyIds/branchIds) is auto-injected by useApiQuery → injectScope,
// so we don't splice it here. Mirrors the warehouse.tsx helper introduced
// alongside the same fix; tracked for extraction in issue #652.
function withListFilters(
  base: string,
  f: { search?: string; status?: string; dateFrom?: string; dateTo?: string },
): string {
  const parts: string[] = [];
  if (f.search) parts.push(`search=${encodeURIComponent(f.search)}`);
  if (f.status) parts.push(`status=${encodeURIComponent(f.status)}`);
  if (f.dateFrom) parts.push(`dateFrom=${encodeURIComponent(f.dateFrom)}`);
  if (f.dateTo) parts.push(`dateTo=${encodeURIComponent(f.dateTo)}`);
  if (parts.length === 0) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${parts.join("&")}`;
}

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
    <PageShell
      title="إدارة علاقات العملاء"
      subtitle="متابعة فرص البيع وخط الأنابيب"
      breadcrumbs={[{ label: "المبيعات والعملاء" }]}
    >
      <CrmTabsNav />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="opportunities" className="gap-2"><Target className="h-4 w-4" /> الفرص</TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-2"><BarChart3 className="h-4 w-4" /> خط الأنابيب</TabsTrigger>
        </TabsList>
        <TabsContent value="opportunities" className="mt-6"><OpportunitiesTab /></TabsContent>
        <TabsContent value="pipeline" className="mt-6"><PipelineTab /></TabsContent>
      </Tabs>
    </PageShell>
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
  const { roleLevel } = useAppContext();
  const canManage = roleLevel >= 50;
  // Scope (companyIds/branchIds) + scope-aware queryKey are injected
  // automatically by useApiQuery → injectScope.
  const { data: stats } = useApiQuery(["crm-stats"], `/crm/stats`);
  const [page, setPage] = useState(1);
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [filters, setFilters] = useFilters();
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const pageSize = 20;
  const { data: oppsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["crm-opportunities", String(page), filters.search, filters.status, filters.dateFrom, filters.dateTo],
    withListFilters(`/crm/opportunities?page=${page}&limit=${pageSize}`, filters),
  );
  const opportunities = asList(oppsResp);
  const total = oppsResp?.total || opportunities.length;

  // Client-side filter mirrors backend so the count chip ("X نتيجة") in
  // AdvancedFilters reflects what's visible; backend already narrowed
  // the result set, so this is defence-in-depth + display consistency.
  const filtered = applyFilters(opportunities, filters, {
    searchFields: ["title", "contactName", "clientName"],
    statusField: "status",
    dateField: "createdAt",
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
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (v) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} />
        </span>
      ),
    },
    { key: "title", header: "الفرصة", sortable: true, render: (o) => <span className="font-medium">{o.title}</span> },
    { key: "contactName", header: "جهة الاتصال", sortable: true, render: (o) => o.contactName || o.clientName || "-" },
    { key: "stage", header: "المرحلة", sortable: true, render: (o) => <PageStatusBadge status={o.stage}>{STAGE_LABELS[o.stage] || o.stage}</PageStatusBadge> },
    currencyColumn("value", "القيمة"),
    { key: "probability", header: "الاحتمالية", sortable: true, render: (o) => `${o.probability}%` },
    { key: "assigneeName", header: "المسؤول", sortable: true, render: (o) => o.assigneeName || "-" },
    { key: "status", header: "الحالة", sortable: true, render: (o) => <PageStatusBadge status={o.status} /> },
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
            deletePerm="crm:delete"
          />
        </div>
      ),
    },
  ];

  if (isError) return <PageStateWrapper error={error} onRetry={refetch}><div /></PageStateWrapper>;

  return (
    <div className="space-y-6">
      <KpiGrid items={[
        { label: "إجمالي الفرص", value: stats?.totalOpportunities || 0, icon: Target, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "مفتوحة", value: stats?.openOpportunities || 0, icon: TrendingUp, color: "text-indigo-600 bg-indigo-50" },
        { label: "مكسوبة", value: stats?.wonOpportunities || 0, icon: Eye, color: "text-emerald-600 bg-emerald-50" },
        { label: "قيمة الصفقات", value: formatCurrency(stats?.pipelineValue || 0), icon: DollarSign, color: "text-purple-600 bg-purple-50" },
      ]} />

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
          <GuardedButton perm="crm:create" className="gap-2"><Plus className="h-4 w-4" /> فرصة جديدة</GuardedButton>
        </Link>
      </div>

      <BulkActionsBar
        entityType="opportunity"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["crm-opportunities"]]}
        actions={["export"]}
        csvColumns={[
          { key: "title", label: "الفرصة" },
          { key: "contactName", label: "جهة الاتصال" },
          { key: "stage", label: "المرحلة" },
          { key: "value", label: "القيمة" },
          { key: "probability", label: "الاحتمالية" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="فرص_المبيعات"
      />

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
  const { data: pipelineResp, isLoading, isError, error, refetch } = useApiQuery<any>(["crm-pipeline"], "/crm/pipeline");
  const pipeline = asList(pipelineResp);
  if (isError) return <PageStateWrapper error={error} onRetry={refetch}><div /></PageStateWrapper>;

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
