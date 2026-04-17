import { useState, Fragment } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ClipboardCheck, ListTodo, GitBranch, Plus, X, Calendar, DollarSign,
  FileSignature, KeyRound, Wrench, ShoppingCart, Headphones, Scale,
  Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Paperclip,
  Search, Filter, ArrowLeft, Send, ArrowRightLeft, CheckCircle2,
} from "lucide-react";
import { ApprovalActions, ActionHistory, NotesDisplay } from "@/components/approval-actions";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useLocation } from "wouter";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags, useTagFilter, TagFilterSelect } from "@/components/shared/entity-tags";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";

const iconMap: Record<string, any> = {
  Calendar, DollarSign, FileSignature, KeyRound, Wrench,
  ShoppingCart, Headphones, Scale,
};

const categoryLabels: Record<string, string> = {
  hr: "الموارد البشرية",
  finance: "المالية",
  operations: "العمليات",
  support: "الدعم",
  legal: "القانونية",
};

// Request status options — PageStatusBadge renders the chip; this
// list just supplies dropdown/label text.
const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "pending",   label: "معلق"          },
  { value: "approved",  label: "موافق"         },
  { value: "rejected",  label: "مرفوض"         },
  { value: "in_review", label: "قيد المراجعة"  },
  { value: "returned",  label: "مُعاد"         },
];

const priorityMap: Record<string, string> = { low: "منخفض", medium: "متوسط", high: "عالي", critical: "حرج" };

const STATUS_EFFECTS: Record<string, { icon: string; text: string; color: string }> = {
  pending: { icon: "⏳", text: "الطلب بانتظار المراجعة", color: "text-yellow-600" },
  in_review: { icon: "🔍", text: "قيد المراجعة من المعتمد", color: "text-blue-600" },
  approved: { icon: "✅", text: "الطلب معتمد — يمكن تحويله لإجراء فعلي", color: "text-green-600" },
  rejected: { icon: "❌", text: "مرفوض — لا يمكن اتخاذ إجراء", color: "text-red-600" },
  returned: { icon: "↩️", text: "مُرجع للتعديل من مقدم الطلب", color: "text-orange-600" },
  closed: { icon: "🔒", text: "مغلق — محوّل لإجراء أو منتهي", color: "text-gray-500" },
};

const CONVERT_OPTIONS = [
  { key: "maintenance", label: "تذكرة صيانة", icon: Wrench, path: "/support", color: "text-orange-600 border-orange-200 hover:bg-orange-50" },
  { key: "purchase", label: "أمر شراء", icon: ShoppingCart, path: "/finance/purchase-orders", color: "text-blue-600 border-blue-200 hover:bg-blue-50" },
  { key: "case", label: "قضية قانونية", icon: Scale, path: "/legal/cases", color: "text-purple-600 border-purple-200 hover:bg-purple-50" },
];

