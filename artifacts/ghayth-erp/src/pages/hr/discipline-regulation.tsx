import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton, usePermission } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BookOpen, Pencil, RefreshCw, AlertTriangle } from "lucide-react";
import {
  PageShell,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const articleFormSchema = z.object({
  title: z.string().min(1, "الوصف مطلوب"),
  penalty1: z.string().optional(),
  penalty2: z.string().optional(),
  penalty3: z.string().optional(),
  penalty4: z.string().optional(),
  extraDeduction: z.string().optional(),
  legalReference: z.string().optional(),
});
type ArticleForm = z.infer<typeof articleFormSchema>;

const SECTION_LABELS: Record<string, string> = {
  work_time: "مخالفات تتعلق بمواعيد العمل",
  work_organization: "مخالفات تتعلق بتنظيم العمل",
  conduct: "مخالفات تتعلق بسلوك العامل",
};

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-status-success-surface text-status-success-foreground",
  medium: "bg-status-warning-surface text-status-warning-foreground",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-status-error-surface text-status-error-foreground",
};

interface Article {
  id: number;
  section: string;
  articleNumber: number;
  title: string;
  description?: string;
  penalty1?: string;
  penalty2?: string;
  penalty3?: string;
  penalty4?: string;
  extraDeduction?: string;
  severity: string;
  isTermination: boolean;
  legalReference?: string;
  isActive: boolean;
}

