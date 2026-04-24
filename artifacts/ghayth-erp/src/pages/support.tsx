import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
// P4.1 primitives — Support domain sweep.
// Page header, status chips and the ticket status column now come
// from the shared P1 primitives instead of per-page custom JSX.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { textColumn, statusColumn, actionsColumn } from "@/components/data-table-presets";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Headphones, Plus, Eye, ChevronDown, ChevronUp, AlertTriangle, BookOpen, Star, ThumbsUp, CheckCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useAppContext } from "@/contexts/app-context";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags, useTagFilter, TagFilterSelect } from "@/components/shared/entity-tags";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { formatDateAr } from "@/lib/formatters";

function Support() {
  const { roleLevel } = useAppContext();
  const canManage = roleLevel >= 50;
  const { data: stats } = useApiQuery<any>(["support-stats"], "/support/stats");
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

  const columns: DataTableColumn<any>[] = [
    {
      key: "select", header: "", width: "2rem",
      render: (t) => <BulkCheckbox checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} />,
    },
    { key: "ref", header: "الرقم", sortable: true, render: (t) => <span className="font-mono text-muted-foreground">{t.ref}</span> },
    { key: "tags", header: "الوسوم", render: (t) => <EntityTags entityType="ticket" entityId={t.id} inline /> },
    { key: "title", header: "العنوان", sortable: true, render: (t) => <span className="font-medium">{t.title}</span> },
    { key: "category", header: "الفئة", sortable: true, render: (t) => t.category || "-" },
    { key: "clientName", header: "العميل", sortable: true, render: (t) => t.clientName || "-" },
    { key: "assigneeName", header: "المسؤول", sortable: true, render: (t) => t.assigneeName || "-" },
    {
      key: "priority", header: "الأولوية", sortable: true,
      render: (t) => (
        <div className="flex flex-col gap-1">
          <PageStatusBadge status={t.priority} />
          {t.slaBreached && <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" />خرق مستوى الخدمة</Badge>}
        </div>
      ),
    },
    statusColumn("status", "الحالة", "ticket"),
    {
      key: "actions", header: "الإجراءات",
      render: (t) => (
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
      ),
    },
  ];

  if (isError) return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-red-600 text-lg mb-2">حدث خطأ في تحميل البيانات</p>
      <Button variant="outline" onClick={() => window.location.reload()}>إعادة المحاولة</Button>
    </div>
  );

  return (
    <PageShell
      title="الدعم الفني"
      subtitle="إدارة تذاكر الدعم الفني ومتابعة الطلبات"
      breadcrumbs={[{ label: "الدعم" }]}
      actions={
        <Link href="/support/create">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            تذكرة جديدة
          </Button>
        </Link>
      }
    >
      <KpiGrid items={[
        { label: "إجمالي التذاكر", value: stats?.totalTickets || 0, icon: Headphones, color: "text-blue-600 bg-blue-50" },
        { label: "مفتوحة", value: stats?.openTickets || 0, icon: Clock, color: "text-amber-600 bg-amber-50" },
        { label: "محلولة", value: stats?.resolvedTickets || 0, icon: CheckCircle, color: "text-emerald-600 bg-emerald-50" },
        { label: "هذا الأسبوع", value: stats?.slaBreach || 0, icon: AlertTriangle, color: "text-rose-600 bg-rose-50" },
      ]} />

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
          onExportCSV={() => exportToCSV(filtered, [
            { key: "ref", label: "الرقم" },
            { key: "title", label: "العنوان" },
            { key: "category", label: "الفئة" },
            { key: "clientName", label: "العميل" },
            { key: "assigneeName", label: "المسؤول" },
            { key: "priority", label: "الأولوية" },
            { key: "status", label: "الحالة" },
          ], "تذاكر الدعم")}
          resultCount={filtered.length}
        />
        <TagFilterSelect tagsList={tagsList} selectedTag={selectedTag} onSelect={setSelectedTag} />
      </div>

      <BulkActionsBar
        entityType="ticket"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((t: any) => t.id))}
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
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد تذاكر"
            emptyIcon={<Headphones className="h-6 w-6 text-slate-400" />}
            noToolbar
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            renderRowExtras={(t) => {
              if (editingId === t.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(t.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === t.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(t.id)} onCancel={cancelDelete} isPending={isPending} itemName={t.title} entityType="ticket" entityId={t.id} />;
              if (expandedId === t.id) return (
                <div className="space-y-3 p-2 bg-gray-50/50">
                  <EntityTags entityType="ticket" entityId={t.id} />
                  <EntityComments entityType="ticket" entityId={t.id} />
                </div>
              );
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة التذكرة" data={previewItem} fields={previewFields} />
    </PageShell>
  );
}

function KBManagement() {
  const { data: kbResp, isLoading, isError, error, refetch } = useApiQuery<any>(["support-kb"], "/support/kb");
  const items = asList(kbResp);
  const { roleLevel } = useAppContext();
  const canWrite = roleLevel >= 50;
  const [filters, setFilters] = useFilters();
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ title: "", content: "", category: "", status: "published" });

  const filteredItems = applyFilters(items, filters, { searchFields: ["title", "category"], statusField: "status", dateField: "createdAt" });

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

  const kbColumns: DataTableColumn<any>[] = [
    { key: "title", header: "العنوان", sortable: true, searchable: true, render: (item) => <span className="font-medium">{item.title}</span> },
    { key: "category", header: "التصنيف", sortable: true, searchable: true, render: (item) => <span className="text-muted-foreground">{item.category || "-"}</span> },
    { key: "views", header: "المشاهدات", sortable: true, render: (item) => <span className="flex items-center gap-1 text-sm"><Eye className="h-3 w-3 text-gray-400" />{item.views || 0}</span> },
    {
      key: "helpful", header: "مفيدة / غير مفيدة",
      render: (item) => (
        <span className="flex items-center gap-2 text-xs">
          <span className="text-green-600 flex items-center gap-0.5"><ThumbsUp className="h-3 w-3" />{item.helpful || 0}</span>
          <span className="text-red-500">/</span>
          <span className="text-red-600">{item.notHelpful || 0}</span>
        </span>
      ),
    },
    { key: "status", header: "الحالة", sortable: true, render: (item) => <PageStatusBadge status={item.status} /> },
    {
      key: "actions", header: "إجراءات",
      render: (item) => (
        <RowActions onEdit={() => startEdit(item.id, { title: item.title, category: item.category || "", status: item.status || "published" })} onDelete={() => startDelete(item.id)} />
      ),
    },
  ];

  const createMut = useApiMutation<any, typeof newForm>(
    "/support/kb",
    "POST",
    [["support-kb"]],
    {
      successMessage: "تم إنشاء المقالة",
      onSuccess: () => {
        setShowNew(false);
        setNewForm({ title: "", content: "", category: "", status: "published" });
      },
    }
  );
  const handleCreate = () => {
    if (!newForm.title) return;
    createMut.mutate(newForm);
  };

  if (isError) return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-red-600 text-lg mb-2">حدث خطأ في تحميل البيانات</p>
      <Button variant="outline" onClick={() => window.location.reload()}>إعادة المحاولة</Button>
    </div>
  );

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
          <DataTable
            columns={kbColumns}
            data={filteredItems}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد مقالات"
            emptyIcon={<BookOpen className="h-6 w-6 text-slate-400" />}
            noToolbar
            rowClassName={(item) => editingId === item.id ? "bg-muted/50" : deletingId === item.id ? "bg-destructive/5" : ""}
            renderRowExtras={(item) => {
              if (editingId === item.id) return <div className="p-2 bg-muted/30"><InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(item.id, editForm)} onCancel={cancelEdit} isPending={isPending} /></div>;
              if (deletingId === item.id) return <div className="p-2 bg-destructive/5"><InlineDeleteConfirm onConfirm={() => handleDelete(item.id)} onCancel={cancelDelete} isPending={isPending} itemName={item.title} entityType="kb_article" entityId={item.id} /></div>;
              return null;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function CSATStats() {
  const { data: csatResp, isLoading, isError } = useApiQuery<any>(["support-csat-stats"], "/support/csat");
  const stats = csatResp?.agentStats || [];
  const avg = csatResp?.avgScore;

  const csatColumns: DataTableColumn<any>[] = [
    { key: "agentName", header: "الوكيل", render: (s) => <span className="font-medium">{s.agentName || `وكيل #${s.agentId}`}</span> },
    { key: "count", header: "عدد التقييمات", render: (s) => s.count },
    {
      key: "avg", header: "متوسط رضا العملاء",
      render: (s) => (
        <span className={`font-bold ${Number(s.avg) >= 4 ? "text-green-600" : Number(s.avg) >= 3 ? "text-amber-600" : "text-red-600"}`}>
          {Number(s.avg).toFixed(1)} ★
        </span>
      ),
    },
  ];

  if (isError) return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-red-600 text-lg mb-2">حدث خطأ في تحميل البيانات</p>
      <Button variant="outline" onClick={() => window.location.reload()}>إعادة المحاولة</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm col-span-2 md:col-span-1">
          <CardContent className="p-4 text-center">
            <Star className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            <p className="text-3xl font-bold text-amber-600">{avg ? Number(avg).toFixed(1) : "—"}</p>
            <p className="text-sm text-gray-500 mt-1">متوسط رضا العملاء</p>
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
          <CardHeader><CardTitle>أداء الوكلاء (رضا العملاء)</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={csatColumns}
              data={stats}
              isLoading={isLoading}
              rowKey={(s) => s.agentId}
              noToolbar
              pageSize={0}
              emptyMessage="لا توجد تقييمات"
            />
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
        <TabsTrigger value="csat"><Star className="h-4 w-4 me-1.5" />تقييمات رضا العملاء</TabsTrigger>
      </TabsList>
      <TabsContent value="tickets" className="mt-4"><Support /></TabsContent>
      <TabsContent value="kb" className="mt-4"><KBManagement /></TabsContent>
      <TabsContent value="csat" className="mt-4"><CSATStats /></TabsContent>
    </Tabs>
  );
}
