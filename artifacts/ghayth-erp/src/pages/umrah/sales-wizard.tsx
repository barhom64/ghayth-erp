import { useEffect, useMemo, useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageShell, DataTable } from "@workspace/ui-core";
import { PageStateWrapper } from "@/components/shared/page-state";
import { GuardedButton } from "@/components/shared/permission-gate";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatUmrahDate } from "@/lib/formatters";
import { Receipt, Sparkles, Hand, TagsIcon } from "lucide-react";

// ── Sales-invoice wizard ─────────────────────────────────────────────────
// Smart per-group pricing. When the user picks a sub-agent we fetch every
// group that hasn't been billed yet and pre-fill the per-mutamer price from:
//
//   1. Last invoice line for this sub-agent — "do it again" intuition.
//   2. Matching umrah_pricing rule for the group's entry date.
//   3. The sub-agent's defaultPricePerMutamer fallback.
//   4. Empty — operator must type.
//
// The badge next to each row tells the operator where the suggestion came
// from so they can spot anomalies without flipping back to another page.
// Submitting builds one invoice with one line per group, threading the
// final per-group prices through POST /umrah/invoices/generate as
// `manualPrices: { [groupId]: pricePerMutamer }`.

interface SubAgent { id: number; name: string }
interface Season { id: number; title: string; isCurrent?: boolean }
interface UninvoicedGroup {
  id: number;
  nuskGroupNumber: string;
  name: string | null;
  mutamerCount: number;
  entryDate: string | null;
  suggestedPrice: number | null;
  suggestedSource: "last_invoice" | "pricing_rule" | "default_per_mutamer" | "none";
}
interface WizardResponse {
  subAgent: { id: number; name: string; clientId: number | null; clientName: string | null };
  groups: UninvoicedGroup[];
}

const SOURCE_LABEL: Record<UninvoicedGroup["suggestedSource"], { text: string; tone: string; icon: typeof Sparkles }> = {
  last_invoice:         { text: "آخر فاتورة", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Sparkles },
  pricing_rule:         { text: "قاعدة تسعير", tone: "bg-status-info-surface text-status-info-foreground border-status-info-surface",       icon: TagsIcon },
  default_per_mutamer:  { text: "افتراضي الوكيل", tone: "bg-status-warning-surface text-status-warning-foreground border-status-warning-surface",    icon: TagsIcon },
  none:                 { text: "أدخل يدوياً",  tone: "bg-rose-50 text-rose-700 border-rose-200",        icon: Hand },
};

