import { useState, Fragment } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSortedData } from "@/hooks/use-sorted-data";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { Headphones, Plus, Eye, ChevronDown, ChevronUp, AlertTriangle, BookOpen, Star, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useAppContext } from "@/contexts/app-context";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags, useTagFilter, TagFilterSelect } from "@/components/shared/entity-tags";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatDateAr } from "@/lib/formatters";

const TICKET_STATUS_OPTIONS = [
  { value: "open", label: "مفتوحة" },
  { value: "in_progress", label: "قيد المعالجة" },
  { value: "resolved", label: "محلولة" },
  { value: "closed", label: "مغلقة" },
];

function Support() {
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
        <div className="flex items-center gap-2">
          <Link href="/support/create">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              تذكرة جديدة
            </Button>
          </Link>
        </div>
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

function KBManagement() {
  const { data: kbResp, isLoading, isError, error, refetch } = useApiQuery<any>(["support-kb"], "/support/kb");
  const items = asList(kbResp);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ title: "", content: "", category: "", status: "published" });

  const filteredItems = applyFilters(items, filters, { searchFields: ["title", "category"], statusField: "status", dateField: "createdAt" });
  const { sortedData, sortState, handleSort } = useSortedData(filteredItems);

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/support/kb",
    queryKeys: [["support-kb"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "title", label: "العنوان" },
    { key: "category", label: "التصنيف" },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "published", label: "منشور" }, { value: "draft", label: "مسودة" }, { value: "archived", label: "مؤرشف" }] },
  ];

  const handleCreate = async () => {
    if (!newForm.title) return;
    try {
      await apiFetch("/support/kb", { method: "POST", body: JSON.stringify(newForm) });
      toast({ title: "تم إنشاء المقالة" });
      setShowNew(false);
      setNewForm({ title: "", content: "", category: "", status: "published" });
      qc.invalidateQueries({ queryKey: ["support-kb"] });
    } catch { toast({ variant: "destructive", title: "خطأ في الحفظ" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <AdvancedFilters config={{ searchPlaceholder: "بحث بالعنوان أو التصنيف...", statuses: [{ value: "published", label: "منشور" }, { value: "draft", label: "مسودة" }, { value: "archived", label: "مؤرشف" }] }} values={filters} onChange={setFilters} resultCount={filteredItems.length} />
        {canWrite && <Button size="sm" onClick={() => setShowNew(!showNew)}><Plus className="h-4 w-4 me-1" />مقالة جديدة</Button>}
      </div>

      {showNew && (
        <Card className="border-dashed">
          <CardContent className="p-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">العنوان *</label>
              <input className="w-full border rounded px-2 py-1 text-sm" value={newForm.title} onChange={e => setNewForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">التصنيف</label>
              <input className="w-full border rounded px-2 py-1 text-sm" value={newForm.category} onChange={e => setNewForm(p => ({ ...p, category: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الحالة</label>
              <select className="w-full border rounded px-2 py-1 text-sm" value={newForm.status} onChange={e => setNewForm(p => ({ ...p, status: e.target.value }))}>
                <option value="published">منشور</option><option value="draft">مسودة</option><option value="archived">مؤرشف</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">المحتوى</label>
              <textarea className="w-full border rounded px-2 py-1 text-sm" rows={4} value={newForm.content} onChange={e => setNewForm(p => ({ ...p, content: e.target.value }))} />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button size="sm" onClick={handleCreate}>حفظ</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-blue-600" />مقالات قاعدة المعرفة</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="title" label="العنوان" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="category" label="التصنيف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="views" label="المشاهدات" sortState={sortState} onSort={handleSort} />
            <TableHead>مفيدة / غير مفيدة</TableHead>
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
            <TableHead>إجراءات</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filteredItems} colCount={6} emptyMessage="لا توجد مقالات" emptyIcon={<BookOpen className="h-6 w-6 text-slate-400" />}>
            {(sortedData || []).map((item: any) => (
              <Fragment key={item.id}>
                <TableRow className={editingId === item.id ? "bg-muted/50" : deletingId === item.id ? "bg-destructive/5" : ""}>
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell className="text-muted-foreground">{item.category || "-"}</TableCell>
                  <TableCell><span className="flex items-center gap-1 text-sm"><Eye className="h-3 w-3 text-gray-400" />{item.views || 0}</span></TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-green-600 flex items-center gap-0.5"><ThumbsUp className="h-3 w-3" />{item.helpful || 0}</span>
                      <span className="text-red-500">/</span>
                      <span className="text-red-600">{item.notHelpful || 0}</span>
                    </span>
                  </TableCell>
                  <TableCell><StatusBadge status={item.status} /></TableCell>
                  <TableCell>
                    <RowActions onEdit={() => startEdit(item.id, { title: item.title, category: item.category || "", status: item.status || "published" })} onDelete={() => startDelete(item.id)} />
                  </TableCell>
                </TableRow>
                {editingId === item.id && <TableRow><TableCell colSpan={6} className="p-2 bg-muted/30"><InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(item.id, editForm)} onCancel={cancelEdit} isPending={isPending} /></TableCell></TableRow>}
                {deletingId === item.id && <TableRow><TableCell colSpan={6} className="p-2 bg-destructive/5"><InlineDeleteConfirm onConfirm={() => handleDelete(item.id)} onCancel={cancelDelete} isPending={isPending} itemName={item.title} entityType="kb_article" entityId={item.id} /></TableCell></TableRow>}
              </Fragment>
            ))}
          </DataTableWrapper></Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CSATStats() {
  const { data: csatResp, isLoading } = useApiQuery<any>(["support-csat-stats"], "/support/csat");
  const stats = csatResp?.agentStats || [];
  const avg = csatResp?.avgScore;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm col-span-2 md:col-span-1">
          <CardContent className="p-4 text-center">
            <Star className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            <p className="text-3xl font-bold text-amber-600">{avg ? Number(avg).toFixed(1) : "—"}</p>
            <p className="text-sm text-gray-500 mt-1">متوسط CSAT</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{csatResp?.total || 0}</p>
            <p className="text-xs text-gray-500">إجمالي التقييمات</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">{csatResp?.fiveStars || 0}</p>
            <p className="text-xs text-gray-500">تقييمات ممتازة (5⭐)</p>
          </CardContent>
        </Card>
      </div>

      {stats.length > 0 && (
        <Card>
          <CardHeader><CardTitle>أداء الوكلاء (CSAT)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>الوكيل</TableHead>
                <TableHead>عدد التقييمات</TableHead>
                <TableHead>متوسط CSAT</TableHead>
              </TableRow></TableHeader>
              <tbody>
                {stats.map((s: any) => (
                  <TableRow key={s.agentId}>
                    <TableCell className="font-medium">{s.agentName || `وكيل #${s.agentId}`}</TableCell>
                    <TableCell>{s.count}</TableCell>
                    <TableCell>
                      <span className={`font-bold ${Number(s.avg) >= 4 ? "text-green-600" : Number(s.avg) >= 3 ? "text-amber-600" : "text-red-600"}`}>
                        {Number(s.avg).toFixed(1)} ★
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function SupportWithTabs() {
  return (
    <Tabs defaultValue="tickets">
      <TabsList>
        <TabsTrigger value="tickets"><Headphones className="h-4 w-4 me-1.5" />التذاكر</TabsTrigger>
        <TabsTrigger value="kb"><BookOpen className="h-4 w-4 me-1.5" />قاعدة المعرفة</TabsTrigger>
        <TabsTrigger value="csat"><Star className="h-4 w-4 me-1.5" />تقييمات CSAT</TabsTrigger>
      </TabsList>
      <TabsContent value="tickets" className="mt-4"><Support /></TabsContent>
      <TabsContent value="kb" className="mt-4"><KBManagement /></TabsContent>
      <TabsContent value="csat" className="mt-4"><CSATStats /></TabsContent>
    </Tabs>
  );
}
