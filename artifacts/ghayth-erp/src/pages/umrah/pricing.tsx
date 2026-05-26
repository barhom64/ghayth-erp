import { useMemo, useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageShell } from "@workspace/ui-core";
import { PageStateWrapper } from "@/components/shared/page-state";
import { GuardedButton } from "@/components/shared/permission-gate";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Plus, Pencil, Trash2, AlertTriangle, Tag, Hotel, Bus } from "lucide-react";

interface PricingRow {
  id: number;
  subAgentId: number | null;
  subAgentName?: string;
  agentId: number;
  agentName?: string;
  seasonId: number;
  seasonTitle?: string;
  pricePerMutamer: number;
  includesHotel: boolean;
  includesTransport: boolean;
  validFrom: string;
  validTo: string;
  notes?: string;
}


export default function UmrahPricing() {
  const pricingQ = useApiQuery<{ data: PricingRow[] }>(["umrah-pricing"], "/umrah/pricing");
  const agentsQ = useApiQuery<{ data: any[] }>(["umrah-agents"], "/umrah/agents");
  
  const subAgentsQ = useApiQuery<{ data: any[] }>(["umrah-sub-agents"], "/umrah/sub-agents");
  const seasonsQ = useApiQuery<{ data: any[] }>(["umrah-seasons"], "/umrah/seasons");

  const rows = pricingQ.data?.data ?? [];
  const agents = agentsQ.data?.data ?? [];
  const subAgents = subAgentsQ.data?.data ?? [];
  const seasons = seasonsQ.data?.data ?? [];

  const activeSeason = seasons.find((s: any) => s.status === "open") ?? seasons[0];

  const [editing, setEditing] = useState<Partial<PricingRow> | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const createMut = useApiMutation<any, Partial<PricingRow>>(
    "/umrah/pricing",
    "POST",
    [["umrah-pricing"]],
    { successMessage: "تم حفظ التسعيرة", onSuccess: () => setEditing(null) },
  );
  const updateMut = useApiMutation<any, Partial<PricingRow>>(
    (body) => `/umrah/pricing/${body.id}`,
    "PATCH",
    [["umrah-pricing"]],
    { successMessage: "تم تحديث التسعيرة", onSuccess: () => setEditing(null) },
  );
  const saveMut = { isPending: createMut.isPending || updateMut.isPending, mutate: (body: Partial<PricingRow>) => body.id ? updateMut.mutate(body) : createMut.mutate(body) };

  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `/umrah/pricing/${body.id}`,
    "DELETE",
    [["umrah-pricing"]],
    { successMessage: "تم حذف التسعيرة", onSuccess: () => setDeleteId(null) },
  );

  // Group by agent then sub-agent
  const grouped = useMemo(() => {
    const g: Record<string, { agentName: string; subGroups: Record<string, PricingRow[]> }> = {};
    rows.forEach((r) => {
      const aKey = String(r.agentId);
      if (!g[aKey]) g[aKey] = { agentName: r.agentName ?? `#${r.agentId}`, subGroups: {} };
      const sKey = r.subAgentId ? String(r.subAgentId) : "_main";
      if (!g[aKey].subGroups[sKey]) g[aKey].subGroups[sKey] = [];
      g[aKey].subGroups[sKey].push(r);
    });
    return g;
  }, [rows]);

  // Detect gaps — any agent whose windows don't cover the full active season
  const gapsByAgent = useMemo(() => {
    if (!activeSeason) return {};
    const out: Record<string, boolean> = {};
    Object.entries(grouped).forEach(([aKey, { subGroups }]) => {
      Object.entries(subGroups).forEach(([sKey, list]) => {
        const sorted = [...list]
          .filter((r) => r.seasonId === activeSeason.id)
          .sort((a, b) => (a.validFrom > b.validFrom ? 1 : -1));
        if (sorted.length === 0) {
          out[`${aKey}:${sKey}`] = true;
          return;
        }
        // gap if first doesn't start on/before season start OR last doesn't end on/after season end
        if (sorted[0].validFrom > activeSeason.startDate) out[`${aKey}:${sKey}`] = true;
        if (sorted[sorted.length - 1].validTo < activeSeason.endDate) out[`${aKey}:${sKey}`] = true;
        // check gaps between consecutive windows
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].validFrom > sorted[i - 1].validTo) {
            out[`${aKey}:${sKey}`] = true;
            break;
          }
        }
      });
    });
    return out;
  }, [grouped, activeSeason]);

  const hasAnyGap = Object.keys(gapsByAgent).length > 0;

  // Overlap detection within a subGroup
  const overlapIds = useMemo(() => {
    const out = new Set<number>();
    Object.values(grouped).forEach(({ subGroups }) => {
      Object.values(subGroups).forEach((list) => {
        const sorted = [...list].sort((a, b) => (a.validFrom > b.validFrom ? 1 : -1));
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].validFrom <= sorted[i - 1].validTo) {
            out.add(sorted[i].id);
            out.add(sorted[i - 1].id);
          }
        }
      });
    });
    return out;
  }, [grouped]);

  return (
    <PageShell
      title="تسعيرة العمرة"
      subtitle="أسعار المعتمر لكل وكيل/وكيل فرعي ضمن نوافذ زمنية"
      breadcrumbs={[{ label: "العمرة" }, { label: "التسعيرة" }]}
      actions={
        <GuardedButton
          perm="umrah:write"
          onClick={() => setEditing({
            includesHotel: true,
            includesTransport: false,
            seasonId: activeSeason?.id,
          })}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          تسعيرة جديدة
        </GuardedButton>
      }
    >
      <UmrahTabsNav />

      {hasAnyGap && activeSeason && (
        <Card className="border-status-warning-surface bg-status-warning-surface">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-status-warning-foreground shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900">فجوات في تغطية التسعيرة للموسم النشط: {activeSeason.title}</p>
              <p className="text-status-warning-foreground mt-1">
                يوجد {Object.keys(gapsByAgent).length} وكيل/وكيل فرعي بدون تغطية كاملة للموسم الحالي — قد يؤدي إلى فواتير بأسعار افتراضية.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <PageStateWrapper
        isLoading={pricingQ.isLoading}
        error={pricingQ.error}
        onRetry={() => pricingQ.refetch()}
        isEmpty={rows.length === 0}
        emptyText="لا توجد تسعيرات مسجلة"
        emptyHint="أضف أول تسعيرة لتحديد سعر المعتمر لكل وكيل/وكيل فرعي"
      >
        <div className="space-y-6">
          {Object.entries(grouped).map(([aKey, { agentName, subGroups }]) => (
            <Card key={aKey}>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Tag className="h-4 w-4 text-status-info-foreground" />
                    {agentName}
                  </h3>
                </div>
                {Object.entries(subGroups).map(([sKey, list]) => {
                  const subName = sKey === "_main"
                    ? "السعر الرئيسي (بدون وكيل فرعي)"
                    : list[0].subAgentName ?? `وكيل فرعي #${sKey}`;
                  const hasGap = gapsByAgent[`${aKey}:${sKey}`];
                  return (
                    <div key={sKey} className="rounded-md border bg-muted/20">
                      <div className="flex items-center justify-between px-3 py-2 border-b">
                        <p className="text-sm font-medium">{subName}</p>
                        {hasGap && (
                          <Badge className="bg-status-warning-surface text-status-warning-foreground border-status-warning-surface" variant="outline">
                            فجوة زمنية
                          </Badge>
                        )}
                      </div>
                      <div className="divide-y">
                        {list.map((r) => (
                          <div
                            key={r.id}
                            className={`p-3 flex flex-wrap items-center gap-3 text-sm ${overlapIds.has(r.id) ? "bg-status-error-surface" : ""}`}
                          >
                            <div className="flex-1 min-w-[180px]">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{formatCurrency(Number(r.pricePerMutamer))}</span>
                                <span className="text-xs text-muted-foreground">/ معتمر</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDateAr(r.validFrom)} — {formatDateAr(r.validTo)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs">
                              {r.includesHotel && (
                                <Badge variant="outline" className="gap-1"><Hotel className="h-3 w-3" /> فندق</Badge>
                              )}
                              {r.includesTransport && (
                                <Badge variant="outline" className="gap-1"><Bus className="h-3 w-3" /> نقل</Badge>
                              )}
                              {overlapIds.has(r.id) && (
                                <Badge className="bg-status-error-surface text-status-error-foreground border-status-error-surface" variant="outline">
                                  تداخل
                                </Badge>
                              )}
                            </div>
                            {r.notes && (
                              <p className="text-xs text-muted-foreground max-w-xs truncate">{r.notes}</p>
                            )}
                            <div className="flex items-center gap-1">
                              <GuardedButton
                                perm="umrah:write"
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditing(r)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </GuardedButton>
                              <GuardedButton
                                perm="umrah:write"
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteId(r.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-status-error-foreground" />
                              </GuardedButton>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </PageStateWrapper>

      {/* Create / edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "تعديل تسعيرة" : "تسعيرة جديدة"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الوكيل الرئيسي *</Label>
                <Select
                  value={editing.agentId ? String(editing.agentId) : ""}
                  onValueChange={(v) => setEditing({ ...editing, agentId: Number(v) })}
                >
                  <SelectTrigger><SelectValue placeholder="اختر الوكيل" /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الوكيل الفرعي (اختياري)</Label>
                <Select
                  value={editing.subAgentId ? String(editing.subAgentId) : "none"}
                  onValueChange={(v) => setEditing({ ...editing, subAgentId: v === "none" ? null : Number(v) })}
                >
                  <SelectTrigger><SelectValue placeholder="بدون وكيل فرعي" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون وكيل فرعي</SelectItem>
                    {subAgents
                      .filter((s: any) => !editing.agentId || s.agentId === editing.agentId)
                      .map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الموسم *</Label>
                <Select
                  value={editing.seasonId ? String(editing.seasonId) : ""}
                  onValueChange={(v) => setEditing({ ...editing, seasonId: Number(v) })}
                >
                  <SelectTrigger><SelectValue placeholder="اختر الموسم" /></SelectTrigger>
                  <SelectContent>
                    {seasons.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>السعر للمعتمر *</Label>
                <Input
                  type="number"
                  value={editing.pricePerMutamer ?? ""}
                  onChange={(e) => setEditing({ ...editing, pricePerMutamer: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>ساري من *</Label>
                <UnifiedDateInput
                  required
                  value={editing.validFrom ?? ""}
                  onChange={(iso) => setEditing({ ...editing, validFrom: iso })}
                />
              </div>
              <div>
                <Label>ساري إلى *</Label>
                <UnifiedDateInput
                  required
                  value={editing.validTo ?? ""}
                  onChange={(iso) => setEditing({ ...editing, validTo: iso })}
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Checkbox
                  id="price-hotel"
                  checked={!!editing.includesHotel}
                  onCheckedChange={(c) => setEditing({ ...editing, includesHotel: !!c })}
                />
                <Label htmlFor="price-hotel" className="cursor-pointer">يشمل الفندق</Label>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Checkbox
                  id="price-transport"
                  checked={!!editing.includesTransport}
                  onCheckedChange={(c) => setEditing({ ...editing, includesTransport: !!c })}
                />
                <Label htmlFor="price-transport" className="cursor-pointer">يشمل النقل</Label>
              </div>
              <div className="col-span-2">
                <Label>ملاحظات</Label>
                <Textarea
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
            <GuardedButton
              perm="umrah:write"
              disabled={
                saveMut.isPending ||
                !editing?.agentId ||
                !editing?.seasonId ||
                !editing?.pricePerMutamer ||
                !editing?.validFrom ||
                !editing?.validTo
              }
              onClick={() => editing && saveMut.mutate(editing)}
            >
              {saveMut.isPending ? "جاري الحفظ..." : "حفظ"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من حذف هذه التسعيرة؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <GuardedButton
              perm="umrah:write"
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteId && deleteMut.mutate({ id: deleteId })}
            >
              {deleteMut.isPending ? "جاري الحذف..." : "حذف"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