function ConvertRequestPanel({ requestId, onSuccess }: { requestId: number; onSuccess: () => void }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const convertMut = useApiMutation<any, { targetType: string; targetPath: string }>(
    `/requests/${requestId}/convert`,
    "POST",
    [["requests"]],
    {
      successMessage: false,
      onSuccess: (result: any, body) => {
        toast({ title: "تم التحويل بنجاح", description: result?.message });
        onSuccess();
        if (result?.createdId) {
          setTimeout(() => setLocation(body.targetPath), 1200);
        }
      },
    }
  );
  const converting = convertMut.isPending;

  const handleConvert = (targetType: string, targetPath: string) => {
    convertMut.mutate({ targetType, targetPath });
  };

  return (
    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <ArrowRightLeft className="h-4 w-4 text-green-600" />
        <span className="text-sm font-medium text-green-800">تحويل إلى إجراء فعلي</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {CONVERT_OPTIONS.map((opt) => (
          <Button
            key={opt.key}
            size="sm"
            variant="outline"
            disabled={converting}
            onClick={() => handleConvert(opt.key, `${opt.path}`)}
            className={cn("gap-1.5 text-xs", opt.color)}
          >
            <opt.icon className="h-3.5 w-3.5" />
            {opt.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-2">سيتم نقل بيانات الطلب تلقائياً بدون إعادة إدخال</p>
    </div>
  );
}

interface CatalogItem {
  key: string;
  name: string;
  icon: string;
  category: string;
  description: string;
  path: string;
}

function RequestCatalog() {
  const { data } = useApiQuery<any>(["request-catalog"], "/requests/catalog");
  const [, setLocation] = useLocation();
  const catalog: CatalogItem[] = data?.catalog || [];
  const grouped: Record<string, CatalogItem[]> = {};
  catalog.forEach((item) => {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">مركز الطلبات</h1>
          <p className="text-sm text-gray-500 mt-1">اختر نوع الطلب للتقديم مباشرة</p>
        </div>
        {data?.jobTitle && (
          <Badge variant="outline" className="text-sm">
            {data.jobTitle}
          </Badge>
        )}
      </div>
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h4 className="text-sm font-semibold text-gray-500 mb-3">
            {categoryLabels[category] || category}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {items.map((item) => {
              const Icon = iconMap[item.icon] || ClipboardCheck;
              return (
                <Card
                  key={item.key}
                  className="cursor-pointer hover:shadow-md transition-shadow border-0 shadow-sm group"
                  onClick={() => setLocation(item.path)}
                >
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
      {catalog.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>لا توجد أنواع طلبات متاحة لك</p>
        </div>
      )}
    </div>
  );
}

function RequestsList() {
  const { data, refetch } = useApiQuery<any>(["requests"], "/requests");
  const createMut = useApiMutation<unknown, Record<string, any>>("/requests", "POST", [["requests"]]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", requesterName: "" });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [searchText, setSearchText] = useState("");
  const allItems = data?.data || [];
  const qc = useQueryClient();
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const { tagsList, selectedTag, setSelectedTag, filteredIds: tagFilteredIds } = useTagFilter("request");

  const items = allItems.filter((r: any) => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterType && r.typeName !== filterType && String(r.typeId) !== filterType) return false;
    if (filterDateFrom && r.createdAt && r.createdAt < filterDateFrom) return false;
    if (filterDateTo && r.createdAt && r.createdAt > filterDateTo + "T23:59:59") return false;
    if (searchText && !r.title?.toLowerCase().includes(searchText.toLowerCase()) && !r.requesterName?.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (tagFilteredIds && !tagFilteredIds.has(r.id)) return false;
    return true;
  });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/requests",
    queryKeys: [["requests"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "title", label: "العنوان" },
    { key: "description", label: "الوصف" },
    { key: "priority", label: "الأولوية", type: "select" as const, options: [{ value: "low", label: "منخفض" }, { value: "medium", label: "متوسط" }, { value: "high", label: "عالي" }, { value: "critical", label: "حرج" }] },
    { key: "status", label: "الحالة", type: "select" as const, options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  ];

  const handleSubmit = async () => {
    const payload: any = { ...form };
    if (attachments.length > 0) {
      payload.attachments = attachments.map(a => ({ name: a.name, size: a.size, type: a.type, dataUrl: a.dataUrl }));
    }
    await createMut.mutateAsync(payload);
    setForm({ title: "", description: "", priority: "medium", requesterName: "" });
    setAttachments([]);
    setShowForm(false);
    refetch();
  };

  const parseAttachments = (att: any): Attachment[] => {
    if (!att) return [];
    if (typeof att === "string") { try { return JSON.parse(att); } catch { return []; } }
    if (Array.isArray(att)) return att;
    return [];
  };

  const handleApprovalDone = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["req-stats"] });
  };

  const statusCounts: Record<string, number> = {};
  allItems.forEach((r: any) => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">جميع الطلبات</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />طلب جديد</>}
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="بحث في الطلبات..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pe-9 ps-3"
          />
        </div>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-white"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">جميع الحالات</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label} ({statusCounts[o.value] || 0})</option>
          ))}
        </select>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-white"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">جميع الأنواع</option>
          {[...new Set(allItems.map((r: any) => r.typeName).filter(Boolean))].map((t: any) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <DatePicker
            value={filterDateFrom}
            onChange={setFilterDateFrom}
            className="w-36"
            placeholder="من تاريخ"
          />
          <span className="text-gray-400 text-xs">—</span>
          <DatePicker
            value={filterDateTo}
            onChange={setFilterDateTo}
            className="w-36"
            placeholder="إلى تاريخ"
          />
        </div>
        <TagFilterSelect tagsList={tagsList} selectedTag={selectedTag} onSelect={setSelectedTag} />
        {(filterStatus || filterType || filterDateFrom || filterDateTo || searchText || selectedTag) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFilterStatus(""); setFilterType(""); setFilterDateFrom(""); setFilterDateTo(""); setSearchText(""); setSelectedTag(""); }}
            className="text-xs text-gray-500"
          >
            <X className="h-3 w-3 me-1" />
            مسح
          </Button>
        )}
      </div>

      {showForm && (
        <Card><CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>العنوان</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>مقدم الطلب</Label><Input value={form.requesterName} onChange={(e) => setForm({ ...form, requesterName: e.target.value })} /></div>
            <div><Label>الأولوية</Label><select className="w-full border rounded-md p-2" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="low">منخفض</option><option value="medium">متوسط</option><option value="high">عالي</option><option value="critical">حرج</option></select></div>
            <div><Label>الوصف</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <FileDropZone files={attachments} onFilesChange={setAttachments} />
          <Button onClick={handleSubmit} disabled={!form.title || createMut.isPending}>
            <Send className="h-4 w-4 me-1" />
            إرسال الطلب
          </Button>
        </CardContent></Card>
      )}

      <BulkActionsBar
        entityType="request"
        items={items}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(items.map((r: any) => r.id))}
        onClear={clearSelection}
        invalidateKeys={[["requests"]]}
        csvColumns={[
          { key: "title", label: "العنوان" },
          { key: "requesterName", label: "مقدم الطلب" },
          { key: "priority", label: "الأولوية" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="الطلبات"
        actions={["approve", "reject", "export", "delete"]}
      />

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50"><th className="p-3 w-8"><BulkCheckbox checked={selectedIds.size === items.length && items.length > 0} indeterminate={selectedIds.size > 0 && selectedIds.size < items.length} onChange={() => toggleAll(items.map((r: any) => r.id))} /></th><th className="p-3 text-start">العنوان</th><th className="p-3 text-start">الوسوم</th><th className="p-3 text-start">مقدم الطلب</th><th className="p-3 text-start">الأولوية</th><th className="p-3 text-start">المرفقات</th><th className="p-3 text-start">الحالة</th><th className="p-3 text-start">إجراءات الموافقة</th><th className="p-3 text-start">تعديل</th></tr></thead>
          <tbody>
            {items.map((r: any) => {
              const atts = parseAttachments(r.attachments);
              return (
                <Fragment key={r.id}>
                  <tr className={cn("border-b hover:bg-gray-50", selectedIds.has(r.id) && "bg-blue-50/50")}>
                    <td className="p-3"><BulkCheckbox checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                    <td className="p-3">
                      <div>
                        <span className="font-medium">{r.title}</span>
                        <NotesDisplay status={r.status} notes={r.notes} returnReason={r.returnReason} />
                      </div>
                    </td>
                    <td className="p-3"><EntityTags entityType="request" entityId={r.id} inline /></td>
                    <td className="p-3 text-gray-500">{r.requesterName || "-"}</td>
                    <td className="p-3"><Badge variant="outline">{priorityMap[r.priority] || r.priority}</Badge></td>
                    <td className="p-3">
                      {atts.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <Paperclip className="h-3.5 w-3.5 text-blue-500" />
                          <span className="text-xs text-blue-600">{atts.length} ملف</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="p-3"><PageStatusBadge status={r.status} /></td>
                    <td className="p-3">
                      <ApprovalActions
                        entityType="request"
                        entityId={r.id}
                        currentStatus={r.status}
                        approveEndpoint={`/requests/${r.id}/approve`}
                        rejectEndpoint={`/requests/${r.id}/reject`}
                        returnEndpoint={`/requests/${r.id}/return`}
                        onDone={handleApprovalDone}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <RowActions
                          onEdit={() => startEdit(r.id, { title: r.title, description: r.description || "", priority: r.priority || "medium", status: r.status || "pending" })}
                          onDelete={() => startDelete(r.id)}
                        />
                        <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)} className="text-gray-400 hover:text-gray-600 p-1">
                          {expandedId === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr><td colSpan={9} className="p-3 bg-gray-50/50">
                      <div className="space-y-3">
                        {r.status === "approved" && (
                          <ConvertRequestPanel
                            requestId={r.id}
                            onSuccess={() => { refetch(); qc.invalidateQueries({ queryKey: ["req-stats"] }); }}
                          />
                        )}
                        {STATUS_EFFECTS[r.status] && (
                          <div className={cn("flex items-center gap-2 text-xs font-medium px-2 py-1 rounded", STATUS_EFFECTS[r.status].color)}>
                            <span>{STATUS_EFFECTS[r.status].icon}</span>
                            <span>{STATUS_EFFECTS[r.status].text}</span>
                          </div>
                        )}
                        <EntityTags entityType="request" entityId={r.id} />
                        <EntityComments entityType="request" entityId={r.id} />
                        <ActionHistory entityType="request" entityId={r.id} defaultOpen />
                      </div>
                    </td></tr>
                  )}
                  {editingId === r.id && (
                    <tr><td colSpan={9} className="p-2">
                      <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(r.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                    </td></tr>
                  )}
                  {deletingId === r.id && (
                    <tr><td colSpan={9} className="p-2">
                      <InlineDeleteConfirm onConfirm={() => handleDelete(r.id)} onCancel={cancelDelete} isPending={isPending} itemName={r.title} entityType="request" entityId={r.id} />
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
            {items.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-gray-400">لا توجد طلبات</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

function TypesTab() {
  const { data, refetch } = useApiQuery<any>(["req-types"], "/requests/types");
  const createMut = useApiMutation<unknown, Record<string, string>>("/requests/types", "POST", [["req-types"]]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "" });
  const items = data?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">أنواع الطلبات</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة نوع</>}</Button>
      </div>
      {showForm && (
        <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>التصنيف</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>الوصف</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="md:col-span-2"><Button onClick={async () => { await createMut.mutateAsync(form); setForm({ name: "", description: "", category: "" }); setShowForm(false); refetch(); }} disabled={!form.name}>حفظ</Button></div>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50"><th className="p-3 text-start">الاسم</th><th className="p-3 text-start">التصنيف</th><th className="p-3 text-start">الحالة</th></tr></thead>
          <tbody>
            {items.map((t: any) => (
              <tr key={t.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{t.name}</td>
                <td className="p-3 text-gray-500">{t.category || "-"}</td>
                <td className="p-3"><Badge className="bg-green-100 text-green-700">نشط</Badge></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-gray-400">لا توجد أنواع</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

function WorkflowsTab() {
  const { data, refetch } = useApiQuery<any>(["workflows"], "/requests/workflows");
  const createMut = useApiMutation<unknown, Record<string, string>>("/requests/workflows", "POST", [["workflows"]]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const items = data?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">سير العمل</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة</>}</Button>
      </div>
      {showForm && (
        <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>الوصف</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="md:col-span-2"><Button onClick={async () => { await createMut.mutateAsync(form); setForm({ name: "", description: "" }); setShowForm(false); refetch(); }} disabled={!form.name}>حفظ</Button></div>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50"><th className="p-3 text-start">الاسم</th><th className="p-3 text-start">الوصف</th></tr></thead>
          <tbody>
            {items.map((w: any) => (
              <tr key={w.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{w.name}</td>
                <td className="p-3 text-gray-500">{w.description || "-"}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={2} className="p-8 text-center text-gray-400">لا يوجد سير عمل</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

export default function RequestsPage() {
  const { data: stats } = useApiQuery<any>(["req-stats"], "/requests/stats");
  const s = stats || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الطلبات", value: s.totalRequests || 0, icon: ClipboardCheck, color: "text-blue-600 bg-blue-50" },
          { label: "معلقة", value: s.pendingRequests || 0, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
          { label: "موافق عليها", value: s.approvedRequests || 0, icon: CheckCircle, color: "text-green-600 bg-green-50" },
          { label: "أنواع الطلبات", value: s.activeTypes || 0, icon: ListTodo, color: "text-purple-600 bg-purple-50" },
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
      <Tabs defaultValue="catalog" dir="rtl">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="catalog">مركز الطلبات</TabsTrigger>
          <TabsTrigger value="requests">الطلبات</TabsTrigger>
          <TabsTrigger value="types">أنواع الطلبات</TabsTrigger>
          <TabsTrigger value="workflows">سير العمل</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog"><RequestCatalog /></TabsContent>
        <TabsContent value="requests"><RequestsList /></TabsContent>
        <TabsContent value="types"><TypesTab /></TabsContent>
        <TabsContent value="workflows"><WorkflowsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
