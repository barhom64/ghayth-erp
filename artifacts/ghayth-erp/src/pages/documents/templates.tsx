import { useState, useCallback } from "react";
import DOMPurify from "dompurify";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Copy, Search, Layout, Plus, Eye, Edit, Trash2, X, Save, Printer, ChevronLeft, Variable } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery, useApiMutation, asList, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PrintPreviewModal } from "@/components/print-layout";
import { useBranchLetterhead } from "@/hooks/use-branch-letterhead";
import { useAuth } from "@/lib/auth";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useToast } from "@/hooks/use-toast";

const typeLabels: Record<string, string> = {
  letter: "خطاب",
  certificate: "شهادة/تعريف",
  clearance: "إخلاء طرف",
  warning: "إنذار",
  decision: "قرار",
  contract: "عقد",
  quotation: "عرض سعر",
};

const categoryLabels: Record<string, string> = {
  hr: "الموارد البشرية",
  general: "عام",
  sales: "المبيعات",
  finance: "المالية",
};

const categoryColors: Record<string, string> = {
  hr: "bg-status-info-surface text-status-info-foreground",
  general: "bg-surface-subtle text-status-neutral-foreground",
  sales: "bg-status-success-surface text-status-success-foreground",
  finance: "bg-status-warning-surface text-status-warning-foreground",
};

type ViewMode = "list" | "editor" | "preview";

interface TemplateForm {
  name: string;
  description: string;
  content: string;
  category: string;
  type: string;
  htmlContent: string;
  variables: Array<{ key: string; label: string }>;
  branchId: number | null;
  signatureUrl: string;
  isActive: boolean;
}

const emptyForm: TemplateForm = {
  name: "",
  description: "",
  content: "",
  category: "general",
  type: "letter",
  htmlContent: "",
  variables: [],
  branchId: null,
  signatureUrl: "",
  isActive: true,
};