export default function UmrahSalesWizard() {
  const { toast } = useToast();
  const subAgentsQ = useApiQuery<{ data: SubAgent[] }>(["umrah-sub-agents"], "/umrah/sub-agents");
  const seasonsQ = useApiQuery<{ data: Season[] }>(["umrah-seasons"], "/umrah/seasons");

  const [subAgentId, setSubAgentId] = useState<string>("");
  const [seasonId, setSeasonId] = useState<string>("");
  const [prices, setPrices] = useState<Record<number, string>>({});

  // currentSeason auto-select on first load so the operator types less.
  const currentSeasonId = useMemo(() => {
    const list = seasonsQ.data?.data ?? [];
    return list.find((s) => s.isCurrent)?.id ?? list[0]?.id ?? null;
  }, [seasonsQ.data]);
  if (currentSeasonId && !seasonId) setSeasonId(String(currentSeasonId));

  // Static URL so the audit credits /umrah/sales-wizard/uninvoiced-groups.
  // The `enabled` arg below gates the fetch until subAgentId is picked.
  const wizardSuffix = `?subAgentId=${subAgentId}${seasonId ? `&seasonId=${seasonId}` : ""}`;
  const wizardQ = useApiQuery<WizardResponse>(
    ["umrah-sales-wizard", subAgentId, seasonId],
    `/umrah/sales-wizard/uninvoiced-groups${wizardSuffix}`,
    !!subAgentId,
  );

  // Hydrate the local prices map whenever the server returns groups.
  // We only seed inputs that haven't been touched yet — operator edits stick.
  const groups = wizardQ.data?.groups ?? [];
  // Side effect (seeding local price inputs) belongs in useEffect, never
  // useMemo — a setState in the render phase is the infinite-loop footgun.
  useEffect(() => {
    if (!groups.length) return;
    setPrices((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const g of groups) {
        if (next[g.id] === undefined && g.suggestedPrice != null) {
          next[g.id] = String(g.suggestedPrice);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [groups]);

  const generate = useApiMutation<any, any>(
    "/umrah/invoices/generate",
    "POST",
    [["umrah-sales-wizard"], ["umrah-invoices"]],
  );

  const handleSubmit = async () => {
    if (!subAgentId || !seasonId || groups.length === 0) return;
    const manualPrices: Record<number, number> = {};
    const missing: string[] = [];
    for (const g of groups) {
      const raw = prices[g.id];
      const v = raw != null ? Number(raw) : NaN;
      if (!Number.isFinite(v) || v <= 0) {
        missing.push(g.nuskGroupNumber);
        continue;
      }
      manualPrices[g.id] = v;
    }
    if (missing.length > 0) {
      toast({
        variant: "destructive",
        title: "أسعار ناقصة",
        description: `يرجى إدخال سعر صحيح للمجموعات: ${missing.join(", ")}`,
      });
      return;
    }
    try {
      const result: any = await generate.mutateAsync({
        subAgentId: Number(subAgentId),
        seasonId: Number(seasonId),
        groupIds: groups.map((g) => g.id),
        manualPrices,
      });
      // Selling-below-cost guardrail — the backend (PR #1457) now
      // returns this flag when subtotal < costBasis (the operator
      // would be taking a loss). Surface as a destructive-variant
      // toast in addition to the success one so it can't be missed.
      // VAT is still clamped at zero on the loss case, but the
      // operator should know they priced below the NUSK cost.
      if (result?.sellingBelowCost === true) {
        toast({
          variant: "destructive",
          title: "تحذير: بيع أقل من التكلفة",
          description: `تكلفة نسك: ${formatCurrency(Number(result?.costBasis ?? 0))} — راجع الأسعار قبل المتابعة`,
        });
      }
      // Success toast shows ref + total. Margin is surfaced when
      // available so the operator sees gross profit at a glance —
      // matches PR #1438's pattern of putting financial signal where
      // operators already look.
      const marginPart = result?.marginBase != null
        ? ` (هامش: ${formatCurrency(Number(result.marginBase))})`
        : "";
      toast({
        title: "تم إنشاء الفاتورة",
        description: `${result?.ref ?? ""} — ${formatCurrency(Number(result?.total ?? 0))}${marginPart}`,
      });
      setPrices({});
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر إنشاء الفاتورة", description: err?.message ?? "" });
    }
  };

  const total = useMemo(() => {
    let sum = 0;
    for (const g of groups) {
      const raw = prices[g.id];
      const v = raw != null ? Number(raw) : NaN;
      if (Number.isFinite(v) && v > 0) sum += v * g.mutamerCount;
    }
    return sum;
  }, [groups, prices]);

  return (
    <PageShell title="إنشاء فاتورة مبيعات — معالج ذكي"
      breadcrumbs={[
        { href: "/umrah", label: "العمرة" },
        { label: "إنشاء فاتورة مبيعات — معالج ذكي" },
      ]}>
      <UmrahTabsNav />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base inline-flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            اختر الوكيل الفرعي + الموسم
          </CardTitle>
          <p className="text-xs text-muted-foreground">سيقوم النظام باستحضار المجموعات غير المفوترة + اقتراح سعر لكل واحدة بناء على آخر فاتورة أو قاعدة التسعير.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>الوكيل الفرعي</Label>
            <Select value={subAgentId} onValueChange={setSubAgentId}>
              <SelectTrigger><SelectValue placeholder="اختر الوكيل الفرعي" /></SelectTrigger>
              <SelectContent>
                {(subAgentsQ.data?.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الموسم</Label>
            <Select value={seasonId} onValueChange={setSeasonId}>
              <SelectTrigger><SelectValue placeholder="اختر الموسم" /></SelectTrigger>
              <SelectContent>
                {(seasonsQ.data?.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.title}{s.isCurrent ? " (الحالي)" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {subAgentId && (
        <PageStateWrapper isLoading={wizardQ.isLoading} error={wizardQ.error} isEmpty={!wizardQ.isLoading && !wizardQ.error && groups.length === 0} emptyText="لا توجد مجموعات غير مفوترة لهذا الوكيل الفرعي.">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                المجموعات غير المفوترة — {wizardQ.data?.subAgent.name}
                {wizardQ.data?.subAgent.clientName && (
                  <Badge variant="outline" className="ms-2 text-xs">{wizardQ.data.subAgent.clientName}</Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">عدّل السعر يدوياً لو احتجت — الافتراضي مأخوذ من آخر فاتورة أو القاعدة المطابقة.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <DataTable<(typeof groups)[number]>
                noToolbar
                pageSize={0}
                data={groups}
                rowKey={(g) => g.id}
                columns={[
                  {
                    key: "group", header: "المجموعة", sortable: false,
                    render: (g) => (
                      <>
                        <div className="font-medium">{g.nuskGroupNumber}</div>
                        <div className="text-xs text-muted-foreground">{g.name ?? "—"}</div>
                      </>
                    ),
                    footer: () => <span className="text-sm text-muted-foreground font-normal">الإجمالي قبل الضريبة + الغرامات</span>,
                  },
                  { key: "mutamerCount", header: "عدد المعتمرين", sortable: false, render: (g) => g.mutamerCount },
                  { key: "entryDate", header: "تاريخ الدخول", sortable: false, className: "text-xs", render: (g) => (g.entryDate ? formatUmrahDate(g.entryDate) : "—") },
                  {
                    key: "price", header: "سعر المعتمر (ر.س)", sortable: false,
                    render: (g) => (
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="h-8 w-32"
                        value={prices[g.id] ?? ""}
                        onChange={(e) => setPrices((p) => ({ ...p, [g.id]: e.target.value }))}
                      />
                    ),
                  },
                  {
                    key: "source", header: "المصدر", sortable: false,
                    render: (g) => {
                      const meta = SOURCE_LABEL[g.suggestedSource];
                      const SourceIcon = meta.icon;
                      return (
                        <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] ${meta.tone}`}>
                          <SourceIcon className="h-3 w-3" />
                          {meta.text}
                        </span>
                      );
                    },
                  },
                  {
                    key: "lineTotal", header: "إجمالي المجموعة", sortable: false, align: "end", className: "font-medium",
                    render: (g) => {
                      const raw = prices[g.id];
                      const price = raw != null ? Number(raw) : NaN;
                      const lineTotal = Number.isFinite(price) && price > 0 ? price * g.mutamerCount : 0;
                      return formatCurrency(lineTotal);
                    },
                    footer: () => <span className="font-semibold">{formatCurrency(total)}</span>,
                  },
                ]}
              />

              <div className="flex justify-end pt-2">
                <GuardedButton
                  perm="umrah:create"
                  onClick={handleSubmit}
                  disabled={generate.isPending || groups.length === 0}
                >
                  {generate.isPending ? "جاري الإنشاء…" : "إنشاء فاتورة"}
                </GuardedButton>
              </div>
            </CardContent>
          </Card>
        </PageStateWrapper>
      )}
    </PageShell>
  );
}
