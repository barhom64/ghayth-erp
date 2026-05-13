import { useState } from "react";
import { z } from "zod";
import { Link } from "wouter";
import { PageShell } from "@/components/page-shell";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FormShell, FormTextField, FormGrid } from "@/components/form-shell";

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
import { PageStatusBadge } from "@/components/page-status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, FolderOpen, FilePlus, X, Upload, Download, History,
  CheckCircle2, Clock, XCircle, Filter, Search, Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";

const CATEGORIES = [
  { value: "contracts", label: "عقود" },
  { value: "official", label: "وثائق رسمية" },
  { value: "financial", label: "مالية" },
  { value: "hr", label: "موارد بشرية" },
  { value: "legal", label: "قانونية" },
  { value: "other", label: "أخرى" },
];

const CATEGORY_EFFECTS: Record<string, { icon: string; approvedEffect: string; severity: "info" | "warning" | "success" }> = {
  contracts: { icon: "📜", approvedEffect: "اعتماد العقد يُنشئ التزاماً قانونياً ومالياً رسمياً للشركة", severity: "warning" },
  financial: { icon: "💰", approvedEffect: "اعتماد المستند المالي يُفعّل ذمة مالية أو مطالبة", severity: "warning" },
  official: { icon: "🏛️", approvedEffect: "اعتماد الوثيقة الرسمية يُبدأ إجراءً رسمياً", severity: "info" },
  hr: { icon: "👤", approvedEffect: "اعتماد وثيقة الموارد البشرية يُحدّث ملف الموظف", severity: "info" },
  legal: { icon: "⚖️", approvedEffect: "اعتماد المستند القانوني يُفعّل التزاماً قانونياً", severity: "warning" },
  other: { icon: "📄", approvedEffect: "اعتماد المستند يُبدأ تأثيره المرتبط", severity: "info" },
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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


function DocumentsList() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

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

  const statusMut = useApiMutation<any, { id: number; status: string }>(
    (body) => `/documents/${body.id}/status`,
    "PATCH",
    [["documents"], ["doc-stats"]],
    { successMessage: "تم تحديث الحالة" }
  );
  const handleStatusChange = (docId: number, newStatus: string) => {
    statusMut.mutate({ id: docId, status: newStatus });
  };

  const handleDownload = async (docId: number, fileName: string) => {
    try {
      const res = await fetch(`${BASE}/api/documents/${docId}/download`, {
        credentials: "include",
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
          {filtered.map((d: any) => (
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
                        <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => handleDownload(d.id, d.fileName)}>
                          <Download className="h-3.5 w-3.5" /> تنزيل
                        </Button>
                      )}
                      <Link href={`/documents/${d.id}/versions`}>
                        <Button variant="ghost" size="sm" className="gap-1 text-xs">
                          <History className="h-3.5 w-3.5" /> الإصدارات
                        </Button>
                      </Link>
                      {d.status !== "approved" && (
                        <GuardedButton perm="documents:approve" variant="ghost" size="sm" className="gap-1 text-xs text-status-success-foreground" onClick={() => handleStatusChange(d.id, "approved")}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> اعتماد
                        </GuardedButton>
                      )}
                      {d.status !== "cancelled" && d.status !== "draft" && (
                        <GuardedButton perm="documents:delete" variant="ghost" size="sm" className="gap-1 text-xs text-red-600" onClick={() => handleStatusChange(d.id, "cancelled")}>
                          <XCircle className="h-3.5 w-3.5" /> إلغاء
                        </GuardedButton>
                      )}
                      {d.status === "cancelled" && (
                        <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground" onClick={() => handleStatusChange(d.id, "draft")}>
                          <Clock className="h-3.5 w-3.5" /> مسودة
                        </Button>
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
          ))}
        </div>
      )}
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
  const items = asList(templatesResp);

  const createMut = useApiMutation<any, TemplateForm>(
    "/documents/templates",
    "POST",
    [["doc-templates"]],
    { successMessage: "تم إنشاء القالب" },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 justify-end">
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
        isLoading={isLoading}
        searchPlaceholder="بحث بالاسم أو التصنيف..."
        emptyMessage="لا توجد قوالب"
        emptyIcon={<FilePlus className="h-8 w-8 text-slate-400" />}
      />
    </div>
  );
}

export default function DocumentsPage() {
  const { data: stats, isLoading, isError } = useApiQuery<any>(["doc-stats"], "/documents/stats");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const s = stats || {};

  return (
    <PageShell title="إدارة المستندات">
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
      <Tabs defaultValue="documents" dir="rtl">
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
