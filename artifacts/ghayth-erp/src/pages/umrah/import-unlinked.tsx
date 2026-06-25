/**
 * /umrah/import/:batchId/unlinked — §3 of #1870
 *
 * Operator-facing recovery screen for rows that landed in a batch with
 * NULL agentId / groupId / subAgentId. The engine resolvers (see
 * lib/umrahImportEngine.ts → resolveAgent / resolveGroup /
 * resolveSubAgent) fall back to NULL when the source row lacks the
 * lookup key. The wizard now flags this BEFORE confirm; this page is
 * the AFTER-confirm fix so the operator can bulk-resolve without
 * re-importing the file.
 *
 * Three tabs (agent / group / sub-agent) mirror the three counter
 * columns added in migration 279. Each tab:
 *   1. Lists the unlinked pilgrims in this batch (GET /import/batches/:id/unlinked?dimension=…)
 *   2. Lets the operator multi-select rows
 *   3. Either links to an existing entity OR creates a new one
 *   4. POSTs to /import/batches/:id/unlinked/link to do the bulk update
 *
 * Sub-agent creation also asks for the parent agent — required by the
 * domain (umrah_sub_agents.agentId NOT NULL on the rollup queries).
 */
import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
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
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

type Dimension = "agent" | "group" | "subAgent";

interface UnlinkedRow {
  id: number;
  nuskNumber: string | null;
  fullName: string;
  nationality: string | null;
  status: string | null;
  agentId: number | null;
  groupId: number | null;
  subAgentId: number | null;
}

const DIMENSION_LABEL: Record<Dimension, string> = {
  agent: "وكيل",
  group: "مجموعة",
  subAgent: "وكيل فرعي",
};

const DIMENSION_TITLE: Record<Dimension, string> = {
  agent: "الصفوف غير المربوطة بوكيل",
  group: "الصفوف غير المربوطة بمجموعة",
  subAgent: "الصفوف غير المربوطة بوكيل فرعي",
};

