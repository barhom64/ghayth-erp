import { useState } from "react";
import { z } from "zod";
import { useFormContext, useWatch } from "react-hook-form";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { ShieldAlert, Plus, Trash2, AlertTriangle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  FormShell,
  FormTextField,
  FormSelectField,
  FormGrid,
} from "@/components/form-shell";

// Schema for the create-rule form. ruleKey is regex-locked (lowercase
// + underscore), feature/action pairs are required. severity is a
// real zod enum.
const sodRuleSchema = z.object({
  ruleKey: z.string()
    .min(1, "المفتاح مطلوب")
    .regex(/^[a-z_]+$/, "أحرف إنجليزية صغيرة وشرطة سفلية فقط"),
  labelAr: z.string().trim().min(1, "الاسم بالعربية مطلوب"),
  featureA: z.string().min(1, "الميزة A مطلوبة"),
  actionA: z.string().min(1, "الإجراء A مطلوب"),
  featureB: z.string().min(1, "الميزة B مطلوبة"),
  actionB: z.string().min(1, "الإجراء B مطلوب"),
  severity: z.enum(["critical", "high", "medium", "low"]),
});
type SodRuleForm = z.infer<typeof sodRuleSchema>;

interface SodRule {
  id: number;
  rule_key: string;
  label_ar: string;
  feature_a: string;
  action_a: string;
  feature_b: string;
  action_b: string;
  severity: "critical" | "high" | "medium" | "low";
  is_active: boolean;
}

interface SodViolation {
  rule: SodRule;
  offenders: Array<{ userId: number; role_id: number; role_key: string; label_ar: string }>;
}

interface Feature {
  feature_key: string;
  label_ar: string;
  available_actions: string[];
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: "حرج",
  high: "مرتفع",
  medium: "متوسط",
  low: "منخفض",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-700 text-white",
  high: "bg-red-500 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-yellow-500 text-white",
};

