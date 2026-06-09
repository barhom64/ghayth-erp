/**
 * /umrah/orphan-pilgrims — legacy orphan recovery (#1870 §3 extension)
 *
 * Sister screen of /umrah/import/:batchId/unlinked from PR #1878.
 * That one drills into the unlinked rows of a SPECIFIC import batch
 * (via umrah_import_changes), so it only sees rows imported AFTER
 * the engine fix landed in #1867.
 *
 * THIS screen sweeps `umrah_pilgrims` DIRECTLY for any row with a
 * NULL agentId / groupId / subAgentId — independent of batch lineage.
 * That catches the legacy 1,363-row case from the pre-#1867 era,
 * which the per-batch screen can't see because the legacy
 * `doImport()` helper never wrote to umrah_import_changes.
 *
 * Three tabs (agent / group / sub-agent). Each tab:
 *   1. Lists orphaned pilgrims for that dimension.
 *   2. Lets the operator multi-select.
 *   3. Either links to an existing entity OR creates a new one.
 *   4. POSTs to /umrah/orphan-pilgrims/link to bulk-update.
 */
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageShell } from "@workspace/ui-core";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Link2, Plus, ArrowRight } from "lucide-react";

type Dimension = "agent" | "group" | "subAgent";

interface OrphanRow {
  id: number;
  nuskNumber: string | null;
  fullName: string;
  nationality: string | null;
  status: string | null;
  seasonId: number | null;
  agentId: number | null;
  groupId: number | null;
  subAgentId: number | null;
}

interface OrphanResp {
  data: OrphanRow[];
  dimension: Dimension;
  totals: { agent: number; group: number; subAgent: number };
}

const DIMENSION_LABEL: Record<Dimension, string> = {
  agent: "وكيل",
  group: "مجموعة",
  subAgent: "وكيل فرعي",
};

const DIMENSION_TITLE: Record<Dimension, string> = {
  agent: "المعتمرون بلا وكيل",
  group: "المعتمرون بلا مجموعة",
  subAgent: "المعتمرون بلا مكتب (وكيل فرعي)",
};

