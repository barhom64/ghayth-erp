import { useState, Fragment } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useSortedData } from "@/hooks/use-sorted-data";
import { useApiQuery, asList } from "@/lib/api";
import { Headphones, Plus, Eye, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useAppContext } from "@/contexts/app-context";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags, useTagFilter, TagFilterSelect } from "@/components/shared/entity-tags";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";

const TICKET_STATUS_OPTIONS = [
  { value: "open", label: "مفتوحة" },
  { value: "in_progress", label: "قيد المعالجة" },
  { value: "resolved", label: "محلولة" },
  { value: "closed", label: "مغلقة" },
];

export default function Support() {
  const { roleLevel } = useAppContext();
  const canManage = roleLevel >= 50;
  const { data: stats } = useApiQuery(["support-stats"], "/support/stats");
  const [page, setPage] = useState(1);
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filters, setFilters] = useFilters();
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const { tagsList, selectedTag, setSelectedTag, filteredIds: tagFilteredIds } = useTagFilter("ticket");
  const pageSize = 20;
  const { data: ticketsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["support-tickets", String(page)],
    `/support/tickets?page=${page}&limit=${pageSize}`
  );
  const tickets = asList(ticketsResp);
  const total = ticketsResp?.total || tickets.length;

  const preFiltered = applyFilters(tickets, filters, {
    searchFields: ["title", "clientName", "category"],
    statusField: "status",
    dateField: "createdAt",
  });
  const filtered = tagFilteredIds ? preFiltered.filter((t: any) => tagFilteredIds.has(t.id)) : preFiltered;

  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/support/tickets",
    queryKeys: [["support-tickets", String(page)], ["support-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "open", label: "مفتوح" }, { value: "in_progress", label: "قيد المعالجة" }, { value: "resolved", label: "محلول" }, { value: "closed", label: "مغلق" }] },
    { key: "priority", label: "الأولوية", type: "select" as const, options: [{ value: "low", label: "منخفضة" }, { value: "medium", label: "متوسطة" }, { value: "high", label: "عالية" }, { value: "urgent", label: "عاجلة" }] },
    { key: "title", label: "العنوان" },
  ];

  const previewFields: PreviewField[] = [
    { label: "العنوان", key: "title" },
    { label: "الأولوية", key: "priority", type: "badge" },
    { label: "الفئة", key: "category" },
    { label: "المسؤول", key: "assigneeName" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الدعم الفني</h1>
          <p className="text-sm text-muted-foreground mt-0.5">إدارة تذاكر الدعم الفني ومتابعة الطلبات</p>
        </div>
        <Link href="/support/create">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            تذكرة جديدة
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">إجمالي التذاكر</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.totalTickets || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-amber-600">مفتوحة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{stats?.openTickets || 0}</div></CardContent></Card>
        <Card className="bg-emerald-600 text-white"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">محلولة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.resolvedTickets || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-rose-600">تجاوزت SLA</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-rose-600">{stats?.slaBreach || 0}</div></CardContent></Card>
      </div>

      <div className="flex flex-col gap-4">
        <AdvancedFilters
          config={{
            searchPlaceholder: "بحث بالعنوان أو العميل أو الفئة...",
            statuses: [
              { value: "open", label: "مفتوح" },
              { value: "in_progress", label: "قيد المعالجة" },
              { value: "resolved", label: "محلول" },
              { value: "closed", label: "مغلق" },
            ],
            showDateRange: true,
          }}
          values={filters}
          onChange={setFilters}
          onExportCSV={() => exportToCSV(sortedData || [], [
            { key: "ref", label: "الرقم" },
            { key: "title", label: "العنوان" },
            { key: "category", label: "الفئة" },
            { key: "clientName", label: "العميل" },
            { key: "assigneeName", label: "المسؤول" },
            { key: "priority", label: "الأولوية" },
            { key: "status", label: "الحالة" },
          ], "تذاكر الدعم")}
          resultCount={sortedData?.length}
        />
        <TagFilterSelect tagsList={tagsList} selectedTag={selectedTag} onSelect={setSelectedTag} />
      </div>

      <BulkActionsBar
        entityType="ticket"
        items={sortedData || []}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll((sortedData || []).map((t: any) => t.id))}
        onClear={clearSelection}
        invalidateKeys={[["support-tickets", String(page)], ["support-stats"]]}
        csvColumns={[
          { key: "ref", label: "الرقم" },
          { key: "title", label: "العنوان" },
          { key: "category", label: "الفئة" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="تذاكر الدعم"
        actions={["close", "export", "delete"]}
      />

      <Card>
        <CardHeader><CardTitle className="gap-2 flex items-center"><Headphones className="h-5 w-5" /> تذاكر الدعم</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <TableHead className="w-8"><BulkCheckbox checked={selectedIds.size === (sortedData || []).length && (sortedData || []).length > 0} indeterminate={selectedIds.size > 0 && selectedIds.size < (sortedData || []).length} onChange={() => toggleAll((sortedData || []).map((t: any) => t.id))} /></TableHead>
            <SortableTableHead column="ref" label="الرقم" sortState={sortState} onSort={handleSort} />
            <TableHead className="text-start">الوسوم</TableHead>
            <SortableTableHead column="title" label="العنوان" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="category" label="الفئة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="clientName" label="العميل" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="assigneeName" label="المسؤول" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="priority" label="الأولوية" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
            <TableHead className="text-start">الإجراءات</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={() => refetch()}
            data={filtered}
            colCount={10}
            emptyMessage="لا توجد تذاكر"
            emptyIcon={<Headphones className="h-6 w-6 text-slate-400" />}
          >
            {sortedData?.map(t => (
              <Fragment key={t.id}>
                <TableRow key={t.id} className={selectedIds.has(t.id) ? "bg-blue-50/50" : ""}>
                  <TableCell><BulkCheckbox checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} /></TableCell>
                  <TableCell className="font-mono text-muted-foreground">{t.ref}</TableCell>
                  <TableCell><EntityTags entityType="ticket" entityId={t.id} inline /></TableCell>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell>{t.category || "-"}</TableCell>
                  <TableCell>{t.clientName || "-"}</TableCell>
                  <TableCell>{t.assigneeName || "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={t.priority} />
                      {t.slaBreached && <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" />SLA خرق</Badge>}
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-start">
                    <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewItem(t)}><Eye className="h-4 w-4" /></Button>
                    <RowActions
                      canEdit={canManage}
                      onEdit={() => startEdit(t.id, { status: t.status || "open", priority: t.priority || "medium", title: t.title || "" })}
                      onDelete={() => startDelete(t.id)}
                    />
                    <button onClick={() => setExpandedId(expandedId === t.id ? null : t.id)} className="text-gray-400 hover:text-gray-600 p-1">
                      {expandedId === t.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedId === t.id && (
                  <TableRow key={`expand-${t.id}`}><TableCell colSpan={10} className="bg-gray-50/50">
                    <div className="space-y-3 p-2">
                      <EntityTags entityType="ticket" entityId={t.id} />
                      <EntityComments entityType="ticket" entityId={t.id} />
                    </div>
                  </TableCell></TableRow>
                )}
                {editingId === t.id && (
                  <TableRow key={`edit-${t.id}`}><TableCell colSpan={10}>
                    <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(t.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                  </TableCell></TableRow>
                )}
                {deletingId === t.id && (
                  <TableRow key={`del-${t.id}`}><TableCell colSpan={10}>
                    <div className="space-y-3">
                      <InlineDeleteConfirm onConfirm={() => handleDelete(t.id)} onCancel={cancelDelete} isPending={isPending} itemName={t.title} entityType="ticket" entityId={t.id} />
                    </div>
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper></Table>
          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة التذكرة" data={previewItem} fields={previewFields} />
    </div>
  );
}
