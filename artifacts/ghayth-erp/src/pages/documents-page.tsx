import { useState, Fragment } from "react";
import { API_BASE, nativeAuthHeaders } from "@/lib/api";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  FormShell,
  FormTextField,
  FormGrid,
} from "@workspace/ui-core";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const folderSchema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب"),
  color: z.string().trim(),
});
type FolderForm = z.infer<typeof folderSchema>;

const templateSchema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب"),
  description: z.string().trim(),
  category: z.string().trim(),
});
type TemplateForm = z.infer<typeof templateSchema>;
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, FolderOpen, FilePlus, X, Upload, Download, History,
  CheckCircle2, Clock, XCircle, Filter, Search, Plus, Eye, Edit, Trash2, Link2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { groupByCategoryOrder } from "@/lib/document-grouping";

// القيم تطابق تعداد DOCUMENT_CATEGORIES الخلفي (وعليه فترة الحفظ) — official/financial/
// other لم تكن ضمنه فكان الرفع/الفلترة بها يفشل؛ صُحّحت (التسميات العربية كما هي).
const CATEGORIES = [
  { value: "contracts", label: "عقود" },
  { value: "compliance", label: "وثائق رسمية" },
  { value: "finance", label: "مالية" },
  { value: "hr", label: "موارد بشرية" },
  { value: "legal", label: "قانونية" },
  { value: "general", label: "أخرى" },
];

const CATEGORY_EFFECTS: Record<string, { icon: string; approvedEffect: string; severity: "info" | "warning" | "success" }> = {
  contracts: { icon: "📜", approvedEffect: "اعتماد العقد يُنشئ التزاماً قانونياً ومالياً رسمياً للشركة", severity: "warning" },
  financial: { icon: "💰", approvedEffect: "اعتماد المستند المالي يُفعّل ذمة مالية أو مطالبة", severity: "warning" },
  official: { icon: "🏛️", approvedEffect: "اعتماد الوثيقة الرسمية يُبدأ إجراءً رسمياً", severity: "info" },
  hr: { icon: "👤", approvedEffect: "اعتماد وثيقة الموارد البشرية يُحدّث ملف الموظف", severity: "info" },
  legal: { icon: "⚖️", approvedEffect: "اعتماد المستند القانوني يُفعّل التزاماً قانونياً", severity: "warning" },
  other: { icon: "📄", approvedEffect: "اعتماد المستند يُبدأ تأثيره المرتبط", severity: "info" },
};

const BASE = API_BASE;

function formatSize(bytes: number) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadgeDoc({ status }: { status: string }) {
  return <PageStatusBadge status={status || "draft"} />;
}

function CategoryBadge({ category }: { category: string }) {
  const cat = CATEGORIES.find(c => c.value === category);
  return <Badge variant="outline">{cat?.label || category || "-"}</Badge>;
}


const documentEditSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional().default(""),
  category: z.string().optional().default(""),
});
type DocumentEditForm = z.infer<typeof documentEditSchema>;

