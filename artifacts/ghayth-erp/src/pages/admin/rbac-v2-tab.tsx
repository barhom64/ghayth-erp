import { useState, useMemo, useEffect } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Shield, Plus, Save, AlertTriangle, Eye, History, Copy, Layers, EyeOff, DollarSign, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ConditionsEditor } from "./rbac-v2-conditions-editor";

interface Feature {
  feature_key: string;
  parent_key: string | null;
  module_key: string;
  label_ar: string;
  available_actions: string[];
  available_scopes: string[];
  sensitive_fields: string[];
  approvable_actions: string[];
  is_self_service: boolean;
  is_system_critical: boolean;
}

interface Role {
  id: number;
  role_key: string;
  label_ar: string;
  level: number;
  color: string;
  is_system: boolean;
  is_active: boolean;
  member_count: string;
  grant_count: string;
}

interface Grant {
  feature_key: string;
  actions: string[];
  scope: string;
  conditions?: any;
}

interface FieldPolicy {
  feature_key: string;
  field_name: string;
  mode: "visible" | "masked" | "hidden" | "readonly" | "editable";
}

interface ApprovalLimit {
  feature_key: string;
  action: string;
  currency: string;
  max_amount: number | null;
  requires_dual_control: boolean;
}

interface HistoryEntry {
  id: number;
  changedBy: number;
  changedByName: string | null;
  change_type: string;
  before_state: any;
  after_state: any;
  reason: string | null;
  createdAt: string;
}

const SCOPE_LABELS: Record<string, string> = {
  self: "بياناتي فقط",
  team: "فريقي",
  department: "قسمي",
  department_tree: "قسمي والأقسام التابعة",
  branch: "فرعي",
  branches: "فروعي المسموحة",
  company: "الشركة كاملة",
  multi_company: "شركاتي",
  all: "كل البيانات",
};

const ACTION_LABELS: Record<string, string> = {
  view: "عرض", list: "قراءة قائمة", create: "إنشاء", update: "تعديل",
  delete: "حذف", approve: "اعتماد", reject: "رفض", cancel: "إلغاء",
  export: "تصدير", print: "طباعة", share: "مشاركة", submit: "تقديم",
  reopen: "إعادة فتح", close: "إغلاق",
};

const FIELD_MODE_LABELS: Record<string, string> = {
  visible: "ظاهر",
  masked: "مُقنَّع",
  hidden: "مخفي",
  readonly: "للقراءة فقط",
  editable: "قابل للتعديل",
};

const FIELD_MODE_COLORS: Record<string, string> = {
  visible: "bg-status-success-surface text-status-success-foreground border-status-success-surface",
  masked: "bg-status-warning-surface text-status-warning-foreground border-status-warning-surface",
  hidden: "bg-status-error-surface text-status-error-foreground border-status-error-surface",
  readonly: "bg-status-info-surface text-status-info-foreground border-status-info-surface",
  editable: "bg-purple-50 text-purple-700 border-purple-300",
};