export function SodRulesTab() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  // Replaces window.confirm() — the dialog owns the DELETE call and
  // surfaces 409 blockers inline if the server refuses (e.g. rules
  // referenced by active assignments).
  const [deletingRule, setDeletingRule] = useState<SodRule | null>(null);

  const { data: sodData, refetch, isLoading } = useApiQuery<{ rules: SodRule[]; violations: SodViolation[] }>(
    ["rbac-sod"],
    "/rbac/v2/sod"
  );
  const { data: featuresData } = useApiQuery<{ features: Feature[] }>(["rbac-features"], "/rbac/v2/features");

  const rules = sodData?.rules || [];
  const violations = sodData?.violations || [];
  const features = featuresData?.features || [];
  const violationsByRuleId = new Map(violations.map((v) => [v.rule.id, v.offenders]));

  const toggleActive = async (rule: SodRule) => {
    try {
      await apiFetch(`/rbac/v2/sod/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !rule.is_active }),
      });
      refetch();
    } catch (err: any) {
      toast({ title: "فشل التعديل", description: err?.message || "خطأ", variant: "destructive" });
    }
  };

  // Open the confirm dialog — the actual DELETE fires from inside
  // ConfirmDeleteDialog via the deletePath it's handed below.
  const remove = (rule: SodRule) => {
    setDeletingRule(rule);
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            قواعد فصل المهام (SoD) — {rules.length}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            تمنع اجتماع صلاحيتين متعارضتين في دور واحد (مَن يُنشئ القيد لا يَعتمده).
          </p>
        </div>
        <GuardedButton perm="admin:create" size="sm" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />قاعدة جديدة</>}
        </GuardedButton>
      </div>

      {showAdd && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">قاعدة فصل مهام جديدة</CardTitle></CardHeader>
          <CardContent>
            <AddSodRuleForm features={features} onCreated={() => { setShowAdd(false); refetch(); }} />
          </CardContent>
        </Card>
      )}

      {violations.length > 0 && (
        <Card className="border-status-error-surface bg-status-error-surface">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-status-error-foreground" />
            <p className="text-sm text-status-error-foreground">
              {violations.length} قاعدة منتهَكة حالياً —
              {violations.reduce((s, v) => s + v.offenders.length, 0)} دور متأثر
            </p>
          </CardContent>
        </Card>
      )}

      <div className="border rounded overflow-x-auto">
        <div className="grid grid-cols-12 gap-2 items-center py-2 px-3 bg-surface-subtle border-b text-xs font-semibold text-muted-foreground min-w-[600px]">
          <div className="col-span-3">القاعدة</div>
          <div className="col-span-5">الإجراءات المتعارضة</div>
          <div className="col-span-1">الشدة</div>
          <div className="col-span-2">الحالة</div>
          <div className="col-span-1">إجراء</div>
        </div>
        {rules.map((r) => {
          const offenders = violationsByRuleId.get(r.id) || [];
          return (
            <div key={r.id} className="grid grid-cols-12 gap-2 items-center py-2 px-3 border-b last:border-b-0 hover:bg-surface-subtle min-w-[600px]">
              <div className="col-span-3">
                <p className="text-sm font-medium">{r.label_ar}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{r.rule_key}</p>
              </div>
              <div className="col-span-5 text-xs font-mono text-status-neutral-foreground">
                {r.feature_a}.{r.action_a} <span className="text-status-error">↔</span> {r.feature_b}.{r.action_b}
              </div>
              <div className="col-span-1">
                <Badge className={`text-xs ${SEVERITY_COLORS[r.severity]}`}>{SEVERITY_LABELS[r.severity]}</Badge>
              </div>
              <div className="col-span-2">
                <button
                  onClick={() => toggleActive(r)}
                  className={`px-2 py-1 rounded text-xs border ${
                    r.is_active ? "bg-status-success-surface border-status-success-surface text-status-success-foreground" : "bg-surface-subtle border-border text-muted-foreground"
                  }`}
                >
                  {r.is_active ? "مُفعَّلة" : "مُعطَّلة"}
                </button>
                {offenders.length > 0 && (
                  <Badge className="ms-1 text-xs bg-status-error-surface text-status-error-foreground">{offenders.length} منتهك</Badge>
                )}
              </div>
              <div className="col-span-1">
                <GuardedButton perm="admin:create" size="sm" variant="ghost" onClick={() => remove(r)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </GuardedButton>
              </div>
            </div>
          );
        })}
        {rules.length === 0 && (
          <p className="p-6 text-center text-muted-foreground text-sm">لا توجد قواعد بعد</p>
        )}
      </div>

      <ConfirmDeleteDialog
        open={deletingRule !== null}
        onOpenChange={(v) => { if (!v) setDeletingRule(null); }}
        entity={{
          type: "rbac_sod_rule",
          id: deletingRule?.id ?? 0,
          name: deletingRule?.label_ar ?? "",
        }}
        deletePath={`/rbac/v2/sod/${deletingRule?.id}`}
        invalidateKeys={[["rbac-sod"]]}
        successMessage="تم الحذف"
        onDeleted={() => { setDeletingRule(null); refetch(); }}
      />
    </div>
  );
}

function AddSodRuleForm({ features, onCreated }: { features: Feature[]; onCreated: () => void }) {
  const { toast } = useToast();

  const submit = async (values: SodRuleForm) => {
    try {
      await apiFetch("/rbac/v2/sod", { method: "POST", body: JSON.stringify(values) });
      toast({ title: "تم إنشاء القاعدة" });
      onCreated();
    } catch (err: any) {
      toast({ title: "فشل الإنشاء", description: err?.message || "خطأ", variant: "destructive" });
    }
  };

  return (
    <FormShell
      schema={sodRuleSchema}
      defaultValues={{
        ruleKey: "",
        labelAr: "",
        featureA: "",
        actionA: "",
        featureB: "",
        actionB: "",
        severity: "high" as const,
      }}
      submitLabel="إنشاء"
      onSubmit={async (values) => {
        await submit(values);
      }}
    >
      <FormGrid cols={2}>
        <FormTextField name="ruleKey" label="المفتاح" required placeholder="my_rule" />
        <FormTextField name="labelAr" label="الاسم بالعربية" required placeholder="اسم القاعدة" />
        <FormSelectField
          name="featureA"
          label="الميزة A"
          required
          options={[
            { value: "", label: "اختر الميزة" },
            ...features.map((f) => ({ value: f.feature_key, label: f.label_ar })),
          ]}
        />
        <ActionPicker pairKey="A" features={features} />
      </FormGrid>
      <div className="text-center text-status-error my-2">↔</div>
      <FormGrid cols={2}>
        <FormSelectField
          name="featureB"
          label="الميزة B"
          required
          options={[
            { value: "", label: "اختر الميزة" },
            ...features.map((f) => ({ value: f.feature_key, label: f.label_ar })),
          ]}
        />
        <ActionPicker pairKey="B" features={features} />
      </FormGrid>
      <div className="mt-3">
        <FormSelectField
          name="severity"
          label="الشدة"
          options={[
            { value: "critical", label: "حرج" },
            { value: "high", label: "مرتفع" },
            { value: "medium", label: "متوسط" },
            { value: "low", label: "منخفض" },
          ]}
        />
      </div>
    </FormShell>
  );
}

// Dependent dropdown: action options depend on the selected feature.
// useWatch tracks the parent select; key={selectedFeature} remounts
// the action field whenever the feature changes so its stale value
// is cleared (the old action probably isn't in the new feature's
// available_actions list).
function ActionPicker({ pairKey, features }: { pairKey: "A" | "B"; features: Feature[] }) {
  const featureName = `feature${pairKey}` as const;
  const actionName = `action${pairKey}` as const;
  const selectedFeature = useWatch<SodRuleForm>({ name: featureName }) as unknown as string;
  const feat = features.find((f) => f.feature_key === selectedFeature);
  return (
    <FormSelectField
      key={selectedFeature}
      name={actionName}
      label={`الإجراء ${pairKey}`}
      required
      options={[
        { value: "", label: selectedFeature ? "اختر الإجراء" : "اختر الميزة أولاً" },
        ...(feat?.available_actions ?? []).map((a) => ({ value: a, label: a })),
      ]}
    />
  );
}