export default function ImportUnlinked() {
  const { batchId } = useParams<{ batchId: string }>();
  const id = Number(batchId);
  const [dimension, setDimension] = useState<Dimension>("agent");

  return (
    <PageShell
      title="استرداد الصفوف غير المربوطة"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/umrah", label: "العمرة" },
        { href: "/umrah/import", label: "الاستيراد" },
        { label: `الدفعة #${id}` },
      ]}
      actions={
        <Button asChild variant="outline" size="sm"><Link href="/umrah/import">
            <ArrowRight className="h-4 w-4 me-1" />
            عودة للاستيراد
          </Link></Button>
      }
    >
      <UmrahTabsNav />

      <Card className="mb-4 border-status-warning-surface">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-status-warning-foreground mt-0.5 shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium">لماذا هذه الصفحة؟</p>
              <p className="text-muted-foreground">
                بعض الصفوف نجح استيرادها لكن بدون ربط بالوكيل أو المجموعة أو
                المكتب الفرعي، لأن الملف الأصلي لم يكن يحوي رقم الوكيل أو رقم
                المجموعة أو رمز المكتب. هذه الصفوف موجودة في النظام لكنها لا
                تظهر في الكشوف والتجميعات. من هنا تربطها جماعيًا دون إعادة
                استيراد الملف.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={dimension} onValueChange={(v) => setDimension(v as Dimension)}>
        <TabsList className="mb-4">
          <TabsTrigger value="agent" data-testid="tab-agent">بدون وكيل</TabsTrigger>
          <TabsTrigger value="group" data-testid="tab-group">بدون مجموعة</TabsTrigger>
          <TabsTrigger value="subAgent" data-testid="tab-subAgent">بدون مكتب</TabsTrigger>
        </TabsList>

        <TabsContent value="agent">
          <UnlinkedTab batchId={id} dimension="agent" />
        </TabsContent>
        <TabsContent value="group">
          <UnlinkedTab batchId={id} dimension="group" />
        </TabsContent>
        <TabsContent value="subAgent">
          <UnlinkedTab batchId={id} dimension="subAgent" />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function UnlinkedTab({ batchId, dimension }: { batchId: number; dimension: Dimension }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [targetId, setTargetId] = useState<string>("");
  const [newName, setNewName] = useState<string>("");
  const [parentAgentId, setParentAgentId] = useState<string>("");
  // Per-row mode: pilgrimId → chosen existing-target id (string from Select)
  const [rowTargets, setRowTargets] = useState<Record<number, string>>({});

  const rowsQ = useApiQuery<{ data: UnlinkedRow[] }>(
    ["umrah-import-unlinked", String(batchId), dimension],
    `/umrah/import/batches/${batchId}/unlinked?dimension=${dimension}`,
  );
  const rows = useMemo(() => asList<UnlinkedRow>(rowsQ.data), [rowsQ.data]);
  const { sortedRows: printRows } = usePrintRows<UnlinkedRow>(rows);

  // Existing-entity dropdown depends on dimension.
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
    `/umrah/import/batches/${batchId}/unlinked/link`,
    "POST",
    [["umrah-import-unlinked", String(batchId), dimension]],
    {
      onSuccess: (data) => {
        toast({ title: `تم ربط ${data?.linkedCount ?? 0} صفًا بنجاح` });
        setSelected(new Set());
        setTargetId("");
        setNewName("");
        setParentAgentId("");
        setRowTargets({});
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

  const setRowTarget = (pilgrimId: number, value: string) => {
    setRowTargets((prev) => {
      const next = { ...prev };
      if (value) next[pilgrimId] = value;
      else delete next[pilgrimId];
      return next;
    });
  };

  const assignedEntries = Object.entries(rowTargets).filter(([, t]) => t);

  const onLinkPerRow = () => {
    if (assignedEntries.length === 0) {
      toast({ variant: "destructive", title: `عيّن ${DIMENSION_LABEL[dimension]}ًا لصف واحد على الأقل` });
      return;
    }
    linkMutation.mutate({
      dimension,
      assignments: assignedEntries.map(([pid, t]) => ({ pilgrimId: Number(pid), targetId: Number(t) })),
    });
  };

  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">
              {DIMENSION_TITLE[dimension]} ({rows.length})
            </CardTitle>
            {rows.length > 0 && (
              <PrintButton
                entityType="report_umrah_import_unlinked"
                entityId={String(batchId)}
                size="icon"
                payload={() => ({
                  entity: {
                    title: `${DIMENSION_TITLE[dimension]} — الدفعة #${batchId}`,
                    total: printRows.length,
                  },
                  items: printRows.map((r: UnlinkedRow) => ({
                    "رقم نسك": r.nuskNumber ?? "—",
                    "الاسم": r.fullName,
                    "الجنسية": r.nationality ?? "—",
                    "الحالة": r.status ?? "—",
                  })),
                })}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              لا توجد صفوف غير مربوطة في هذا البُعد.
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
                        data-testid="select-all-unlinked"
                      />
                    </th>
                    <th className="p-2 text-start">رقم نسك</th>
                    <th className="p-2 text-start">الاسم</th>
                    <th className="p-2 text-start">الجنسية</th>
                    <th className="p-2 text-start">الحالة</th>
                    <th className="p-2 text-start min-w-[12rem]">
                      {DIMENSION_LABEL[dimension]} (تعيين فردي)
                    </th>
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
                          data-testid={`select-row-${r.id}`}
                        />
                      </td>
                      <td className="p-2 font-mono">{r.nuskNumber ?? "—"}</td>
                      <td className="p-2">{r.fullName}</td>
                      <td className="p-2">{r.nationality ?? "—"}</td>
                      <td className="p-2">{r.status ?? "—"}</td>
                      <td className="p-2">
                        <Select
                          value={rowTargets[r.id] ?? ""}
                          onValueChange={(v) => setRowTarget(r.id, v)}
                        >
                          <SelectTrigger className="h-8" data-testid={`row-target-${r.id}`}>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.length > 0 && (
            <div className="flex items-center justify-between gap-3 pt-4 mt-2 border-t flex-wrap">
              <p className="text-xs text-muted-foreground">
                عيّن لكل صف وجهته الخاصة من القائمة، ثم اربط الجميع دفعة واحدة. مفيد عندما تعود الصفوف لوكلاء أو مجموعات مختلفة.
              </p>
              <Button
                variant="secondary"
                onClick={onLinkPerRow}
                disabled={linkMutation.isPending || assignedEntries.length === 0}
                data-testid="btn-link-per-row"
              >
                {linkMutation.isPending ? "جاري الربط..." : `ربط المعيَّنين فرديًا (${assignedEntries.length})`}
              </Button>
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
                <TabsTrigger value="existing" data-testid="link-mode-existing">
                  <Link2 className="h-4 w-4 me-1" />
                  ربط بكيان موجود
                </TabsTrigger>
                <TabsTrigger value="new" data-testid="link-mode-new">
                  <Plus className="h-4 w-4 me-1" />
                  إنشاء كيان جديد
                </TabsTrigger>
              </TabsList>

              <TabsContent value="existing" className="space-y-2 mt-3">
                <Label>اختر {DIMENSION_LABEL[dimension]}</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger data-testid="select-target">
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
                    data-testid="input-new-name"
                  />
                </div>
                {dimension === "subAgent" && (
                  <div className="space-y-2">
                    <Label>الوكيل الأم</Label>
                    <Select value={parentAgentId} onValueChange={setParentAgentId}>
                      <SelectTrigger data-testid="select-parent-agent">
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
                    <p className="text-xs text-muted-foreground">
                      الوكيل الفرعي يجب أن ينتمي لوكيل أم؛ بدون ذلك لن يظهر في كشوف المكاتب التابعة للوكيل.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex justify-end">
              <Button onClick={onLink} disabled={linkMutation.isPending} data-testid="btn-link">
                {linkMutation.isPending ? "جاري الربط..." : `ربط ${selected.size} صفًا`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
