import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Pencil, RefreshCw, AlertTriangle } from "lucide-react";
import { PageShell } from "@/components/page-shell";

const SECTION_LABELS: Record<string, string> = {
  work_time: "مخالفات تتعلق بمواعيد العمل",
  work_organization: "مخالفات تتعلق بتنظيم العمل",
  conduct: "مخالفات تتعلق بسلوك العامل",
};

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
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
  const { data, isLoading } = useApiQuery<{
    data: Article[];
    grouped: Record<string, Article[]>;
    sections: Record<string, string>;
    effectiveFrom: string;
    total: number;
  }>(["discipline-regulation"], "/hr/discipline/regulation");
  const [editing, setEditing] = useState<Article | null>(null);

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

  const reseedDefaults = () => {
    if (!confirm("سيتم استنساخ اللائحة الافتراضية (49 مادة) للشركة. المتابعة؟")) return;
    reseedMut.mutate({});
  };

  const renderArticle = (a: Article) => (
    <div key={a.id} className="border rounded-lg p-4 hover:bg-gray-50 transition">
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
            <div className="bg-gray-50 rounded p-2">
              <div className="text-muted-foreground mb-0.5">أول مرة</div>
              <div className="font-medium">{a.penalty1 || "—"}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-muted-foreground mb-0.5">ثاني مرة</div>
              <div className="font-medium">{a.penalty2 || "—"}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-muted-foreground mb-0.5">ثالث مرة</div>
              <div className="font-medium">{a.penalty3 || "—"}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
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
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "لائحة الانضباط الوظيفي" }]}
      loading={isLoading}
      actions={
        <Button variant="outline" onClick={reseedDefaults} disabled={reseeding}>
          <RefreshCw className={`w-4 h-4 me-2 ${reseeding ? "animate-spin" : ""}`} />
          استنساخ اللائحة الافتراضية
        </Button>
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
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
