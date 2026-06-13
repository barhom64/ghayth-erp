import { useState, useCallback } from "react";
import { useFormContext } from "react-hook-form";
import { z } from "zod";
import DOMPurify from "dompurify";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PageShell,
  FormShell,
  FormGrid,
  FormTextField,
  FormSelectField,
  FormTextareaField,
} from "@workspace/ui-core";
import { FileText, Copy, Search, Layout, Plus, Eye, Edit, Trash2, X, Save, Printer, ChevronLeft, Variable } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery, useApiMutation, asList, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PrintPreviewModal } from "@workspace/report-kit";
import { useBranchLetterhead } from "@/hooks/use-branch-letterhead";
import { useAuth } from "@/lib/auth";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useToast } from "@/hooks/use-toast";

const templateSchema = z.object({
  name: z.string().min(1, "اسم القالب مطلوب"),
  description: z.string(),
  content: z.string(),
  category: z.string(),
  type: z.string(),
  htmlContent: z.string(),
  branchId: z.string(),
  signatureUrl: z.string(),
});
type TemplateValues = z.infer<typeof templateSchema>;

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

type Variable = { key: string; label: string };

interface EditorSeed {
  values: TemplateValues;
  variables: Variable[];
  isActive: boolean;
}

const EMPTY_EDITOR_SEED: EditorSeed = {
  values: {
    name: "",
    description: "",
    content: "",
    category: "general",
    type: "letter",
    htmlContent: "",
    branchId: "_none",
    signatureUrl: "",
  },
  variables: [],
  isActive: true,
};

const CATEGORY_OPTIONS = Object.entries({
  hr: "الموارد البشرية",
  general: "عام",
  sales: "المبيعات",
  finance: "المالية",
}).map(([value, label]) => ({ value, label }));

const TYPE_OPTIONS = Object.entries({
  letter: "خطاب",
  certificate: "شهادة/تعريف",
  clearance: "إخلاء طرف",
  warning: "إنذار",
  decision: "قرار",
  contract: "عقد",
  quotation: "عرض سعر",
}).map(([value, label]) => ({ value, label }));

const COMMON_VARIABLES: Variable[] = [
  { key: "employee.name", label: "اسم الموظف" },
  { key: "employee.empNumber", label: "رقم وظيفي" },
  { key: "employee.jobTitle", label: "المسمى" },
  { key: "salary.basic", label: "الراتب" },
  { key: "company.name", label: "الشركة" },
  { key: "date.today", label: "اليوم" },
];

// Save button + preview button: both live in the page header but need
// access to the form context. They submit by `type="submit"` (button
// nested in <form> wrapper) or read getValues() for live preview.
function EditorHeaderActions({
  editingId,
  onBack,
  onPreview,
}: {
  editingId: number | null;
  onBack: () => void;
  onPreview: (values: TemplateValues) => void;
}) {
  const { getValues, formState, watch } = useFormContext<TemplateValues>();
  const htmlContent = watch("htmlContent");
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 me-1" />رجوع
        </Button>
        <h1 className="text-2xl font-bold">{editingId ? "تعديل القالب" : "إنشاء قالب جديد"}</h1>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => onPreview(getValues())} disabled={!htmlContent}>
          <Eye className="h-4 w-4 me-1" />معاينة
        </Button>
        <GuardedButton type="submit" perm="documents:create" rateLimitAware disabled={formState.isSubmitting}>
          <Save className="h-4 w-4 me-1" />
          {formState.isSubmitting ? "جاري الحفظ..." : "حفظ"}
        </GuardedButton>
      </div>
    </div>
  );
}