function DocumentsList() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<{ id: number; title: string } | null>(null);
  const [editing, setEditing] = useState<any | null>(null);

  const queryParams = new URLSearchParams();
  if (categoryFilter && categoryFilter !== "all") queryParams.set("category", categoryFilter);
  if (statusFilter && statusFilter !== "all") queryParams.set("status", statusFilter);
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";

  const { data: docsResp, isLoading, refetch } = useApiQuery<any>(
    ["documents", categoryFilter, statusFilter],
    `/documents${queryString}`
  );
  const items = asList(docsResp);

  const filtered = items.filter((d: any) =>
    !search || d.title?.includes(search) || d.fileName?.includes(search)
  );
  // «تنظيم المكتبة» (توجيه إبراهيم هـ) — كانت المستندات قائمة مسطّحة رغم وجود
  // ٦ تصنيفات. نرتّبها حسب ترتيب CATEGORIES ونحسب عدّاد كل تصنيف عبر مُساعد نقي،
  // فتُعرض مجمّعة برأس قسم «التصنيف (العدد)» عند عرض «الكل».
  const { ordered: orderedFiltered, countByCat } = groupByCategoryOrder(
    filtered as Array<{ category?: string | null } & Record<string, any>>,
    CATEGORIES.map((c) => c.value),
  );

  const statusMut = useApiMutation<any, { id: number; status: string }>(
    (body) => `/documents/${body.id}/status`,
    "PATCH",
    [["documents"], ["doc-stats"]],
    { successMessage: "تم تحديث الحالة" }
  );
  const handleStatusChange = (docId: number, newStatus: string) => {
    statusMut.mutate({ id: docId, status: newStatus });
  };

  // PATCH /documents/:id — rename/redescribe a document.
  const renameMut = useApiMutation<any, { id: number; title?: string; description?: string }>(
    (body) => `/documents/${body.id}`,
    "PATCH",
    [["documents"], ["doc-stats"]],
    { successMessage: "تم تعديل بيانات المستند" },
  );
  // DELETE /documents/:id — hard delete (only for cancelled documents).
  const deleteMut = useApiMutation<any, number>(
    (id) => `/documents/${id}`,
    "DELETE",
    [["documents"], ["doc-stats"]],
    { successMessage: "تم حذف المستند" },
  );
  // GET /documents/:id/entity-links + POST same path — show + add
  // cross-references that pin this document to another business entity
  // (an invoice, contract, ticket, etc.).
  const [linksDocId, setLinksDocId] = useState<number | null>(null);
  const linksQ = useApiQuery<any>(
    ["doc-entity-links", String(linksDocId ?? 0)],
    linksDocId ? `/documents/${linksDocId}/entity-links` : null,
    { enabled: linksDocId !== null },
  );
  const addLinkMut = useApiMutation<any, { id: number; entityType: string; entityId: number }>(
    (b) => `/documents/${b.id}/entity-links`,
    "POST",
    [["doc-entity-links", String(linksDocId ?? 0)]],
    { successMessage: "تم ربط المستند" },
  );
  const [linkEntityType, setLinkEntityType] = useState("");
  const [linkEntityId, setLinkEntityId] = useState("");
  const submitAddLink = () => {
    if (!linksDocId || !linkEntityType.trim() || !linkEntityId.trim()) {
      toast({ variant: "destructive", title: "النوع والمعرّف مطلوبان" });
      return;
    }
    const eid = Number(linkEntityId);
    if (!Number.isFinite(eid) || eid <= 0) {
      toast({ variant: "destructive", title: "المعرّف غير صالح" });
      return;
    }
    addLinkMut.mutate(
      { id: linksDocId, entityType: linkEntityType.trim(), entityId: eid },
      { onSuccess: () => { setLinkEntityType(""); setLinkEntityId(""); } },
    );
  };

  // Inline edit + delete state
  const [editingDoc, setEditingDoc] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const startEdit = (d: any) => {
    setEditingDoc(d);
    setEditTitle(d.title ?? "");
    setEditDesc(d.description ?? "");
  };
  const submitEdit = () => {
    if (!editingDoc) return;
    if (!editTitle.trim()) {
      toast({ variant: "destructive", title: "العنوان مطلوب" });
      return;
    }
    renameMut.mutate(
      { id: editingDoc.id, title: editTitle.trim(), description: editDesc.trim() || undefined },
      { onSuccess: () => setEditingDoc(null) },
    );
  };
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const handleDownload = async (docId: number, fileName: string) => {
    try {
      const res = await fetch(`${BASE}/api/documents/${docId}/download`, {
        credentials: "include",
        headers: { ...nativeAuthHeaders() },
      });
      if (!res.ok) throw new Error("فشل التنزيل");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "file";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التنزيل", description: err.message });
    }
  };

  const handleRefresh = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["doc-stats"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/documents/upload"><GuardedButton perm="documents:create" className="gap-2"><Upload className="h-4 w-4" /> رفع مستند</GuardedButton></Link>
        <Link href="/documents/create"><GuardedButton perm="documents:create" variant="outline" className="gap-2"><FilePlus className="h-4 w-4" /> إنشاء مستند</GuardedButton></Link>
        <div className="flex-1" />
        <div className="relative w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} className="ps-10" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40"><Filter className="h-4 w-4 me-1" /><SelectValue placeholder="التصنيف" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="approved">معتمد</SelectItem>
            <SelectItem value="cancelled">ملغي</SelectItem>
          </SelectContent>
        </Select>
        <PrintButton
          entityType="report_documents_registry"
          entityId="list"
          size="icon"
          label="طباعة سجل المستندات"
          payload={() => ({
            entity: {
              title: "سجل المستندات",
              total: orderedFiltered.length,
            },
            // مرتّب حسب التصنيف ليطابق العرض المجمّع على الشاشة.
            items: orderedFiltered.map((d: any) => ({
              "العنوان": d.title || "—",
              "الملف": d.fileName || "—",
              "التصنيف": CATEGORIES.find((c) => c.value === d.category)?.label || d.category || "—",
              "الحالة": d.status || "draft",
              "الإصدار": d.currentVersion ? `v${d.currentVersion}` : "v1",
              "التاريخ": d.createdAt ? formatDateAr(d.createdAt) : "—",
            })),
          })}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-muted-foreground text-lg">لا توجد مستندات</p>
            <p className="text-muted-foreground text-sm mt-1">ابدأ برفع مستند جديد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {orderedFiltered.map((d: any, idx: number) => {
            // رأس قسم لكل تصنيف عند عرض «الكل» فقط (يظهر مرة عند بداية كل تصنيف).
            const showHeader =
              categoryFilter === "all" &&
              (idx === 0 || orderedFiltered[idx - 1].category !== d.category);
            return (
            <Fragment key={d.id}>
            {showHeader && (
              <div className="flex items-center gap-2 px-1 pt-3 first:pt-0">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {CATEGORIES.find((c) => c.value === d.category)?.label || "أخرى"}
                </h3>
                <Badge variant="secondary" className="text-[10px]">{countByCat[d.category || "other"] || 0}</Badge>
              </div>
            )}
            <Card key={d.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-status-info-surface flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-status-info-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{d.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {d.fileName && <span className="text-xs text-muted-foreground">{d.fileName}</span>}
                        {d.fileSize && <span className="text-xs text-muted-foreground">({formatSize(d.fileSize)})</span>}
                        {d.createdAt && <span className="text-xs text-muted-foreground">{formatDateAr(d.createdAt)}</span>}
                        {d.currentVersion > 1 && <Badge variant="secondary" className="text-[10px]">v{d.currentVersion}</Badge>}
                      </div>
                      {d.description && <p className="text-xs text-muted-foreground mt-1 truncate">{d.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    <CategoryBadge category={d.category} />
                    <StatusBadgeDoc status={d.status || "draft"} />
                    <div className="flex items-center gap-1">
                      {d.storageKey && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs"
                            onClick={() => window.open(`/api/documents/${d.id}/preview`, "_blank")}
                            title="معاينة"
                          >
                            <Eye className="h-3.5 w-3.5" /> معاينة
                          </Button>
                          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => handleDownload(d.id, d.fileName)}>
                            <Download className="h-3.5 w-3.5" /> تنزيل
                          </Button>
                        </>
                      )}
                      <Button asChild variant="ghost" size="sm" className="gap-1 text-xs"><Link href={`/documents/${d.id}/versions`}>
                          <History className="h-3.5 w-3.5" /> الإصدارات
                        </Link></Button>
                      <GuardedButton perm="documents:update" variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => startEdit(d)}>
                        <Edit className="h-3.5 w-3.5" /> تعديل
                      </GuardedButton>
                      <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setLinksDocId(d.id)}>
                        <Link2 className="h-3.5 w-3.5" /> ربط
                      </Button>
                      {d.status !== "approved" && (
                        <GuardedButton perm="documents:approve" variant="ghost" size="sm" className="gap-1 text-xs text-status-success-foreground" onClick={() => handleStatusChange(d.id, "approved")}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> اعتماد
                        </GuardedButton>
                      )}
                      {d.status !== "cancelled" && d.status !== "draft" && (
                        <GuardedButton perm="documents:delete" variant="ghost" size="sm" className="gap-1 text-xs text-status-error-foreground" onClick={() => handleStatusChange(d.id, "cancelled")}>
                          <XCircle className="h-3.5 w-3.5" /> إلغاء
                        </GuardedButton>
                      )}
                      {d.storageKey && (
                        // Direct anchor — GET /documents/:id/preview returns
                        // an inline-renderable file (the backend sets the
                        // right Content-Type and X-Frame-Options). Opens in
                        // a new tab so the user keeps their list context.
                        <a
                          href={`/api/documents/${d.id}/preview`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs h-8 px-2 hover:bg-accent rounded"
                          title="معاينة"
                        >
                          <Eye className="h-3.5 w-3.5" /> معاينة
                        </a>
                      )}
                      <GuardedButton
                        perm="documents:delete"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs text-status-error-foreground"
                        onClick={() => setDeleting({ id: d.id, title: d.title || d.fileName })}
                        title="حذف نهائياً"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </GuardedButton>
                      {d.status === "cancelled" && (
                        <>
                          <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground" onClick={() => handleStatusChange(d.id, "draft")}>
                            <Clock className="h-3.5 w-3.5" /> مسودة
                          </Button>
                          <GuardedButton perm="documents:delete" variant="ghost" size="sm" className="gap-1 text-xs text-status-error-foreground" onClick={() => setConfirmDeleteId(d.id)}>
                            <Trash2 className="h-3.5 w-3.5" /> حذف نهائي
                          </GuardedButton>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {d.category && CATEGORY_EFFECTS[d.category] && (
                  <div className={cn(
                    "mt-2 pt-2 border-t text-xs flex items-center gap-2",
                    d.status === "approved"
                      ? (CATEGORY_EFFECTS[d.category].severity === "warning" ? "text-status-warning-foreground" : "text-status-info-foreground")
                      : "text-muted-foreground"
                  )}>
                    <span>{CATEGORY_EFFECTS[d.category].icon}</span>
                    <span>
                      {d.status === "approved"
                        ? <><strong>أثر نشط:</strong> {CATEGORY_EFFECTS[d.category].approvedEffect}</>
                        : <><strong>أثر عند الاعتماد:</strong> {CATEGORY_EFFECTS[d.category].approvedEffect}</>
                      }
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
            </Fragment>
            );
          })}
        </div>
      )}

      <Dialog open={editingDoc !== null} onOpenChange={(o) => { if (!o) setEditingDoc(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل بيانات المستند</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label className="text-xs">العنوان *</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">الوصف</Label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDoc(null)}>إلغاء</Button>
            <Button onClick={submitEdit} disabled={renameMut.isPending}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteId !== null} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف النهائي</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            سيتم حذف المستند نهائياً من النظام. هذا الإجراء غير قابل للتراجع.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => {
                if (confirmDeleteId == null) return;
                deleteMut.mutate(confirmDeleteId, { onSuccess: () => setConfirmDeleteId(null) });
              }}
            >
              حذف نهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linksDocId !== null} onOpenChange={(o) => !o && setLinksDocId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ربط المستند بكيانات أخرى</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {linksQ.isLoading ? (
              <p className="text-sm text-muted-foreground">جاري التحميل...</p>
            ) : (
              <>
                {(linksQ.data?.data ?? linksQ.data?.links ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">لا توجد ارتباطات بعد.</p>
                ) : (
                  <div className="space-y-1">
                    {(linksQ.data?.data ?? linksQ.data?.links ?? []).map((l: any, i: number) => (
                      <div key={l.id ?? i} className="flex items-center justify-between text-xs border rounded px-2 py-1">
                        <span><Badge variant="outline" className="text-[10px] me-2">{l.entityType}</Badge>#{l.entityId}</span>
                        {l.entityLabel && <span className="text-muted-foreground">{l.entityLabel}</span>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                  <div>
                    <Label className="text-xs">نوع الكيان</Label>
                    <Input value={linkEntityType} onChange={(e) => setLinkEntityType(e.target.value)} placeholder="invoice / contract / ticket" />
                  </div>
                  <div>
                    <Label className="text-xs">المعرّف</Label>
                    <Input type="number" value={linkEntityId} onChange={(e) => setLinkEntityId(e.target.value)} dir="ltr" />
                  </div>
                </div>
                <GuardedButton perm="documents:update" size="sm" onClick={submitAddLink} disabled={addLinkMut.isPending}>
                  <Plus className="h-3 w-3 me-1" /> إضافة ربط
                </GuardedButton>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinksDocId(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FoldersTab() {
  const { data: foldersResp, isLoading, isError } = useApiQuery<any>(["doc-folders"], "/documents/folders");
  const [showForm, setShowForm] = useState(false);
  const items = asList(foldersResp);

  const createMut = useApiMutation<any, FolderForm>(
    "/documents/folders",
    "POST",
    [["doc-folders"]],
    { successMessage: "تم إنشاء المجلد" },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">المجلدات</h3>
        <GuardedButton perm="documents:create" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة مجلد</>}
        </GuardedButton>
      </div>
      {showForm && (
        <Card><CardContent className="p-4">
          <FormShell
            schema={folderSchema}
            defaultValues={{ name: "", color: "" }}
            submitLabel="حفظ"
            secondaryActions={
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            }
            onSubmit={async (values, ctx) => {
              await createMut.mutateAsync(values);
              ctx.reset();
              setShowForm(false);
            }}
          >
            <FormGrid cols={2}>
              <FormTextField name="name" label="الاسم" required />
              <FormTextField name="color" label="اللون" placeholder="#3B82F6" />
            </FormGrid>
          </FormShell>
        </CardContent></Card>
      )}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <FolderOpen className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <p className="text-muted-foreground">لا توجد مجلدات</p>
          <Button size="sm" className="mt-3" onClick={() => setShowForm(true)}>إضافة مجلد</Button>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((f: any) => (
            <Card key={f.id} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <FolderOpen className="w-8 h-8" style={{ color: f.color || "#3B82F6" }} />
                <div>
                  <span className="font-medium">{f.name}</span>
                  <p className="text-xs text-muted-foreground">{formatDateAr(f.createdAt)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const templateColumns: DataTableColumn<any>[] = [
  { key: "name", header: "القالب", searchable: true, sortable: true, className: "font-medium" },
  { key: "category", header: "التصنيف", searchable: true, sortable: true, className: "text-muted-foreground" },
  { key: "createdAt", header: "التاريخ", sortable: true, render: (t) => formatDateAr(t.createdAt) },
];

function TemplatesTab() {
  const { data: templatesResp, isLoading } = useApiQuery<any>(["doc-templates"], "/documents/templates");
  const [showForm, setShowForm] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const items = asList(templatesResp);
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);

  const createMut = useApiMutation<any, TemplateForm>(
    "/documents/templates",
    "POST",
    [["doc-templates"]],
    { successMessage: "تم إنشاء القالب" },
  );

  // GET /documents/templates/:id + /:id/variables — lazy-fetch the
  // selected template's full body and the list of template variables
  // it supports when the user clicks "عرض" on a row.
  const { data: tplDetailResp } = useApiQuery<any>(
    ["doc-template-detail", String(previewId ?? 0)],
    previewId ? `/documents/templates/${previewId}` : null,
    { enabled: !!previewId },
  );
  const { data: tplVarsResp } = useApiQuery<any>(
    ["doc-template-vars", String(previewId ?? 0)],
    previewId ? `/documents/templates/${previewId}/variables` : null,
    { enabled: !!previewId },
  );
  const tplDetail = tplDetailResp?.data ?? tplDetailResp;
  const tplVars: any[] = tplVarsResp?.data ?? tplVarsResp?.variables ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-end">
        <PrintButton
          entityType="report_document_templates"
          entityId="list"
          size="icon"
          label="طباعة قائمة القوالب"
          payload={() => ({
            entity: {
              title: "قائمة قوالب المستندات",
              total: printRows.length,
            },
            items: printRows.map((t: any) => ({
              "القالب": t.name || "—",
              "التصنيف": t.category || "—",
              "التاريخ": t.createdAt ? formatDateAr(t.createdAt) : "—",
            })),
          })}
        />
        <GuardedButton perm="documents:create" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة قالب</>}
        </GuardedButton>
      </div>
      {showForm && (
        <Card><CardContent className="p-4">
          <FormShell
            schema={templateSchema}
            defaultValues={{ name: "", description: "", category: "" }}
            submitLabel="حفظ"
            secondaryActions={
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            }
            onSubmit={async (values, ctx) => {
              await createMut.mutateAsync(values);
              ctx.reset();
              setShowForm(false);
            }}
          >
            <FormGrid cols={2}>
              <FormTextField name="name" label="الاسم" required />
              <FormTextField name="category" label="التصنيف" />
              <FormTextField name="description" label="الوصف" className="md:col-span-2" />
            </FormGrid>
          </FormShell>
        </CardContent></Card>
      )}
      <DataTable
        columns={templateColumns}
        data={items}
        onSortedDataChange={setPrintRows}
        isLoading={isLoading}
        searchPlaceholder="بحث بالاسم أو التصنيف..."
        emptyMessage="لا توجد قوالب"
        emptyIcon={<FilePlus className="h-8 w-8 text-slate-400" />}
        onRowClick={(row) => setPreviewId((row as any).id)}
      />

      {previewId !== null && (
        <Card className="border-status-info-surface">
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{tplDetail?.name ?? `قالب #${previewId}`}</p>
              <Button variant="ghost" size="sm" onClick={() => setPreviewId(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            {tplDetail?.description && <p className="text-xs text-muted-foreground">{tplDetail.description}</p>}
            {tplDetail?.body && (
              <pre className="text-xs font-mono whitespace-pre-wrap bg-surface-subtle p-2 rounded max-h-40 overflow-y-auto">
                {tplDetail.body.slice(0, 500)}
                {tplDetail.body.length > 500 ? "…" : ""}
              </pre>
            )}
            {tplVars.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1">المتغيرات المتاحة ({tplVars.length}):</p>
                <div className="flex flex-wrap gap-1">
                  {tplVars.slice(0, 30).map((v: any, i: number) => (
                    <span key={i} className="px-2 py-0.5 text-[10px] font-mono bg-status-info-surface text-status-info-foreground rounded">
                      {typeof v === "string" ? v : v.name ?? v.key ?? "—"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function DocumentsPage() {
  const [location] = useLocation();
  const initialTab = location === "/documents/folders" ? "folders" : "documents";
  const { data: stats, isLoading, isError } = useApiQuery<any>(["doc-stats"], "/documents/stats");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const s = stats || {};

  return (
    <PageShell title="إدارة المستندات"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "إدارة المستندات" },
      ]}>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "إجمالي المستندات", value: s.totalDocuments || 0, icon: FileText, color: "text-status-info-foreground bg-status-info-surface" },
          { label: "مسودات", value: s.draftDocuments || 0, icon: Clock, color: "text-muted-foreground bg-surface-subtle" },
          { label: "معتمدة", value: s.approvedDocuments || 0, icon: CheckCircle2, color: "text-status-success-foreground bg-status-success-surface" },
          { label: "المجلدات", value: s.totalFolders || 0, icon: FolderOpen, color: "text-orange-600 bg-orange-50" },
          { label: "القوالب", value: s.totalTemplates || 0, icon: FilePlus, color: "text-purple-600 bg-purple-50" },
        ].map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-muted-foreground">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Tabs defaultValue={initialTab} dir="rtl">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="documents">المستندات</TabsTrigger>
          <TabsTrigger value="folders">المجلدات</TabsTrigger>
          <TabsTrigger value="templates">القوالب</TabsTrigger>
        </TabsList>
        <TabsContent value="documents"><DocumentsList /></TabsContent>
        <TabsContent value="folders"><FoldersTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