export default function DocumentsTemplates() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [newVarKey, setNewVarKey] = useState("");
  const [newVarLabel, setNewVarLabel] = useState("");

  const { data: templatesResp, refetch, isLoading, isError } = useApiQuery<any>(["doc-templates"], "/documents/templates");
  const templates = asList<any>(templatesResp);
  const { toast } = useToast();
  const { user } = useAuth();
  const branch = useBranchLetterhead(user?.branchId);

  const createMut = useApiMutation("/documents/templates", "POST", [["doc-templates"]]);
  const { data: branchesResp } = useApiQuery<any>(["branches"], "/settings/branches");
  const branches = asList<any>(branchesResp);

  const statCards = [
    { label: "إجمالي القوالب", value: templates.length, icon: Layout, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "قوالب جاهزة", value: templates.filter((t: any) => t.isDefault).length, icon: Copy, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "قوالب نشطة", value: templates.filter((t: any) => t.isActive !== false).length, icon: FileText, color: "text-purple-600 bg-purple-50" },
  ];

  const filtered = templates.filter((t: any) => {
    if (search && !t.name?.includes(search) && !t.category?.includes(search)) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    return true;
  });

  const openEditor = useCallback((template?: any) => {
    if (template) {
      let vars = [];
      try { vars = typeof template.variables === "string" ? JSON.parse(template.variables) : (template.variables || []); } catch { vars = []; }
      setForm({
        name: template.name || "",
        description: template.description || "",
        content: template.content || "",
        category: template.category || "general",
        type: template.type || "letter",
        htmlContent: template.htmlContent || "",
        variables: vars,
        branchId: template.branchId || null,
        signatureUrl: template.signatureUrl || "",
        isActive: template.isActive !== false,
      });
      setEditingId(template.id);
    } else {
      setForm(emptyForm);
      setEditingId(null);
    }
    setViewMode("editor");
  }, []);

  const handleSave = async () => {
    if (!form.name) { toast({ variant: "destructive", title: "اسم القالب مطلوب" }); return; }
    try {
      if (editingId) {
        await apiFetch(`/documents/templates/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        toast({ title: "تم تحديث القالب بنجاح" });
      } else {
        await createMut.mutateAsync(form as any);
        toast({ title: "تم إنشاء القالب بنجاح" });
      }
      refetch();
      setViewMode("list");
      setEditingId(null);
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء الحفظ" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/documents/templates/${id}`, { method: "DELETE" });
      toast({ title: "تم حذف القالب" });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء الحذف" });
    }
  };

  const handlePreview = async (template: any) => {
    try {
      const result = await apiFetch<any>(`/documents/templates/${template.id}/generate`, {
        method: "POST",
        body: JSON.stringify({ entityType: null, entityId: null }),
      });
      setPreviewHtml(result.html || template.htmlContent || "");
      setPreviewTitle(template.name);
      setPreviewOpen(true);
    } catch {
      setPreviewHtml(template.htmlContent || template.content || "");
      setPreviewTitle(template.name);
      setPreviewOpen(true);
    }
  };

  const handleLivePreview = () => {
    const html = form.htmlContent || "";
    const sampleData: Record<string, any> = {};
    form.variables.forEach((v) => {
      const parts = v.key.split(".");
      if (parts.length === 2) {
        if (!sampleData[parts[0]]) sampleData[parts[0]] = {};
        sampleData[parts[0]][parts[1]] = `[${v.label}]`;
      }
    });
    let filled = html;
    filled = filled.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
      const parts = key.split(".");
      let value: any = sampleData;
      for (const part of parts) {
        if (value == null) return match;
        value = value[part];
      }
      return value != null ? String(value) : match;
    });
    setPreviewHtml(filled);
    setPreviewTitle(form.name || "معاينة القالب");
    setPreviewOpen(true);
  };

  const addVariable = () => {
    if (!newVarKey || !newVarLabel) return;
    setForm((prev) => ({
      ...prev,
      variables: [...prev.variables, { key: newVarKey, label: newVarLabel }],
    }));
    setNewVarKey("");
    setNewVarLabel("");
  };

  const removeVariable = (index: number) => {
    setForm((prev) => ({
      ...prev,
      variables: prev.variables.filter((_, i) => i !== index),
    }));
  };

  const insertVariable = (key: string) => {
    setForm((prev) => ({
      ...prev,
      htmlContent: prev.htmlContent + `{{${key}}}`,
    }));
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  if (viewMode === "editor") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setViewMode("list"); setEditingId(null); }}>
              <ChevronLeft className="h-4 w-4 me-1" />رجوع
            </Button>
            <h1 className="text-2xl font-bold">{editingId ? "تعديل القالب" : "إنشاء قالب جديد"}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleLivePreview} disabled={!form.htmlContent}>
              <Eye className="h-4 w-4 me-1" />معاينة
            </Button>
            <GuardedButton perm="documents:create" onClick={handleSave} rateLimitAware>
              <Save className="h-4 w-4 me-1" />حفظ
            </GuardedButton>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-lg">معلومات القالب</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>اسم القالب *</Label>
                    <Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: تعريف بالراتب" />
                  </div>
                  <div>
                    <Label>المعرف</Label>
                    <Input className="mt-1" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="salary_certificate" />
                  </div>
                </div>
                <div>
                  <Label>الوصف</Label>
                  <Input className="mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="وصف مختصر للقالب" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>التصنيف</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(categoryLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>النوع</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(typeLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>الفرع (اختياري)</Label>
                    <Select value={form.branchId ? String(form.branchId) : "none"} onValueChange={(v) => setForm({ ...form, branchId: v === "none" ? null : Number(v) })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">جميع الفروع</SelectItem>
                        {branches.map((b: any) => (
                          <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>رابط التوقيع (اختياري)</Label>
                    <Input className="mt-1" value={form.signatureUrl} onChange={(e) => setForm({ ...form, signatureUrl: e.target.value })} placeholder="https://..." dir="ltr" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">محتوى القالب</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  className="mt-1 font-mono text-sm min-h-[300px]"
                  dir="ltr"
                  value={form.htmlContent}
                  onChange={(e) => setForm({ ...form, htmlContent: e.target.value })}
                  placeholder='<div style="line-height:2">&#10;  <p>السيد/ة: <strong>{{employee.name}}</strong></p>&#10;</div>'
                />
                <p className="text-xs text-muted-foreground mt-2">استخدم {"{{variable.name}}"} لإدراج المتغيرات الديناميكية</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Variable className="h-5 w-5" />المتغيرات المتاحة</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {form.variables.map((v, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 p-2 rounded border bg-surface-subtle text-sm">
                      <div className="flex-1 min-w-0">
                        <button
                          className="font-mono text-xs text-status-info-foreground hover:underline cursor-pointer"
                          onClick={() => insertVariable(v.key)}
                          title="إدراج في المحتوى"
                        >
                          {`{{${v.key}}}`}
                        </button>
                        <span className="text-muted-foreground text-xs block">{v.label}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-status-error-foreground" onClick={() => removeVariable(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input size={1} placeholder="المفتاح" value={newVarKey} onChange={(e) => setNewVarKey(e.target.value)} className="text-xs" dir="ltr" />
                    <Input size={1} placeholder="التسمية" value={newVarLabel} onChange={(e) => setNewVarLabel(e.target.value)} className="text-xs" />
                  </div>
                  <GuardedButton perm="documents:create" variant="outline" size="sm" className="w-full" onClick={addVariable} disabled={!newVarKey || !newVarLabel}>
                    <Plus className="h-3 w-3 me-1" />إضافة متغير
                  </GuardedButton>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">المتغيرات الشائعة</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {[
                    { key: "employee.name", label: "اسم الموظف" },
                    { key: "employee.empNumber", label: "رقم وظيفي" },
                    { key: "employee.jobTitle", label: "المسمى" },
                    { key: "salary.basic", label: "الراتب" },
                    { key: "company.name", label: "الشركة" },
                    { key: "date.today", label: "اليوم" },
                  ].map((v) => (
                    <button
                      key={v.key}
                      className="text-xs px-2 py-1 bg-status-info-surface text-status-info-foreground rounded hover:bg-status-info-surface transition-colors"
                      onClick={() => {
                        insertVariable(v.key);
                        if (!form.variables.find((fv) => fv.key === v.key)) {
                          setForm((prev) => ({
                            ...prev,
                            variables: [...prev.variables, v],
                          }));
                        }
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {previewOpen && (
          <PrintPreviewModal
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            branch={branch}
            documentTitle={previewTitle}
            documentRef=""
            documentDate={formatDateAr(new Date())}
          >
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }} />
          </PrintPreviewModal>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">مركز القوالب</h1>
        <GuardedButton perm="documents:create" className="gap-2" onClick={() => openEditor()}>
          <Plus className="h-4 w-4" /> إضافة قالب
        </GuardedButton>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                  <Icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
                </div>
                <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-muted-foreground">{c.label}</p></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث في القوالب..." value={search} onChange={(e) => setSearch(e.target.value)} className="ps-10" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع التصنيفات</SelectItem>
            {Object.entries(categoryLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((t: any) => (
          <Card key={t.id} className="border hover:shadow-md transition-shadow group">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-status-info-surface flex items-center justify-center">
                    <FileText className="w-5 h-5 text-status-info-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{t.name || "-"}</h3>
                    <p className="text-xs text-muted-foreground">{typeLabels[t.type] || t.type || "-"}</p>
                  </div>
                </div>
                {t.isDefault && <Badge className="bg-status-warning-surface text-status-warning-foreground text-[10px]">مسبق</Badge>}
              </div>
              {t.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{t.description}</p>}
              <div className="flex items-center justify-between">
                <Badge className={cn("text-[10px]", categoryColors[t.category] || "bg-surface-subtle text-status-neutral-foreground")}>
                  {categoryLabels[t.category] || t.category || "-"}
                </Badge>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handlePreview(t)} title="معاينة">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <GuardedButton perm="documents:create" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditor(t)} title="تعديل">
                    <Edit className="h-3.5 w-3.5" />
                  </GuardedButton>
                  {!t.isDefault && (
                    <GuardedButton perm="documents:create" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-status-error-foreground" onClick={() => handleDelete(t.id)} title="حذف">
                      <Trash2 className="h-3.5 w-3.5" />
                    </GuardedButton>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>لا توجد قوالب</p>
          </div>
        )}
      </div>

      {previewOpen && (
        <PrintPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          branch={branch}
          documentTitle={previewTitle}
          documentRef=""
          documentDate={formatDateAr(new Date())}
        >
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }} />
        </PrintPreviewModal>
      )}
    </div>
  );
}