// Variables panel: writes to htmlContent via setValue when the operator
// clicks an existing/common variable to insert it into the body.
function VariablesPanel({
  variables,
  setVariables,
  newVarKey,
  setNewVarKey,
  newVarLabel,
  setNewVarLabel,
}: {
  variables: Variable[];
  setVariables: (next: Variable[]) => void;
  newVarKey: string;
  setNewVarKey: (v: string) => void;
  newVarLabel: string;
  setNewVarLabel: (v: string) => void;
}) {
  const { getValues, setValue } = useFormContext<TemplateValues>();

  const insertVariable = (key: string) => {
    const current = getValues("htmlContent") ?? "";
    setValue("htmlContent", `${current}{{${key}}}`, { shouldDirty: true });
  };

  const addVariable = () => {
    if (!newVarKey || !newVarLabel) return;
    setVariables([...variables, { key: newVarKey, label: newVarLabel }]);
    setNewVarKey("");
    setNewVarLabel("");
  };

  const removeVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Variable className="h-5 w-5" />المتغيرات المتاحة</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {variables.map((v, i) => (
              <div key={i} className="flex items-center justify-between gap-2 p-2 rounded border bg-surface-subtle text-sm">
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    className="font-mono text-xs text-status-info-foreground hover:underline cursor-pointer"
                    onClick={() => insertVariable(v.key)}
                    title="إدراج في المحتوى"
                  >
                    {`{{${v.key}}}`}
                  </button>
                  <span className="text-muted-foreground text-xs block">{v.label}</span>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-status-error-foreground" onClick={() => removeVariable(i)}>
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
            <GuardedButton type="button" perm="documents:create" variant="outline" size="sm" className="w-full" onClick={addVariable} disabled={!newVarKey || !newVarLabel}>
              <Plus className="h-3 w-3 me-1" />إضافة متغير
            </GuardedButton>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">المتغيرات الشائعة</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1">
            {COMMON_VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                className="text-xs px-2 py-1 bg-status-info-surface text-status-info-foreground rounded hover:bg-status-info-surface transition-colors"
                onClick={() => {
                  insertVariable(v.key);
                  if (!variables.find((fv) => fv.key === v.key)) {
                    setVariables([...variables, v]);
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
  );
}

export default function DocumentsTemplates() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editorSeed, setEditorSeed] = useState<EditorSeed>(EMPTY_EDITOR_SEED);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [isActive, setIsActive] = useState(true);
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
      let vars: Variable[] = [];
      try { vars = typeof template.variables === "string" ? JSON.parse(template.variables) : (template.variables || []); } catch { vars = []; }
      setEditorSeed({
        values: {
          name: template.name || "",
          description: template.description || "",
          content: template.content || "",
          category: template.category || "general",
          type: template.type || "letter",
          htmlContent: template.htmlContent || "",
          branchId: template.branchId ? String(template.branchId) : "_none",
          signatureUrl: template.signatureUrl || "",
        },
        variables: vars,
        isActive: template.isActive !== false,
      });
      setVariables(vars);
      setIsActive(template.isActive !== false);
      setEditingId(template.id);
    } else {
      setEditorSeed(EMPTY_EDITOR_SEED);
      setVariables([]);
      setIsActive(true);
      setEditingId(null);
    }
    setNewVarKey("");
    setNewVarLabel("");
    setViewMode("editor");
  }, []);

  const handleSave = async (values: TemplateValues) => {
    const payload = {
      ...values,
      variables,
      isActive,
      branchId: values.branchId === "_none" ? null : Number(values.branchId),
    };
    try {
      if (editingId) {
        await apiFetch(`/documents/templates/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast({ title: "تم تحديث القالب بنجاح" });
      } else {
        await createMut.mutateAsync(payload as any);
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

  // Substitutes {{key}} placeholders with sample values built from the
  // current variables list so the operator gets a realistic preview
  // before save.
  const handleLivePreview = (values: TemplateValues) => {
    const html = values.htmlContent || "";
    const sampleData: Record<string, any> = {};
    variables.forEach((v) => {
      const parts = v.key.split(".");
      if (parts.length === 2) {
        if (!sampleData[parts[0]]) sampleData[parts[0]] = {};
        sampleData[parts[0]][parts[1]] = `[${v.label}]`;
      }
    });
    const filled = html.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
      const parts = key.split(".");
      let value: any = sampleData;
      for (const part of parts) {
        if (value == null) return match;
        value = value[part];
      }
      return value != null ? String(value) : match;
    });
    setPreviewHtml(filled);
    setPreviewTitle(values.name || "معاينة القالب");
    setPreviewOpen(true);
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  if (viewMode === "editor") {
    const branchOptions = [
      { value: "_none", label: "جميع الفروع" },
      ...branches.map((b: any) => ({ value: String(b.id), label: b.name })),
    ];
    return (
      <FormShell
        key={`editor-${editingId ?? "new"}`}
        schema={templateSchema}
        defaultValues={editorSeed.values}
        hideSubmit
        className="space-y-6"
        onSubmit={handleSave}
      >
        <EditorHeaderActions
          editingId={editingId}
          onBack={() => { setViewMode("list"); setEditingId(null); }}
          onPreview={handleLivePreview}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-lg">معلومات القالب</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormGrid cols={2}>
                  <FormTextField name="name" label="اسم القالب" placeholder="مثال: تعريف بالراتب" required />
                  <FormTextField name="content" label="المعرف" placeholder="salary_certificate" />
                </FormGrid>
                <FormTextField name="description" label="الوصف" placeholder="وصف مختصر للقالب" />
                <FormGrid cols={2}>
                  <FormSelectField name="category" label="التصنيف" options={CATEGORY_OPTIONS} />
                  <FormSelectField name="type" label="النوع" options={TYPE_OPTIONS} />
                </FormGrid>
                <FormGrid cols={2}>
                  <FormSelectField name="branchId" label="الفرع (اختياري)" options={branchOptions} />
                  <FormTextField name="signatureUrl" label="رابط التوقيع (اختياري)" placeholder="https://..." />
                </FormGrid>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">محتوى القالب</CardTitle></CardHeader>
              <CardContent>
                <FormTextareaField
                  name="htmlContent"
                  label=""
                  rows={12}
                  className="font-mono text-sm"
                  placeholder='<div style="line-height:2">&#10;  <p>السيد/ة: <strong>{{employee.name}}</strong></p>&#10;</div>'
                  description="استخدم {{variable.name}} لإدراج المتغيرات الديناميكية"
                />
              </CardContent>
            </Card>
          </div>

          <VariablesPanel
            variables={variables}
            setVariables={setVariables}
            newVarKey={newVarKey}
            setNewVarKey={setNewVarKey}
            newVarLabel={newVarLabel}
            setNewVarLabel={setNewVarLabel}
          />
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
      </FormShell>
    );
  }

  return (
    <PageShell
      title="مركز القوالب"
      breadcrumbs={[{ href: "/dashboard", label: "لوحة التحكم" }, { href: "/documents", label: "الوثائق" }, { label: "مركز القوالب" }]}
      actions={
        <GuardedButton perm="documents:create" className="gap-2" onClick={() => openEditor()}>
          <Plus className="h-4 w-4" /> إضافة قالب
        </GuardedButton>
      }
    >
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
    </PageShell>
  );
}