export default function DisciplineRegulationPage() {
  const { data, isLoading, isError } = useApiQuery<{
    data: Article[];
    grouped: Record<string, Article[]>;
    sections: Record<string, string>;
    effectiveFrom: string;
    total: number;
  }>(["discipline-regulation"], "/hr/discipline/regulation");
  const [editing, setEditing] = useState<Article | null>(null);
  const canEdit = usePermission("hr:create");
  // BUG FIX: this was declared after the early returns below, which violates
  // Rules of Hooks (the hook count differs between render passes once data
  // arrives → "Invalid hook call" + "change in order of Hooks" errors). Must
  // stay above any conditional return.
  const [reseedAsk, setReseedAsk] = useState(false);

  const grouped = data?.grouped ?? { work_time: [], work_organization: [], conduct: [] };
  const total = data?.total ?? 0;

  const saveMut = useApiMutation<any, { id: number } & Partial<Article>>(
    (body) => `/hr/discipline/regulation/${body.id}`,
    "PATCH",
    [["discipline-regulation"]],
    {
      successMessage: "تم تحديث المادة",
      onSuccess: () => setEditing(null),
    }
  );
  const saving = saveMut.isPending;

  const reseedMut = useApiMutation<{ ok: boolean; inserted: number }, Record<string, never>>(
    "/hr/discipline/regulation/reseed",
    "POST",
    [["discipline-regulation"]],
    { successMessage: "تم استنساخ اللائحة الافتراضية" }
  );
  const reseeding = reseedMut.isPending;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleEditSubmit = async (values: ArticleForm) => {
    if (!editing) return;
    await saveMut.mutateAsync({
      id: editing.id,
      title: values.title,
      penalty1: values.penalty1 || null,
      penalty2: values.penalty2 || null,
      penalty3: values.penalty3 || null,
      penalty4: values.penalty4 || null,
      extraDeduction: values.extraDeduction || null,
      severity: editing.severity,
      isTermination: editing.isTermination,
      legalReference: values.legalReference || null,
    } as any);
  };

  // Native confirm() was unreadable in RTL + dark mode. The
  // AlertDialog below preserves the same yes/no flow with proper
  // localised buttons. (reseedAsk state declared above the early
  // returns to satisfy Rules of Hooks.)
  const reseedDefaults = () => {
    setReseedAsk(true);
  };

  const renderArticle = (a: Article) => (
    <div key={a.id} className="border rounded-lg p-4 hover:bg-surface-subtle transition">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className="font-mono">#{a.articleNumber}</Badge>
            <Badge className={SEVERITY_STYLES[a.severity] ?? ""}>{a.severity}</Badge>
            {a.isTermination && (
              <Badge className="bg-red-600 text-white gap-1">
                <AlertTriangle className="w-3 h-3" /> تؤدي إلى الفصل
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium leading-6">{a.title}</p>
          {a.legalReference && (
            <p className="text-xs text-muted-foreground mt-1">📖 {a.legalReference}</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
            <div className="bg-surface-subtle rounded p-2">
              <div className="text-muted-foreground mb-0.5">أول مرة</div>
              <div className="font-medium">{a.penalty1 || "—"}</div>
            </div>
            <div className="bg-surface-subtle rounded p-2">
              <div className="text-muted-foreground mb-0.5">ثاني مرة</div>
              <div className="font-medium">{a.penalty2 || "—"}</div>
            </div>
            <div className="bg-surface-subtle rounded p-2">
              <div className="text-muted-foreground mb-0.5">ثالث مرة</div>
              <div className="font-medium">{a.penalty3 || "—"}</div>
            </div>
            <div className="bg-surface-subtle rounded p-2">
              <div className="text-muted-foreground mb-0.5">رابع مرة</div>
              <div className="font-medium">{a.penalty4 || "—"}</div>
            </div>
          </div>
          {a.extraDeduction && (
            <p className="text-xs text-orange-700 mt-2">+ {a.extraDeduction}</p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
          <Pencil className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <PageShell
      title="لائحة الانضباط الوظيفي"
      subtitle={`الكتالوج الحي للمخالفات والجزاءات — سارية من ${data?.effectiveFrom ?? "2024-10-01"} (${total} مادة)`}
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/violations", label: "المخالفات والجزاءات" },
        { label: "لائحة الانضباط الوظيفي" },
      ]}
      loading={isLoading}
      actions={
        <GuardedButton perm="hr:create" variant="outline" onClick={reseedDefaults} disabled={reseeding}>
          <RefreshCw className={`w-4 h-4 me-2 ${reseeding ? "animate-spin" : ""}`} />
          استنساخ اللائحة الافتراضية
        </GuardedButton>
      }
    >
      <Tabs defaultValue="work_time" dir="rtl">
        <TabsList>
          {Object.entries(SECTION_LABELS).map(([key, label]) => (
            <TabsTrigger key={key} value={key}>
              {label} ({grouped[key]?.length ?? 0})
            </TabsTrigger>
          ))}
        </TabsList>
        {Object.entries(SECTION_LABELS).map(([key, label]) => (
          <TabsContent key={key} value={key}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل...</p>}
                {!isLoading && (grouped[key]?.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">لا توجد مواد. اضغط "استنساخ اللائحة الافتراضية" أعلاه.</p>
                )}
                {grouped[key]?.map(renderArticle)}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تحرير المادة #{editing?.articleNumber}</DialogTitle>
          </DialogHeader>
          {editing && (
            <FormShell
              key={editing.id}
              schema={articleFormSchema}
              defaultValues={{
                title: editing.title,
                penalty1: editing.penalty1 ?? "",
                penalty2: editing.penalty2 ?? "",
                penalty3: editing.penalty3 ?? "",
                penalty4: editing.penalty4 ?? "",
                extraDeduction: editing.extraDeduction ?? "",
                legalReference: editing.legalReference ?? "",
              }}
              submitLabel={saving ? "جاري الحفظ..." : "حفظ"}
              disabled={!canEdit}
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                  إلغاء
                </Button>
              }
              onSubmit={handleEditSubmit}
            >
              <FormTextareaField name="title" label="الوصف" required rows={3} />
              <FormGrid cols={2}>
                <FormTextField name="penalty1" label="أول مرة" />
                <FormTextField name="penalty2" label="ثاني مرة" />
                <FormTextField name="penalty3" label="ثالث مرة" />
                <FormTextField name="penalty4" label="رابع مرة" />
              </FormGrid>
              <FormTextField name="extraDeduction" label="حسم إضافي" placeholder="مثال: بالإضافة إلى حسم أجر دقائق التأخر" />
              <FormTextField name="legalReference" label="مرجع نظامي" />
            </FormShell>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={reseedAsk} onOpenChange={(v) => { if (!v) setReseedAsk(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>استنساخ اللائحة الافتراضية</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم استنساخ اللائحة الافتراضية (49 مادة) للشركة. هل تريد المتابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReseedAsk(false)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setReseedAsk(false);
                reseedMut.mutate({});
              }}
            >
              استنساخ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