export default function OrphanPilgrims() {
  const [dimension, setDimension] = useState<Dimension>("agent");
  // Per-dimension query so switching tabs refetches counts but the
  // OrphanTab component handles the row list internally.
  const headcountQ = useApiQuery<OrphanResp>(
    ["umrah-orphan-pilgrims-headcount", dimension],
    `/umrah/orphan-pilgrims?dimension=${dimension}`,
  );
  const totals = headcountQ.data?.totals ?? { agent: 0, group: 0, subAgent: 0 };

  return (
    <PageShell
      title="استرداد المعتمرين اليتامى (legacy)"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/umrah", label: "العمرة" },
        { label: "المعتمرون اليتامى" },
      ]}
      actions={
        <Link href="/umrah/compliance">
          <Button variant="outline" size="sm">
            <ArrowRight className="h-4 w-4 me-1" />
            عودة للوحة الرقابة
          </Button>
        </Link>
      }
    >
      <UmrahTabsNav />

      <Card className="mb-4 border-status-warning-surface">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-status-warning-foreground mt-0.5 shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium">ما هي المعتمرون اليتامى؟</p>
              <p className="text-muted-foreground">
                صفوف معتمرين موجودة في قاعدة البيانات لكنها بدون ربط بوكيل أو
                مجموعة أو مكتب فرعي — غير ظاهرة على كشوف الوكلاء، تجميعات
                المجموعات، أو خرائط ربحية الوكيل. تظهر هنا بصرف النظر عن
                استيرادها قديماً أو حديثاً. لربطها لا تحتاج لإعادة استيراد
                الملف الأصلي — اختر الصفوف ثم ربطها بكيان موجود أو أنشئ جديداً.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={dimension} onValueChange={(v) => setDimension(v as Dimension)}>
        <TabsList className="mb-4">
          <TabsTrigger value="agent" data-testid="orphan-tab-agent">
            بلا وكيل ({totals.agent})
          </TabsTrigger>
          <TabsTrigger value="group" data-testid="orphan-tab-group">
            بلا مجموعة ({totals.group})
          </TabsTrigger>
          <TabsTrigger value="subAgent" data-testid="orphan-tab-subAgent">
            بلا مكتب ({totals.subAgent})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agent">
          <OrphanTab dimension="agent" />
        </TabsContent>
        <TabsContent value="group">
          <OrphanTab dimension="group" />
        </TabsContent>
        <TabsContent value="subAgent">
          <OrphanTab dimension="subAgent" />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function OrphanTab({ dimension }: { dimension: Dimension }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [targetId, setTargetId] = useState<string>("");
  const [newName, setNewName] = useState<string>("");
  const [parentAgentId, setParentAgentId] = useState<string>("");

  const rowsQ = useApiQuery<OrphanResp>(
    ["umrah-orphan-pilgrims", dimension],
    `/umrah/orphan-pilgrims?dimension=${dimension}`,
  );
  const rows = useMemo(() => rowsQ.data?.data ?? [], [rowsQ.data]);

  const agentsQ = useApiQuery<any>(["umrah-agents"], "/umrah/agents",
    { enabled: dimension === "agent" || dimension === "subAgent" });
  const groupsQ = useApiQuery<any>(["umrah-groups"], "/umrah/groups",
    { enabled: dimension === "group" });
  const subAgentsQ = useApiQuery<any>(["umrah-sub-agents"], "/umrah/sub-agents",
    { enabled: dimension === "subAgent" });

  const options =
    dimension === "agent" ? asList<any>(agentsQ.data) :
    dimension === "group" ? asList<any>(groupsQ.data) :
    asList<any>(subAgentsQ.data);

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleRow = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const linkMutation = useApiMutation<{ linkedCount: number; resolvedTargetId: number }>(
    `/umrah/orphan-pilgrims/link`,
    "POST",
    [
      ["umrah-orphan-pilgrims", dimension],
      ["umrah-orphan-pilgrims-headcount", dimension],
      ["umrah-compliance"],
    ],
    {
      onSuccess: (data) => {
        toast({ title: `تم ربط ${data?.linkedCount ?? 0} صفًا بنجاح` });
        setSelected(new Set());
        setTargetId("");
        setNewName("");
        setParentAgentId("");
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: err?.error || err?.message || "تعذّر الربط" });
      },
    },
  );

  const onLink = () => {
    if (selected.size === 0) {
      toast({ variant: "destructive", title: "اختر صفًا واحدًا على الأقل" });
      return;
    }
    const body: any = { dimension, pilgrimIds: Array.from(selected) };
    if (mode === "existing") {
      if (!targetId) {
        toast({ variant: "destructive", title: `اختر ${DIMENSION_LABEL[dimension]}ًا` });
        return;
      }
      body.targetId = Number(targetId);
    } else {
      if (!newName.trim()) {
        toast({ variant: "destructive", title: "أدخل الاسم" });
        return;
      }
      body.newEntityName = newName.trim();
      if (dimension === "subAgent") {
        if (!parentAgentId) {
          toast({ variant: "destructive", title: "اختر الوكيل الأم" });
          return;
        }
        body.parentAgentId = Number(parentAgentId);
      }
    }
    linkMutation.mutate(body);
  };

  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">
            {DIMENSION_TITLE[dimension]} ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              لا توجد صفوف يتيمة في هذا البُعد. كل المعتمرين مربوطون.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-start w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === rows.length && rows.length > 0}
                        onChange={toggleAll}
                        data-testid="orphan-select-all"
                      />
                    </th>
                    <th className="p-2 text-start">رقم نسك</th>
                    <th className="p-2 text-start">الاسم</th>
                    <th className="p-2 text-start">الجنسية</th>
                    <th className="p-2 text-start">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/20">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleRow(r.id)}
                          data-testid={`orphan-select-row-${r.id}`}
                        />
                      </td>
                      <td className="p-2 font-mono">{r.nuskNumber ?? "—"}</td>
                      <td className="p-2">{r.fullName}</td>
                      <td className="p-2">{r.nationality ?? "—"}</td>
                      <td className="p-2">{r.status ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              ربط الصفوف المحددة ({selected.size}) بـ{DIMENSION_LABEL[dimension]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as "existing" | "new")}>
              <TabsList>
                <TabsTrigger value="existing" data-testid="orphan-link-mode-existing">
                  <Link2 className="h-4 w-4 me-1" />
                  ربط بكيان موجود
                </TabsTrigger>
                <TabsTrigger value="new" data-testid="orphan-link-mode-new">
                  <Plus className="h-4 w-4 me-1" />
                  إنشاء كيان جديد
                </TabsTrigger>
              </TabsList>

              <TabsContent value="existing" className="space-y-2 mt-3">
                <Label>اختر {DIMENSION_LABEL[dimension]}</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger data-testid="orphan-select-target">
                    <SelectValue placeholder={`اختر ${DIMENSION_LABEL[dimension]}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.name || o.title || `#${o.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TabsContent>

              <TabsContent value="new" className="space-y-3 mt-3">
                <div className="space-y-2">
                  <Label>اسم {DIMENSION_LABEL[dimension]} الجديد</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={`اسم ${DIMENSION_LABEL[dimension]}`}
                    data-testid="orphan-input-new-name"
                  />
                </div>
                {dimension === "subAgent" && (
                  <div className="space-y-2">
                    <Label>الوكيل الأم</Label>
                    <Select value={parentAgentId} onValueChange={setParentAgentId}>
                      <SelectTrigger data-testid="orphan-select-parent-agent">
                        <SelectValue placeholder="اختر الوكيل الأم" />
                      </SelectTrigger>
                      <SelectContent>
                        {asList<any>(agentsQ.data).map((a: any) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.name || `#${a.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex justify-end">
              <Button onClick={onLink} disabled={linkMutation.isPending} data-testid="orphan-btn-link">
                {linkMutation.isPending ? "جاري الربط..." : `ربط ${selected.size} صفًا`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
