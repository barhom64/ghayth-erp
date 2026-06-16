import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Pencil, RefreshCw, AlertTriangle, Trash2, Plus, Eye } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
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

  // DELETE /hr/discipline/regulation/:id — soft-deletes a single article
  // from the live catalogue. The reseed action above can restore the
  // factory copy if too many are removed.
  const deleteMut = useApiMutation<unknown, number>(
    (id) => `/hr/discipline/regulation/${id}`,
    "DELETE",
    [["discipline-regulation"]],
    { successMessage: "تم حذف المادة" },
  );

  // POST /hr/discipline/regulation — add a new article. Used when a
  // company-specific rule needs to be captured alongside the default
  // 49-article seed.
  const { toast: regToast } = useToast();
  const createMut = useApiMutation<unknown, {
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
    isTermination?: boolean;
    legalReference?: string;
  }>(
    "/hr/discipline/regulation",
    "POST",
    [["discipline-regulation"]],
    { successMessage: "تمت إضافة المادة" },
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [newArt, setNewArt] = useState({
    section: "work_time",
    articleNumber: "",
    title: "",
    severity: "medium",
    isTermination: false,
    penalty1: "",
    penalty2: "",
    penalty3: "",
    penalty4: "",
    extraDeduction: "",
    legalReference: "",
  });
  const submitCreate = () => {
    const num = Number(newArt.articleNumber);
    if (!newArt.title.trim() || !Number.isFinite(num) || num <= 0) {
      regToast({ variant: "destructive", title: "العنوان ورقم المادة مطلوبان" });
      return;
    }
    createMut.mutate(
      {
        section: newArt.section,
        articleNumber: num,
        title: newArt.title.trim(),
        severity: newArt.severity,
        isTermination: newArt.isTermination,
        penalty1: newArt.penalty1.trim() || undefined,
        penalty2: newArt.penalty2.trim() || undefined,
        penalty3: newArt.penalty3.trim() || undefined,
        penalty4: newArt.penalty4.trim() || undefined,
        extraDeduction: newArt.extraDeduction.trim() || undefined,
        legalReference: newArt.legalReference.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setNewArt({
            section: "work_time", articleNumber: "", title: "", severity: "medium",
            isTermination: false, penalty1: "", penalty2: "", penalty3: "", penalty4: "",
            extraDeduction: "", legalReference: "",
          });
        },
      },
    );
  };

  // GET /hr/discipline/regulation/:id — full single-article detail
  // (description, legal links, history). Opens in a read-only viewer.
  const [viewId, setViewId] = useState<number | null>(null);
  const viewQ = useApiQuery<any>(
    ["discipline-regulation-article", String(viewId ?? 0)],
    viewId ? `/hr/discipline/regulation/${viewId}` : null,
    { enabled: viewId !== null },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const saveEdit = () => {
    if (!editing) return;
    saveMut.mutate({
      id: editing.id,
      title: editing.title,
      penalty1: editing.penalty1 ?? null,
      penalty2: editing.penalty2 ?? null,
      penalty3: editing.penalty3 ?? null,
      penalty4: editing.penalty4 ?? null,
      extraDeduction: editing.extraDeduction ?? null,
      severity: editing.severity,
      isTermination: editing.isTermination,
      legalReference: editing.legalReference ?? null,
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
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setViewId(a.id)} title="عرض">
            <Eye className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <GuardedButton
            perm="hr:delete"
            size="sm"
            variant="ghost"
            className="text-status-error-foreground"
            onClick={() => deleteMut.mutate(a.id)}
            disabled={deleteMut.isPending}
            rateLimitAware
            title="حذف"
          >
            <Trash2 className="w-4 h-4" />
          </GuardedButton>
        </div>
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
        <div className="flex items-center gap-2">
          <GuardedButton perm="hr:create" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 me-2" /> مادة جديدة
          </GuardedButton>
          <GuardedButton perm="hr:create" variant="outline" onClick={reseedDefaults} disabled={reseeding}>
            <RefreshCw className={`w-4 h-4 me-2 ${reseeding ? "animate-spin" : ""}`} />
            استنساخ اللائحة الافتراضية
          </GuardedButton>
          <PrintButton
            entityType="report_hr_discipline_regulation"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: "لائحة الانضباط الوظيفي", total },
              items: (data?.data ?? []).map((a) => ({
                "القسم": SECTION_LABELS[a.section] || a.section,
                "رقم المادة": a.articleNumber,
                "العنوان": a.title || "—",
                "الشدة": a.severity || "—",
                "العقوبة الأولى": a.penalty1 || "—",
                "العقوبة الثانية": a.penalty2 || "—",
                "العقوبة الثالثة": a.penalty3 || "—",
                "العقوبة الرابعة": a.penalty4 || "—",
                "تصل للفصل": a.isTermination ? "نعم" : "لا",
              })),
            }}
          />
        </div>
      }
    >
      <HrTabsNav />
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
            <div className="space-y-3">
              <div>
                <Label>الوصف</Label>
                <Textarea
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>أول مرة</Label>
                  <Input
                    value={editing.penalty1 ?? ""}
                    onChange={(e) => setEditing({ ...editing, penalty1: e.target.value })}
                  />
                </div>
                <div>
                  <Label>ثاني مرة</Label>
                  <Input
                    value={editing.penalty2 ?? ""}
                    onChange={(e) => setEditing({ ...editing, penalty2: e.target.value })}
                  />
                </div>
                <div>
                  <Label>ثالث مرة</Label>
                  <Input
                    value={editing.penalty3 ?? ""}
                    onChange={(e) => setEditing({ ...editing, penalty3: e.target.value })}
                  />
                </div>
                <div>
                  <Label>رابع مرة</Label>
                  <Input
                    value={editing.penalty4 ?? ""}
                    onChange={(e) => setEditing({ ...editing, penalty4: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>حسم إضافي</Label>
                <Input
                  value={editing.extraDeduction ?? ""}
                  onChange={(e) => setEditing({ ...editing, extraDeduction: e.target.value })}
                  placeholder="مثال: بالإضافة إلى حسم أجر دقائق التأخر"
                />
              </div>
              <div>
                <Label>مرجع نظامي</Label>
                <Input
                  value={editing.legalReference ?? ""}
                  onChange={(e) => setEditing({ ...editing, legalReference: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              إلغاء
            </Button>
            <GuardedButton perm="hr:create" onClick={saveEdit} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={reseedAsk}
        onOpenChange={(v) => { if (!v) setReseedAsk(false); }}
        variant="caution"
        title="استنساخ اللائحة الافتراضية"
        description="سيتم استنساخ اللائحة الافتراضية (49 مادة) للشركة. هل تريد المتابعة؟"
        confirmLabel="استنساخ"
        onConfirm={() => {
          setReseedAsk(false);
          reseedMut.mutate({});
        }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة مادة جديدة للائحة الانضباط</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>القسم *</Label>
                <Select value={newArt.section} onValueChange={(v) => setNewArt((s) => ({ ...s, section: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SECTION_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>رقم المادة *</Label>
                <Input type="number" value={newArt.articleNumber}
                  onChange={(e) => setNewArt((s) => ({ ...s, articleNumber: e.target.value }))} dir="ltr" />
              </div>
              <div>
                <Label>الشدة</Label>
                <Select value={newArt.severity} onValueChange={(v) => setNewArt((s) => ({ ...s, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">منخفضة</SelectItem>
                    <SelectItem value="medium">متوسطة</SelectItem>
                    <SelectItem value="high">عالية</SelectItem>
                    <SelectItem value="critical">حرجة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>وصف المخالفة *</Label>
              <Textarea value={newArt.title}
                onChange={(e) => setNewArt((s) => ({ ...s, title: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>أول مرة</Label>
                <Input value={newArt.penalty1}
                  onChange={(e) => setNewArt((s) => ({ ...s, penalty1: e.target.value }))} />
              </div>
              <div>
                <Label>ثاني مرة</Label>
                <Input value={newArt.penalty2}
                  onChange={(e) => setNewArt((s) => ({ ...s, penalty2: e.target.value }))} />
              </div>
              <div>
                <Label>ثالث مرة</Label>
                <Input value={newArt.penalty3}
                  onChange={(e) => setNewArt((s) => ({ ...s, penalty3: e.target.value }))} />
              </div>
              <div>
                <Label>رابع مرة</Label>
                <Input value={newArt.penalty4}
                  onChange={(e) => setNewArt((s) => ({ ...s, penalty4: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>حسم إضافي</Label>
              <Input value={newArt.extraDeduction}
                onChange={(e) => setNewArt((s) => ({ ...s, extraDeduction: e.target.value }))} />
            </div>
            <div>
              <Label>مرجع نظامي</Label>
              <Input value={newArt.legalReference}
                onChange={(e) => setNewArt((s) => ({ ...s, legalReference: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={newArt.isTermination}
                onCheckedChange={(v) => setNewArt((s) => ({ ...s, isTermination: v }))} />
              <Label>تؤدي إلى الفصل عند تكرارها</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <GuardedButton perm="hr:create" onClick={submitCreate} disabled={createMut.isPending}>
              {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewId !== null} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>المادة #{viewQ.data?.articleNumber ?? viewId}</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm space-y-2">
            {viewQ.isLoading ? (
              <p className="text-muted-foreground">جاري التحميل...</p>
            ) : viewQ.data ? (
              <>
                <p className="font-medium">{viewQ.data.title}</p>
                {viewQ.data.description && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{viewQ.data.description}</p>
                )}
                {viewQ.data.legalReference && (
                  <p className="text-xs">📖 {viewQ.data.legalReference}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                  <div><span className="text-muted-foreground">القسم:</span> {SECTION_LABELS[viewQ.data.section] ?? viewQ.data.section}</div>
                  <div><span className="text-muted-foreground">الشدة:</span> {viewQ.data.severity}</div>
                  {viewQ.data.isTermination && <div className="text-status-error-foreground">⚠ تؤدي إلى الفصل</div>}
                </div>
                <div className="border-t pt-2 grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">أول مرة:</span> {viewQ.data.penalty1 ?? "—"}</div>
                  <div><span className="text-muted-foreground">ثاني مرة:</span> {viewQ.data.penalty2 ?? "—"}</div>
                  <div><span className="text-muted-foreground">ثالث مرة:</span> {viewQ.data.penalty3 ?? "—"}</div>
                  <div><span className="text-muted-foreground">رابع مرة:</span> {viewQ.data.penalty4 ?? "—"}</div>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">لا توجد بيانات</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewId(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