export function RbacV2Tab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [editingGrants, setEditingGrants] = useState<Map<string, Grant>>(new Map());
  const [editingFields, setEditingFields] = useState<Map<string, FieldPolicy>>(new Map());
  const [editingLimits, setEditingLimits] = useState<Map<string, ApprovalLimit>>(new Map());
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("grants");
  const [showSimulate, setShowSimulate] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const { data: featuresData, isLoading: featLoading, isError: featErr } = useApiQuery<{ features: Feature[] }>(
    ["rbac-features"],
    "/rbac/v2/features"
  );
  const { data: rolesData, isLoading: rolesLoading, isError: rolesErr, refetch: refetchRoles } = useApiQuery<{ data: Role[] }>(
    ["rbac-roles"],
    "/rbac/v2/roles"
  );
  const { data: grantsData, refetch: refetchGrants } = useApiQuery<{ grants: Grant[] }>(
    ["rbac-role-grants", String(selectedRoleId || "")],
    selectedRoleId ? `/rbac/v2/roles/${selectedRoleId}/grants` : "/rbac/v2/roles/0/grants",
    !!selectedRoleId
  );
  const { data: fieldsData } = useApiQuery<{ policies: FieldPolicy[] }>(
    ["rbac-role-fields", String(selectedRoleId || "")],
    selectedRoleId ? `/rbac/v2/roles/${selectedRoleId}/field-policies` : "/rbac/v2/roles/0/field-policies",
    !!selectedRoleId
  );
  const { data: limitsData } = useApiQuery<{ limits: ApprovalLimit[] }>(
    ["rbac-role-limits", String(selectedRoleId || "")],
    selectedRoleId ? `/rbac/v2/roles/${selectedRoleId}/approval-limits` : "/rbac/v2/roles/0/approval-limits",
    !!selectedRoleId
  );
  const { data: sodData } = useApiQuery<{ violations: any[] }>(["rbac-sod"], "/rbac/v2/sod");

  const features = featuresData?.features || [];
  const roles = rolesData?.data || [];
  const grants = grantsData?.grants || [];

  const featureTree = useMemo(() => {
    const tree = new Map<string, Feature[]>();
    for (const f of features) {
      const parent = f.parent_key || "__root__";
      if (!tree.has(parent)) tree.set(parent, []);
      tree.get(parent)!.push(f);
    }
    return tree;
  }, [features]);

  useEffect(() => {
    const map = new Map<string, Grant>();
    for (const g of grants) map.set(g.feature_key, { ...g });
    setEditingGrants(map);
  }, [grants]);

  useEffect(() => {
    const map = new Map<string, FieldPolicy>();
    for (const p of fieldsData?.policies || []) {
      map.set(`${p.feature_key}::${p.field_name}`, { ...p });
    }
    setEditingFields(map);
  }, [fieldsData]);

  useEffect(() => {
    const map = new Map<string, ApprovalLimit>();
    for (const l of limitsData?.limits || []) {
      map.set(`${l.feature_key}::${l.action}::${l.currency}`, { ...l });
    }
    setEditingLimits(map);
  }, [limitsData]);

  const updateGrant = (featureKey: string, patch: Partial<Grant>) => {
    setEditingGrants((prev) => {
      const next = new Map(prev);
      const cur = next.get(featureKey) || { feature_key: featureKey, actions: [], scope: "self" };
      next.set(featureKey, { ...cur, ...patch });
      return next;
    });
  };

  const toggleAction = (feature: Feature, action: string) => {
    const cur = editingGrants.get(feature.feature_key);
    const actions = cur?.actions || [];
    const next = actions.includes(action) ? actions.filter((a) => a !== action) : [...actions, action];
    if (next.length === 0) {
      const map = new Map(editingGrants);
      map.delete(feature.feature_key);
      setEditingGrants(map);
    } else {
      updateGrant(feature.feature_key, {
        feature_key: feature.feature_key,
        actions: next,
        scope: cur?.scope || feature.available_scopes[0] || "self",
      });
    }
  };

  const saveGrants = async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    try {
      const payload = {
        grants: Array.from(editingGrants.values()).map((g) => ({
          featureKey: g.feature_key,
          actions: g.actions,
          scope: g.scope,
          conditions: g.conditions ?? null,
        })),
      };
      await apiFetch(`/rbac/v2/roles/${selectedRoleId}/grants`, { method: "PUT", body: JSON.stringify(payload) });
      toast({ title: "تم حفظ الصلاحيات", description: `تم تحديث ${payload.grants.length} ميزة.` });
      qc.invalidateQueries({ queryKey: ["rbac-role-grants"] });
      qc.invalidateQueries({ queryKey: ["rbac-sod"] });
      refetchGrants();
      refetchRoles();
    } catch (err: any) {
      toast({ title: "فشل الحفظ", description: err?.message || "خطأ غير معروف", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveFieldPolicies = async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    try {
      const payload = {
        policies: Array.from(editingFields.values()).map((p) => ({
          featureKey: p.feature_key, fieldName: p.field_name, mode: p.mode,
        })),
      };
      await apiFetch(`/rbac/v2/roles/${selectedRoleId}/field-policies`, { method: "PUT", body: JSON.stringify(payload) });
      toast({ title: "تم حفظ سياسات الحقول", description: `تم تحديث ${payload.policies.length} سياسة.` });
      qc.invalidateQueries({ queryKey: ["rbac-role-fields"] });
    } catch (err: any) {
      toast({ title: "فشل الحفظ", description: err?.message || "خطأ غير معروف", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveApprovalLimits = async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    try {
      const payload = {
        limits: Array.from(editingLimits.values()).map((l) => ({
          featureKey: l.feature_key, action: l.action, currency: l.currency,
          maxAmount: l.max_amount, requiresDualControl: l.requires_dual_control,
        })),
      };
      await apiFetch(`/rbac/v2/roles/${selectedRoleId}/approval-limits`, { method: "PUT", body: JSON.stringify(payload) });
      toast({ title: "تم حفظ سقوف الاعتماد", description: `تم تحديث ${payload.limits.length} سقف.` });
    } catch (err: any) {
      toast({ title: "فشل الحفظ", description: err?.message || "خطأ غير معروف", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveCurrentTab = (): Promise<void> | void => {
    if (activeTab === "grants") return saveGrants();
    if (activeTab === "fields") return saveFieldPolicies();
    if (activeTab === "limits") return saveApprovalLimits();
    return undefined;
  };

  if (featLoading || rolesLoading) return <LoadingSpinner />;
  if (featErr || rolesErr) return <ErrorState onRetry={() => { refetchRoles(); }} />;

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const violations = sodData?.violations || [];

  return (
    <div className="space-y-4">
      {violations.length > 0 && <SodViolationsBanner violations={violations} onPickRole={(rid) => setSelectedRoleId(rid)} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-2 flex flex-row justify-between items-center">
              <CardTitle className="text-sm">الأدوار ({roles.length})</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setShowTemplates(true)}>
                <Sparkles className="h-4 w-4 me-1" />
                قوالب
              </Button>
            </CardHeader>
            <CardContent className="p-0 max-h-[600px] overflow-auto">
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRoleId(r.id)}
                  className={`w-full text-start p-3 border-b hover:bg-surface-subtle transition ${
                    selectedRoleId === r.id ? "bg-status-info-surface border-r-4 border-r-blue-500" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: r.color || "#3b82f6" }} />
                    <span className="font-medium text-sm">{r.label_ar}</span>
                    {r.is_system && <Badge variant="outline" className="text-xs">نظامي</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {r.member_count} موظف · {r.grant_count} صلاحية · المستوى {r.level}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-9 overflow-x-auto">
          {!selectedRole ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>اختر دوراً لعرض وتعديل صلاحياته</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3 flex flex-row justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    {selectedRole.label_ar}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedRole.role_key} · المستوى {selectedRole.level}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowSimulate(true)}>
                    <Eye className="h-4 w-4 me-1" />
                    محاكاة
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowClone(true)}>
                    <Copy className="h-4 w-4 me-1" />
                    نسخ
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowHistory(true)}>
                    <History className="h-4 w-4 me-1" />
                    السجل
                  </Button>
                  <GuardedButton perm="admin:create" size="sm" onClick={saveCurrentTab} disabled={saving}>
                    <Save className="h-4 w-4 me-1" />
                    {saving ? "حفظ..." : "حفظ"}
                  </GuardedButton>
                </div>
              </CardHeader>

              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="grants">
                      <Layers className="h-4 w-4 me-1" />
                      الصلاحيات ({editingGrants.size})
                    </TabsTrigger>
                    <TabsTrigger value="fields">
                      <EyeOff className="h-4 w-4 me-1" />
                      الحقول الحساسة
                    </TabsTrigger>
                    <TabsTrigger value="limits">
                      <DollarSign className="h-4 w-4 me-1" />
                      سقوف الاعتماد
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="grants" className="mt-3">
                    <FeatureTree
                      features={features}
                      tree={featureTree}
                      grants={editingGrants}
                      onToggleAction={toggleAction}
                      onScopeChange={(fk, scope) => updateGrant(fk, { scope })}
                      onConditionsChange={(fk, conditions) => updateGrant(fk, { conditions })}
                    />
                  </TabsContent>

                  <TabsContent value="fields" className="mt-3">
                    <FieldPoliciesEditor
                      roleId={selectedRoleId!}
                      features={features.filter((f) => f.sensitive_fields && f.sensitive_fields.length > 0)}
                      editingFields={editingFields}
                      setEditingFields={setEditingFields}
                    />
                  </TabsContent>

                  <TabsContent value="limits" className="mt-3">
                    <ApprovalLimitsEditor
                      roleId={selectedRoleId!}
                      features={features.filter((f) => f.approvable_actions && f.approvable_actions.length > 0)}
                      editingLimits={editingLimits}
                      setEditingLimits={setEditingLimits}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {selectedRole && (
        <>
          <SimulateDialog open={showSimulate} onClose={() => setShowSimulate(false)} features={features} />
          <CloneDialog open={showClone} onClose={() => setShowClone(false)} sourceRoleId={selectedRole.id} sourceLabel={selectedRole.label_ar} onDone={() => { refetchRoles(); }} />
          <HistoryDialog open={showHistory} onClose={() => setShowHistory(false)} roleId={selectedRole.id} roleLabel={selectedRole.label_ar} />
        </>
      )}
      <TemplatesDialog open={showTemplates} onClose={() => setShowTemplates(false)} onApplied={() => { refetchRoles(); }} />
    </div>
  );
}

// ─── Feature tree (Grants tab) ──────────────────────────────────────────────
interface FeatureTreeProps {
  features: Feature[];
  tree: Map<string, Feature[]>;
  grants: Map<string, Grant>;
  onToggleAction: (feature: Feature, action: string) => void;
  onScopeChange: (featureKey: string, scope: string) => void;
  onConditionsChange: (featureKey: string, conditions: any) => void;
}

function FeatureTree({ features, tree, grants, onToggleAction, onScopeChange, onConditionsChange }: FeatureTreeProps) {
  const renderNode = (feature: Feature, depth: number) => {
    const grant = grants.get(feature.feature_key);
    const children = tree.get(feature.feature_key) || [];
    return (
      <div key={feature.feature_key} className="border-b last:border-b-0">
        <div className="grid grid-cols-12 gap-2 items-center py-2 hover:bg-surface-subtle" style={{ paddingInlineStart: `${depth * 20 + 8}px` }}>
          <div className="col-span-3 flex items-center gap-2">
            <span className="font-medium text-sm">{feature.label_ar}</span>
            {feature.is_self_service && <Badge variant="outline" className="text-xs bg-status-success-surface text-status-success-foreground">خدمة ذاتية</Badge>}
            {feature.is_system_critical && <Badge variant="outline" className="text-xs bg-status-error-surface text-status-error-foreground">حساس</Badge>}
          </div>
          <div className="col-span-5 flex flex-wrap gap-1">
            {feature.available_actions.map((a) => {
              const checked = grant?.actions.includes(a) ?? false;
              return (
                <label
                  key={a}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border cursor-pointer ${
                    checked ? "bg-status-info-surface border-status-info-surface text-status-info-foreground" : "bg-surface-subtle border-border text-muted-foreground"
                  }`}
                >
                  <Checkbox checked={checked} onCheckedChange={() => onToggleAction(feature, a)} className="h-3 w-3" />
                  {ACTION_LABELS[a] || a}
                </label>
              );
            })}
          </div>
          <div className="col-span-2">
            {grant && (
              <Select value={grant.scope} onValueChange={(v) => onScopeChange(feature.feature_key, v)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {feature.available_scopes.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">{SCOPE_LABELS[s] || s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="col-span-2">
            {grant && (
              <ConditionsEditor
                value={grant.conditions || null}
                onChange={(next) => onConditionsChange(feature.feature_key, next)}
              />
            )}
          </div>
        </div>
        {children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const roots = tree.get("__root__") || [];
  return (
    <div className="border rounded">
      <div className="grid grid-cols-12 gap-2 items-center py-2 px-2 bg-surface-subtle border-b text-xs font-semibold text-muted-foreground">
        <div className="col-span-3">الميزة</div>
        <div className="col-span-5">الإجراءات</div>
        <div className="col-span-2">النطاق</div>
        <div className="col-span-2">الشروط</div>
      </div>
      {roots.map((r) => renderNode(r, 0))}
    </div>
  );
}

// ─── Field Policies tab ─────────────────────────────────────────────────────
interface FieldPoliciesEditorProps {
  roleId: number;
  features: Feature[];
  editingFields: Map<string, FieldPolicy>;
  setEditingFields: (m: Map<string, FieldPolicy>) => void;
}

function FieldPoliciesEditor({ roleId, features, editingFields, setEditingFields }: FieldPoliciesEditorProps) {
  // Note: on first open, we initialise from server-provided policies.
  // The current admin API does not yet expose a GET for field policies,
  // so we treat the state as "edit-from-empty" until an explicit save.
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) => {
    setExpandedFeatures((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const setMode = (featureKey: string, fieldName: string, mode: FieldPolicy["mode"]) => {
    const next = new Map(editingFields);
    const key = `${featureKey}::${fieldName}`;
    if (mode === "visible") {
      next.delete(key);
    } else {
      next.set(key, { feature_key: featureKey, field_name: fieldName, mode });
    }
    setEditingFields(next);
  };

  if (features.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <EyeOff className="h-10 w-10 mx-auto mb-2 opacity-40" />
        <p>لا توجد ميزات تحتوي على حقول حساسة في هذا النطاق</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">
        تحدّد سياسة الحقول كيف يرى صاحب هذا الدور كل حقل حساس: <Badge variant="outline" className="text-xs bg-status-success-surface">ظاهر</Badge>{" "}
        أو <Badge variant="outline" className="text-xs bg-status-warning-surface">مُقنَّع</Badge> (مثل ABC***12) أو{" "}
        <Badge variant="outline" className="text-xs bg-status-error-surface">مخفي</Badge> تماماً من الواجهة.
      </p>
      <div className="border rounded">
        {features.map((f) => {
          const expanded = expandedFeatures.has(f.feature_key);
          const fieldsWithPolicy = (f.sensitive_fields || []).filter((fn) => editingFields.has(`${f.feature_key}::${fn}`));
          return (
            <div key={f.feature_key} className="border-b last:border-b-0">
              <button
                onClick={() => toggleExpand(f.feature_key)}
                className="w-full flex items-center gap-2 p-3 hover:bg-surface-subtle text-start"
              >
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="font-medium text-sm">{f.label_ar}</span>
                <Badge variant="outline" className="text-xs">{f.sensitive_fields?.length || 0} حقل</Badge>
                {fieldsWithPolicy.length > 0 && (
                  <Badge className="text-xs bg-status-info-surface text-status-info-foreground">{fieldsWithPolicy.length} مقيّد</Badge>
                )}
              </button>
              {expanded && (
                <div className="bg-surface-subtle px-4 py-2 space-y-1">
                  {(f.sensitive_fields || []).map((fn) => {
                    const key = `${f.feature_key}::${fn}`;
                    const cur = editingFields.get(key);
                    const mode = cur?.mode ?? "visible";
                    return (
                      <div key={fn} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0 border-border">
                        <span className="font-mono text-xs text-status-neutral-foreground">{fn}</span>
                        <div className="flex gap-1">
                          {(["visible", "masked", "hidden", "readonly"] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => setMode(f.feature_key, fn, m)}
                              className={`px-2 py-1 text-xs rounded border ${
                                mode === m ? FIELD_MODE_COLORS[m] : "bg-white text-muted-foreground border-border hover:bg-surface-subtle"
                              }`}
                            >
                              {FIELD_MODE_LABELS[m]}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Approval Limits tab ────────────────────────────────────────────────────
interface ApprovalLimitsEditorProps {
  roleId: number;
  features: Feature[];
  editingLimits: Map<string, ApprovalLimit>;
  setEditingLimits: (m: Map<string, ApprovalLimit>) => void;
}

function ApprovalLimitsEditor({ roleId, features, editingLimits, setEditingLimits }: ApprovalLimitsEditorProps) {
  const setLimit = (featureKey: string, action: string, max: number | null, dual: boolean) => {
    const next = new Map(editingLimits);
    const key = `${featureKey}::${action}::SAR`;
    if (max == null && !dual) {
      next.delete(key);
    } else {
      next.set(key, { feature_key: featureKey, action, currency: "SAR", max_amount: max, requires_dual_control: dual });
    }
    setEditingLimits(next);
  };

  if (features.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-40" />
        <p>لا توجد ميزات تحتوي على إجراءات اعتماد</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">
        سقف الاعتماد يحدّد أقصى مبلغ يستطيع صاحب هذا الدور اعتماده. عند تجاوز السقف يُرفض الطلب تلقائياً
        ويُحوَّل لمدير أعلى. <strong>مراجعة ثنائية</strong> تتطلب موافقة شخصين على نفس العملية.
      </p>
      <div className="border rounded overflow-hidden">
        <div className="grid grid-cols-12 gap-2 items-center py-2 px-3 bg-surface-subtle border-b text-xs font-semibold text-muted-foreground">
          <div className="col-span-4">الميزة</div>
          <div className="col-span-2">الإجراء</div>
          <div className="col-span-3">السقف (ر.س)</div>
          <div className="col-span-2">العملة</div>
          <div className="col-span-1">ثنائي</div>
        </div>
        {features.map((f) =>
          (f.approvable_actions || []).map((a) => {
            const key = `${f.feature_key}::${a}::SAR`;
            const cur = editingLimits.get(key);
            return (
              <div key={key} className="grid grid-cols-12 gap-2 items-center py-2 px-3 border-b last:border-b-0 hover:bg-surface-subtle">
                <div className="col-span-4 text-sm">{f.label_ar}</div>
                <div className="col-span-2 text-sm">
                  <Badge variant="outline" className="text-xs">{ACTION_LABELS[a] || a}</Badge>
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    placeholder="بلا حد"
                    value={cur?.max_amount ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      setLimit(f.feature_key, a, v, cur?.requires_dual_control || false);
                    }}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="col-span-2 text-sm text-muted-foreground">SAR</div>
                <div className="col-span-1">
                  <Checkbox
                    checked={cur?.requires_dual_control || false}
                    onCheckedChange={(v) =>
                      setLimit(f.feature_key, a, cur?.max_amount ?? null, !!v)
                    }
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Simulate dialog ────────────────────────────────────────────────────────
function SimulateDialog({ open, onClose, features }: { open: boolean; onClose: () => void; features: Feature[] }) {
  const [userId, setUserId] = useState("");
  const [feature, setFeature] = useState("hr.payroll.runs");
  const [action, setAction] = useState("view");
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [simTab, setSimTab] = useState<"check" | "effective">("check");
  const [effective, setEffective] = useState<any>(null);
  const { toast } = useToast();

  const run = async () => {
    if (!userId) return;
    setRunning(true);
    try {
      const r = await apiFetch<any>("/rbac/v2/simulate", {
        method: "POST",
        body: JSON.stringify({ userId: Number(userId), feature, action }),
      });
      setResult(r);
    } catch (err: any) {
      toast({ title: "فشل المحاكاة", description: err?.message || "خطأ", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const loadEffective = async () => {
    if (!userId) return;
    setRunning(true);
    try {
      const r = await apiFetch<any>(`/rbac/v2/users/${Number(userId)}/effective`);
      setEffective(r);
    } catch (err: any) {
      toast({ title: "فشل التحميل", description: err?.message || "خطأ", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            محاكاة الصلاحيات
          </DialogTitle>
        </DialogHeader>
        <Tabs value={simTab} onValueChange={(v) => setSimTab(v as any)}>
          <TabsList>
            <TabsTrigger value="check">فحص فعل واحد</TabsTrigger>
            <TabsTrigger value="effective">الصلاحيات الفعّالة الكاملة</TabsTrigger>
          </TabsList>

          <TabsContent value="check" className="mt-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">رقم المستخدم</label>
                <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="userId" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الميزة</label>
                <Select value={feature} onValueChange={setFeature}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {features.map((f) => (
                      <SelectItem key={f.feature_key} value={f.feature_key} className="text-sm">{f.label_ar}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الإجراء</label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(features.find((f) => f.feature_key === feature)?.available_actions || ["view"]).map((a) => (
                      <SelectItem key={a} value={a} className="text-sm">{ACTION_LABELS[a] || a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={run} disabled={!userId || running} className="w-full">
              {running ? "جاري التشغيل..." : "تشغيل المحاكاة"}
            </Button>
            {result && (
              <Card className={result.result?.allowed ? "border-status-success-surface bg-status-success-surface" : "border-status-error-surface bg-status-error-surface"}>
                <CardContent className="p-4 text-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className={result.result?.allowed ? "bg-green-600" : "bg-red-600"}>
                      {result.result?.allowed ? "مسموح" : "ممنوع"}
                    </Badge>
                    <span className="font-medium">{result.target?.userName}</span>
                    <span className="text-muted-foreground">— {result.target?.role}</span>
                  </div>
                  {result.result?.reasonAr && <p className="text-status-error-foreground">{result.result.reasonAr}</p>}
                  {result.result?.diagnostics && (
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <div>النطاق المُمنوح: {SCOPE_LABELS[result.result.diagnostics.grantedScope] || result.result.diagnostics.grantedScope || "—"}</div>
                      <div>الإجراءات الممنوحة: {(result.result.diagnostics.grantedActions || []).map((a: string) => ACTION_LABELS[a] || a).join(", ") || "—"}</div>
                      {result.result.diagnostics.requiredFix && <div className="text-status-warning-foreground">الحل: {result.result.diagnostics.requiredFix}</div>}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="effective" className="mt-3 space-y-3">
            <div className="flex gap-2">
              <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="رقم المستخدم" className="flex-1" />
              <Button onClick={loadEffective} disabled={!userId || running}>
                {running ? "تحميل..." : "عرض الصلاحيات"}
              </Button>
            </div>
            {effective && (
              <div className="space-y-3 max-h-[400px] overflow-auto">
                <Card>
                  <CardContent className="p-3 flex items-center gap-3">
                    <span className="font-semibold">{effective.target?.userName}</span>
                    <Badge variant="outline">{effective.target?.role}</Badge>
                    {effective.target?.jobTitle && <span className="text-sm text-muted-foreground">— {effective.target.jobTitle}</span>}
                  </CardContent>
                </Card>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">الأدوار المُعيَّنة ({effective.roles?.length || 0})</p>
                  <div className="flex flex-wrap gap-1">
                    {(effective.roles || []).map((r: any) => (
                      <Badge key={r.role_id} className="text-xs" style={{ backgroundColor: r.color }}>
                        {r.label_ar}
                        {r.is_primary && " ★"}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    صلاحيات الميزات ({effective.grants?.length || 0})
                  </p>
                  <div className="border rounded text-xs">
                    <div className="grid grid-cols-12 gap-2 py-1.5 px-2 bg-surface-subtle font-semibold">
                      <div className="col-span-4">الميزة</div>
                      <div className="col-span-5">الإجراءات</div>
                      <div className="col-span-2">النطاق</div>
                      <div className="col-span-1">الدور</div>
                    </div>
                    {(effective.grants || []).map((g: any, i: number) => (
                      <div key={i} className="grid grid-cols-12 gap-2 py-1 px-2 border-t hover:bg-surface-subtle">
                        <div className="col-span-4 font-mono text-[10px]">{g.feature_key}</div>
                        <div className="col-span-5">{(g.actions || []).map((a: string) => ACTION_LABELS[a] || a).join(", ")}</div>
                        <div className="col-span-2">{SCOPE_LABELS[g.scope] || g.scope}</div>
                        <div className="col-span-1 truncate" title={g.role_label}>{g.role_label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {(effective.fields || []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">سياسات الحقول ({effective.fields.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {effective.fields.map((f: any, i: number) => (
                        <Badge key={i} variant="outline" className={`text-xs ${FIELD_MODE_COLORS[f.mode]}`}>
                          {f.feature_key}.{f.field_name} = {FIELD_MODE_LABELS[f.mode]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {(effective.limits || []).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">سقوف الاعتماد ({effective.limits.length})</p>
                    <div className="border rounded text-xs">
                      {effective.limits.map((l: any, i: number) => (
                        <div key={i} className="grid grid-cols-3 gap-2 py-1 px-2 border-t first:border-t-0 hover:bg-surface-subtle">
                          <div className="font-mono text-[10px]">{l.feature_key} · {l.action}</div>
                          <div>{l.max_amount ? `${l.max_amount} ${l.currency}` : "بلا حد"}</div>
                          <div>{l.requires_dual_control ? "ثنائي" : "—"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Clone dialog ───────────────────────────────────────────────────────────
function CloneDialog({ open, onClose, sourceRoleId, sourceLabel, onDone }: {
  open: boolean; onClose: () => void; sourceRoleId: number; sourceLabel: string; onDone: () => void;
}) {
  const [newKey, setNewKey] = useState("");
  const [labelAr, setLabelAr] = useState("");
  const [asTemplate, setAsTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const submit = async () => {
    if (!newKey || !labelAr) return;
    setBusy(true);
    try {
      await apiFetch(`/rbac/v2/roles/${sourceRoleId}/clone`, {
        method: "POST",
        body: JSON.stringify({ newRoleKey: newKey, labelAr, asTemplate }),
      });
      toast({ title: "تم النسخ", description: `تم إنشاء "${labelAr}" من "${sourceLabel}"` });
      onDone();
      onClose();
      setNewKey("");
      setLabelAr("");
      setAsTemplate(false);
    } catch (err: any) {
      toast({ title: "فشل النسخ", description: err?.message || "خطأ", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            نسخ الدور: {sourceLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">المفتاح الجديد</label>
            <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="custom_role_key" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الاسم بالعربية</label>
            <Input value={labelAr} onChange={(e) => setLabelAr(e.target.value)} placeholder="مدير المبيعات" />
          </div>
          <label className="flex items-center gap-2">
            <Checkbox checked={asTemplate} onCheckedChange={(v) => setAsTemplate(!!v)} />
            <span className="text-sm">حفظ كقالب عام (يُستخدم في شركات أخرى)</span>
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={!newKey || !labelAr || busy}>
            {busy ? "نسخ..." : "نسخ الدور"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── History dialog ─────────────────────────────────────────────────────────
function HistoryDialog({ open, onClose, roleId, roleLabel }: {
  open: boolean; onClose: () => void; roleId: number; roleLabel: string;
}) {
  const { data, isLoading } = useApiQuery<{ history: HistoryEntry[] }>(
    ["rbac-role-history", String(roleId)],
    `/rbac/v2/roles/${roleId}/history`,
    open
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            سجل التغييرات: {roleLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[500px] overflow-auto">
          {isLoading ? (
            <LoadingSpinner />
          ) : !data?.history?.length ? (
            <p className="text-center text-muted-foreground py-8">لا توجد تغييرات مسجلة</p>
          ) : (
            <div className="space-y-2">
              {data.history.map((h) => (
                <Card key={h.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{h.change_type}</Badge>
                        <span className="text-sm font-medium">{h.changedByName || `User #${h.changedBy}`}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString("ar")}</span>
                    </div>
                    {h.reason && <p className="text-xs text-muted-foreground mt-1">{h.reason}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Templates dialog ──────────────────────────────────────────────────────
interface Template {
  id: number;
  role_key: string;
  label_ar: string;
  label_en: string | null;
  description: string | null;
  level: number;
  color: string;
  grant_count: string;
  field_count: string;
  limit_count: string;
}

function TemplatesDialog({ open, onClose, onApplied }: { open: boolean; onClose: () => void; onApplied: () => void }) {
  const { data, isLoading } = useApiQuery<{ templates: Template[] }>(["rbac-templates"], "/rbac/v2/templates", open);
  const [applying, setApplying] = useState<number | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [pickedTemplate, setPickedTemplate] = useState<Template | null>(null);
  const { toast } = useToast();

  const apply = async () => {
    if (!pickedTemplate || !newKey || !newLabel) return;
    setApplying(pickedTemplate.id);
    try {
      await apiFetch(`/rbac/v2/templates/${pickedTemplate.id}/apply`, {
        method: "POST",
        body: JSON.stringify({ newRoleKey: newKey, labelAr: newLabel }),
      });
      toast({ title: "تم تطبيق القالب", description: `تم إنشاء "${newLabel}" من قالب "${pickedTemplate.label_ar}"` });
      onApplied();
      setPickedTemplate(null);
      setNewKey("");
      setNewLabel("");
      onClose();
    } catch (err: any) {
      toast({ title: "فشل تطبيق القالب", description: err?.message || "خطأ", variant: "destructive" });
    } finally {
      setApplying(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {pickedTemplate ? `تطبيق قالب: ${pickedTemplate.label_ar}` : "قوالب الأدوار الجاهزة"}
          </DialogTitle>
        </DialogHeader>
        {!pickedTemplate ? (
          <div className="max-h-[500px] overflow-auto">
            {isLoading ? (
              <LoadingSpinner />
            ) : !data?.templates?.length ? (
              <p className="text-center text-muted-foreground py-8">لا توجد قوالب جاهزة</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {data.templates.map((t) => (
                  <Card
                    key={t.id}
                    className="cursor-pointer hover:shadow-md transition border-2 hover:border-status-info-surface"
                    onClick={() => {
                      setPickedTemplate(t);
                      setNewKey(t.role_key.replace(/^tpl_/, ""));
                      setNewLabel(t.label_ar.replace(/\s*\(قالب\)$/, ""));
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <span className="inline-block w-3 h-3 rounded-full mt-1" style={{ backgroundColor: t.color }} />
                        <div className="flex-1">
                          <p className="font-semibold text-sm">{t.label_ar}</p>
                          {t.label_en && <p className="text-xs text-muted-foreground">{t.label_en}</p>}
                        </div>
                      </div>
                      {t.description && <p className="text-xs text-muted-foreground mb-2">{t.description}</p>}
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{t.grant_count} صلاحية</Badge>
                        {Number(t.field_count) > 0 && <Badge variant="outline" className="text-xs">{t.field_count} سياسة حقل</Badge>}
                        {Number(t.limit_count) > 0 && <Badge variant="outline" className="text-xs">{t.limit_count} سقف</Badge>}
                        <Badge variant="outline" className="text-xs">المستوى {t.level}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Card className="bg-status-info-surface border-status-info-surface">
              <CardContent className="p-3 text-sm">
                {pickedTemplate.description}
              </CardContent>
            </Card>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المفتاح في شركتك</label>
              <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="branch_accountant" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الاسم بالعربية</label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="محاسب فرع" />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          {pickedTemplate ? (
            <>
              <Button variant="outline" onClick={() => setPickedTemplate(null)}>عودة</Button>
              <Button onClick={apply} disabled={!newKey || !newLabel || applying !== null}>
                {applying ? "جاري التطبيق..." : "تطبيق القالب"}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>إغلاق</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── SoD Violations banner ──────────────────────────────────────────────────
interface SodViolation {
  rule: {
    id: number;
    rule_key: string;
    label_ar: string;
    feature_a: string;
    action_a: string;
    feature_b: string;
    action_b: string;
    severity: string;
  };
  offenders: Array<{
    userId: number;
    role_id: number;
    role_key: string;
    label_ar: string;
  }>;
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: "حرج",
  high: "مرتفع",
  medium: "متوسط",
  low: "منخفض",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-700 text-white",
  high: "bg-status-error-surface0 text-white",
  medium: "bg-status-warning-surface0 text-white",
  low: "bg-status-warning-surface0 text-white",
};

function SodViolationsBanner({ violations, onPickRole }: { violations: SodViolation[]; onPickRole: (roleId: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const offendersTotal = violations.reduce((sum, v) => sum + v.offenders.length, 0);

  return (
    <Card className="border-status-error-surface bg-status-error-surface">
      <CardContent className="p-4">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center gap-3 text-start"
        >
          <AlertTriangle className="h-5 w-5 text-status-error-foreground flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-status-error-foreground">
              {violations.length} انتهاك لقاعدة فصل المهام (SoD) — {offendersTotal} دور متأثر
            </p>
            <p className="text-sm text-status-error-foreground">
              {violations.slice(0, 3).map((v) => v.rule.label_ar).join(" · ")}
              {violations.length > 3 && ` · +${violations.length - 3}`}
            </p>
          </div>
          {expanded ? <ChevronDown className="h-4 w-4 text-status-error-foreground" /> : <ChevronRight className="h-4 w-4 text-status-error-foreground" />}
        </button>
        {expanded && (
          <div className="mt-3 space-y-2">
            {violations.map((v) => (
              <div key={v.rule.id} className="bg-white rounded p-3 border border-status-error-surface">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-sm">{v.rule.label_ar}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {v.rule.feature_a}.{v.rule.action_a} <span className="text-status-error">↔</span> {v.rule.feature_b}.{v.rule.action_b}
                    </p>
                  </div>
                  <Badge className={`text-xs ${SEVERITY_COLORS[v.rule.severity] || ""}`}>
                    {SEVERITY_LABELS[v.rule.severity] || v.rule.severity}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-xs text-muted-foreground me-2">الأدوار المتأثرة:</span>
                  {v.offenders.map((o) => (
                    <button
                      key={o.role_id}
                      onClick={() => onPickRole(o.role_id)}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-status-error-surface text-status-error-foreground border border-status-error-surface hover:bg-status-error-surface"
                    >
                      {o.label_ar}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
