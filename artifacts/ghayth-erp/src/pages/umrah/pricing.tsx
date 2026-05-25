import { useMemo, useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  PageShell,
  FormShell,
  FormGrid,
  FormTextareaField,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormCheckboxField,
} from "@workspace/ui-core";
import { PageStateWrapper } from "@/components/shared/page-state";
import { GuardedButton } from "@/components/shared/permission-gate";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
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

const pricingSchema = z
  .object({
    agentId: z.string().min(1, "الوكيل الرئيسي مطلوب"),
    subAgentId: z.string().optional(),
    seasonId: z.string().min(1, "الموسم مطلوب"),
    pricePerMutamer: z.string().refine((v) => Number(v) > 0, "السعر مطلوب"),
    validFrom: z.string().min(1, "تاريخ السريان مطلوب"),
    validTo: z.string().min(1, "تاريخ الانتهاء مطلوب"),
    includesHotel: z.boolean(),
    includesTransport: z.boolean(),
    notes: z.string().optional(),
  })
  .refine(
    (v) => !v.validFrom || !v.validTo || v.validTo >= v.validFrom,
    { message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ السريان", path: ["validTo"] },
  );
type PricingForm = z.infer<typeof pricingSchema>;

const PRICING_EMPTY: PricingForm = {
  agentId: "",
  subAgentId: "",
  seasonId: "",
  pricePerMutamer: "",
  validFrom: "",
  validTo: "",
  includesHotel: false,
  includesTransport: false,
  notes: "",
};

/**
 * Sub-agent picker that filters by the currently-selected agentId. Lives
 * inside FormShell so it can read agentId via useFormContext.watch().
 */
function SubAgentPicker({ subAgents }: { subAgents: any[] }) {
  const { watch } = useFormContext();
  const agentId = watch("agentId") as string;
  const filtered = subAgents.filter(
    (s: any) => !agentId || s.agentId === Number(agentId),
  );
  return (
    <FormSelectField
      name="subAgentId"
      label="الوكيل الفرعي (اختياري)"
      options={filtered.map((s: any) => ({ value: String(s.id), label: s.name }))}
      placeholder="بدون وكيل فرعي"
    />
  );
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

  // editingId discriminator: null = closed, "new" = create, number = edit row
  const [editingId, setEditingId] = useState<null | "new" | number>(null);
  const [editingDefaults, setEditingDefaults] = useState<PricingForm>(PRICING_EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const closeEditor = () => setEditingId(null);

  const createMut = useApiMutation<any, Partial<PricingRow>>(
    "/umrah/pricing",
    "POST",
    [["umrah-pricing"]],
    { successMessage: "تم حفظ التسعيرة", onSuccess: closeEditor },
  );
  const updateMut = useApiMutation<any, Partial<PricingRow>>(
    (body) => `/umrah/pricing/${body.id}`,
    "PATCH",
    [["umrah-pricing"]],
    { successMessage: "تم تحديث التسعيرة", onSuccess: closeEditor },
  );

  const openCreate = () => {
    setEditingDefaults(PRICING_EMPTY);
    setEditingId("new");
  };
  const openEdit = (r: PricingRow) => {
    setEditingDefaults({
      agentId: String(r.agentId),
      subAgentId: r.subAgentId ? String(r.subAgentId) : "",
      seasonId: String(r.seasonId),
      pricePerMutamer: String(r.pricePerMutamer),
      validFrom: r.validFrom,
      validTo: r.validTo,
      includesHotel: r.includesHotel,
      includesTransport: r.includesTransport,
      notes: r.notes ?? "",
    });
    setEditingId(r.id);
  };
  const handleSave = async (values: PricingForm) => {
    const payload: Partial<PricingRow> = {
      agentId: Number(values.agentId),
      subAgentId: values.subAgentId ? Number(values.subAgentId) : null,
      seasonId: Number(values.seasonId),
      pricePerMutamer: Number(values.pricePerMutamer),
      validFrom: values.validFrom,
      validTo: values.validTo,
      includesHotel: values.includesHotel,
      includesTransport: values.includesTransport,
      notes: values.notes || undefined,
    };
    if (typeof editingId === "number") await updateMut.mutateAsync({ ...payload, id: editingId });
    else await createMut.mutateAsync(payload);
  };

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
          onClick={() => {
            setEditingDefaults({
              ...PRICING_EMPTY,
              includesHotel: true,
              seasonId: activeSeason?.id ? String(activeSeason.id) : "",
            });
            setEditingId("new");
          }}
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
                                onClick={() => openEdit(r)}
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
      <Dialog open={editingId !== null} onOpenChange={(o) => !o && closeEditor()}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{typeof editingId === "number" ? "تعديل تسعيرة" : "تسعيرة جديدة"}</DialogTitle>
          </DialogHeader>
          <FormShell
            key={String(editingId ?? "closed")}
            schema={pricingSchema}
            defaultValues={editingDefaults}
            submitLabel={
              createMut.isPending || updateMut.isPending ? "جاري الحفظ..." : "حفظ"
            }
            secondaryActions={
              <Button type="button" variant="outline" onClick={closeEditor}>إلغاء</Button>
            }
            onSubmit={handleSave}
          >
            <FormGrid cols={2}>
              <FormSelectField
                name="agentId"
                label="الوكيل الرئيسي"
                required
                options={agents.map((a: any) => ({ value: String(a.id), label: a.name }))}
                placeholder="اختر الوكيل"
              />
              <SubAgentPicker subAgents={subAgents} />
              <FormSelectField
                name="seasonId"
                label="الموسم"
                required
                options={seasons.map((s: any) => ({ value: String(s.id), label: s.title }))}
                placeholder="اختر الموسم"
              />
              <FormNumberField name="pricePerMutamer" label="السعر للمعتمر" required />
              <FormDateField name="validFrom" label="ساري من" required />
              <FormDateField name="validTo" label="ساري إلى" required />
              <FormCheckboxField name="includesHotel" label="يشمل الفندق" className="pt-5" />
              <FormCheckboxField name="includesTransport" label="يشمل النقل" className="pt-5" />
              <FormTextareaField name="notes" label="ملاحظات" rows={2} className="md:col-span-2" />
            </FormGrid>
          </FormShell>
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
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <GuardedButton
              perm="umrah:write"
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteId && deleteMut.mutate({ id: deleteId })}
            >
              {deleteMut.isPending ? "جاري الحذف..." : "حذف"}
            </GuardedButton>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
