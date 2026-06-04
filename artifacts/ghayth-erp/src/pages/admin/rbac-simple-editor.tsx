import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { apiFetch, useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save, Shield } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// مُحرّر الصلاحيات المبسّط — مستوى + نطاق عربي لكل ميزة (لمستخدم غير تقني)
// يستهلك GET /rbac/v2/levels + /features + /roles + /roles/:id/grants
// ويحفظ عبر PUT /rbac/v2/roles/:id/grants/simple. الفرض يبقى على المحرك.
// ─────────────────────────────────────────────────────────────────────────────

interface LevelDef { key: string; labelAr: string; descriptionAr: string; rank: number; actions: string[] }
interface TierDef { key: string; labelAr: string; rank: number; scope: string }
interface Catalog { levels: LevelDef[]; scopeTiers: TierDef[] }
interface Feature { feature_key: string; module_key?: string; moduleKey?: string; label_ar?: string; labelAr?: string; available_actions?: string[]; availableActions?: string[]; available_scopes?: string[]; availableScopes?: string[] }
interface Role { id: number; role_key: string; label_ar: string; is_system?: boolean }
interface Grant { feature_key: string; actions: string[]; scope: string }

const arr = (a?: string[]) => (Array.isArray(a) ? a : []);

// أعلى مستوى تكون كل أفعاله المتاحة للميزة مشمولة في الممنوح (نسخة عميل من levelOfActions).
function levelForActions(granted: string[], available: string[], levels: LevelDef[]): string {
  const have = new Set(granted);
  const avail = new Set(available);
  const seen = new Set<string>();
  let best = "none";
  for (const lvl of [...levels].sort((a, b) => a.rank - b.rank)) {
    const required = lvl.actions.filter((x) => avail.has(x));
    const sig = [...required].sort().join(",");
    if (lvl.key !== "none" && seen.has(sig)) continue;
    seen.add(sig);
    if (required.length === 0 && lvl.key !== "none") continue;
    if (required.every((x) => have.has(x))) best = lvl.key;
  }
  return best;
}

function tierForScope(scope: string, tiers: TierDef[]): string {
  const exact = tiers.find((t) => t.scope === scope);
  return exact ? exact.key : "self";
}

export default function RbacSimpleEditor() {
  const { toast } = useToast();
  const { data: catalog } = useApiQuery<Catalog>(["rbac-levels"], "/rbac/v2/levels");
  const { data: featuresData, isLoading: fLoad, error: fErr, refetch } = useApiQuery<{ features: Feature[] }>(["rbac-features"], "/rbac/v2/features");
  const { data: rolesData } = useApiQuery<{ data: Role[] }>(["rbac-roles"], "/rbac/v2/roles");

  const [roleId, setRoleId] = useState<number | null>(null);
  const { data: grantsData } = useApiQuery<{ grants: Grant[] }>(
    ["rbac-role-grants-simple", String(roleId ?? 0)],
    roleId ? `/rbac/v2/roles/${roleId}/grants` : "/rbac/v2/roles/0/grants",
  );

  // featureKey → { level, scopeTier }
  const [picks, setPicks] = useState<Record<string, { level: string; scopeTier: string }>>({});
  const [saving, setSaving] = useState(false);

  const features = featuresData?.features ?? [];
  const levels = catalog?.levels ?? [];
  const tiers = catalog?.scopeTiers ?? [];

  const featModule = (f: Feature) => f.module_key ?? f.moduleKey ?? "عام";
  const featLabel = (f: Feature) => f.label_ar ?? f.labelAr ?? f.feature_key;
  const featActions = (f: Feature) => arr(f.available_actions ?? f.availableActions);

  // Initialise picks from the selected role's grants whenever they load.
  useEffect(() => {
    if (!roleId || !catalog || features.length === 0) return;
    const byFeature = new Map((grantsData?.grants ?? []).map((g) => [g.feature_key, g]));
    const next: Record<string, { level: string; scopeTier: string }> = {};
    for (const f of features) {
      const g = byFeature.get(f.feature_key);
      next[f.feature_key] = g
        ? { level: levelForActions(arr(g.actions), featActions(f), levels), scopeTier: tierForScope(g.scope, tiers) }
        : { level: "none", scopeTier: "self" };
    }
    setPicks(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId, grantsData, catalog, featuresData]);

  const modules = useMemo(() => {
    const m: Record<string, Feature[]> = {};
    for (const f of features) (m[featModule(f)] ??= []).push(f);
    return m;
  }, [features]);

  const setPick = (fk: string, patch: Partial<{ level: string; scopeTier: string }>) =>
    setPicks((p) => {
      const cur = p[fk] ?? { level: "none", scopeTier: "self" };
      return { ...p, [fk]: { ...cur, ...patch } };
    });

  const save = async () => {
    if (!roleId) return;
    setSaving(true);
    try {
      const grants = Object.entries(picks)
        .filter(([, v]) => v.level !== "none")
        .map(([featureKey, v]) => ({ featureKey, level: v.level, scopeTier: v.scopeTier }));
      await apiFetch(`/rbac/v2/roles/${roleId}/grants/simple`, { method: "PUT", body: JSON.stringify({ grants }) });
      toast({ title: "تم الحفظ", description: `تم تحديث ${grants.length} صلاحية.` });
    } catch {
      toast({ title: "تعذّر الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const roles = rolesData?.data ?? [];

  return (
    <PageShell
      title="الصلاحيات المبسّطة"
      breadcrumbs={[{ href: "/dashboard", label: "لوحة التحكم" }, { label: "الصلاحيات المبسّطة" }]}
      subtitle="اختر لكل ميزة مستوى صلاحية ونطاقًا — بدون مصطلحات تقنية"
      actions={
        <Button size="sm" onClick={save} disabled={!roleId || saving}>
          <Save className="h-4 w-4 me-1" /> حفظ
        </Button>
      }
    >
      <PageStateWrapper isLoading={fLoad} error={fErr} onRetry={refetch}>
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">الدور:</span>
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background"
                value={roleId ?? ""}
                onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— اختر دورًا —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.label_ar}</option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">المستويات: {levels.filter((l) => l.key !== "none").map((l) => l.labelAr).join(" · ")}</span>
            </CardContent>
          </Card>

          {roleId && Object.entries(modules).map(([mod, feats]) => (
            <Card key={mod}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2"><Shield className="w-4 h-4" /> {mod}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {feats.map((f) => {
                    const pick = picks[f.feature_key] ?? { level: "none", scopeTier: "self" };
                    return (
                      <div key={f.feature_key} className="flex flex-wrap items-center justify-between gap-2 p-3">
                        <span className="text-sm">{featLabel(f)}</span>
                        <div className="flex items-center gap-2">
                          <select
                            className="border rounded-md px-2 py-1 text-xs bg-background"
                            value={pick.level}
                            onChange={(e) => setPick(f.feature_key, { level: e.target.value })}
                          >
                            {levels.map((l) => <option key={l.key} value={l.key}>{l.labelAr}</option>)}
                          </select>
                          <select
                            className="border rounded-md px-2 py-1 text-xs bg-background"
                            value={pick.scopeTier}
                            disabled={pick.level === "none"}
                            onChange={(e) => setPick(f.feature_key, { scopeTier: e.target.value })}
                          >
                            {tiers.map((t) => <option key={t.key} value={t.key}>{t.labelAr}</option>)}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}

          {!roleId && (
            <div className="text-center text-muted-foreground py-12">
              <Shield className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>اختر دورًا لتحديد صلاحياته المبسّطة</p>
            </div>
          )}
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}
