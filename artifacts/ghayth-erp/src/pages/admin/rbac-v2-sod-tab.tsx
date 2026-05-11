import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { ShieldAlert, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
          <p className="text-xs text-gray-500 mt-1">
            تمنع اجتماع صلاحيتين متعارضتين في دور واحد (مَن يُنشئ القيد لا يَعتمده).
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 me-1" />
          قاعدة جديدة
        </Button>
      </div>

      {violations.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <p className="text-sm text-red-700">
              {violations.length} قاعدة منتهَكة حالياً —
              {violations.reduce((s, v) => s + v.offenders.length, 0)} دور متأثر
            </p>
          </CardContent>
        </Card>
      )}

      <div className="border rounded overflow-x-auto">
        <div className="grid grid-cols-12 gap-2 items-center py-2 px-3 bg-gray-100 border-b text-xs font-semibold text-gray-600 min-w-[600px]">
          <div className="col-span-3">القاعدة</div>
          <div className="col-span-5">الإجراءات المتعارضة</div>
          <div className="col-span-1">الشدة</div>
          <div className="col-span-2">الحالة</div>
          <div className="col-span-1">إجراء</div>
        </div>
        {rules.map((r) => {
          const offenders = violationsByRuleId.get(r.id) || [];
          return (
            <div key={r.id} className="grid grid-cols-12 gap-2 items-center py-2 px-3 border-b last:border-b-0 hover:bg-gray-50 min-w-[600px]">
              <div className="col-span-3">
                <p className="text-sm font-medium">{r.label_ar}</p>
                <p className="text-[10px] text-gray-400 font-mono">{r.rule_key}</p>
              </div>
              <div className="col-span-5 text-xs font-mono text-gray-700">
                {r.feature_a}.{r.action_a} <span className="text-red-500">↔</span> {r.feature_b}.{r.action_b}
              </div>
              <div className="col-span-1">
                <Badge className={`text-xs ${SEVERITY_COLORS[r.severity]}`}>{SEVERITY_LABELS[r.severity]}</Badge>
              </div>
              <div className="col-span-2">
                <button
                  onClick={() => toggleActive(r)}
                  className={`px-2 py-1 rounded text-xs border ${
                    r.is_active ? "bg-green-50 border-green-300 text-green-700" : "bg-gray-100 border-gray-300 text-gray-500"
                  }`}
                >
                  {r.is_active ? "مُفعَّلة" : "مُعطَّلة"}
                </button>
                {offenders.length > 0 && (
                  <Badge className="ms-1 text-xs bg-red-100 text-red-700">{offenders.length} منتهك</Badge>
                )}
              </div>
              <div className="col-span-1">
                <Button size="sm" variant="ghost" onClick={() => remove(r)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        {rules.length === 0 && (
          <p className="p-6 text-center text-gray-400 text-sm">لا توجد قواعد بعد</p>
        )}
      </div>

      <AddSodRuleDialog open={showAdd} onClose={() => setShowAdd(false)} features={features} onCreated={() => refetch()} />

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

function AddSodRuleDialog({ open, onClose, features, onCreated }: {
  open: boolean; onClose: () => void; features: Feature[]; onCreated: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    ruleKey: "",
    labelAr: "",
    featureA: "",
    actionA: "",
    featureB: "",
    actionB: "",
    severity: "high" as SodRule["severity"],
  });

  const submit = async () => {
    try {
      await apiFetch("/rbac/v2/sod", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "تم إنشاء القاعدة" });
      onCreated();
      onClose();
      setForm({ ruleKey: "", labelAr: "", featureA: "", actionA: "", featureB: "", actionB: "", severity: "high" });
    } catch (err: any) {
      toast({ title: "فشل الإنشاء", description: err?.message || "خطأ", variant: "destructive" });
    }
  };

  const featA = features.find((f) => f.feature_key === form.featureA);
  const featB = features.find((f) => f.feature_key === form.featureB);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>قاعدة فصل مهام جديدة</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="المفتاح (مثال: my_rule)" value={form.ruleKey} onChange={(e) => setForm((f) => ({ ...f, ruleKey: e.target.value }))} />
            <Input placeholder="الاسم بالعربية" value={form.labelAr} onChange={(e) => setForm((f) => ({ ...f, labelAr: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.featureA} onValueChange={(v) => setForm((f) => ({ ...f, featureA: v, actionA: "" }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="الميزة A" /></SelectTrigger>
              <SelectContent>
                {features.map((f) => <SelectItem key={f.feature_key} value={f.feature_key} className="text-sm">{f.label_ar}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.actionA} onValueChange={(v) => setForm((f) => ({ ...f, actionA: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="الإجراء A" /></SelectTrigger>
              <SelectContent>
                {(featA?.available_actions || []).map((a) => <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="text-center text-red-500">↔</div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.featureB} onValueChange={(v) => setForm((f) => ({ ...f, featureB: v, actionB: "" }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="الميزة B" /></SelectTrigger>
              <SelectContent>
                {features.map((f) => <SelectItem key={f.feature_key} value={f.feature_key} className="text-sm">{f.label_ar}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.actionB} onValueChange={(v) => setForm((f) => ({ ...f, actionB: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="الإجراء B" /></SelectTrigger>
              <SelectContent>
                {(featB?.available_actions || []).map((a) => <SelectItem key={a} value={a} className="text-sm">{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Select value={form.severity} onValueChange={(v: any) => setForm((f) => ({ ...f, severity: v }))}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="critical" className="text-sm">حرج</SelectItem>
              <SelectItem value="high" className="text-sm">مرتفع</SelectItem>
              <SelectItem value="medium" className="text-sm">متوسط</SelectItem>
              <SelectItem value="low" className="text-sm">منخفض</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={!form.ruleKey || !form.labelAr || !form.featureA || !form.actionA || !form.featureB || !form.actionB}>
            إنشاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
