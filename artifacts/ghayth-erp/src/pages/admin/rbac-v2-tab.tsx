import { useState, useMemo } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Shield, Plus, Save, AlertTriangle, Eye, History, Copy, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

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
  view: "عرض",
  list: "قراءة قائمة",
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  approve: "اعتماد",
  reject: "رفض",
  cancel: "إلغاء",
  export: "تصدير",
  print: "طباعة",
  share: "مشاركة",
  submit: "تقديم",
  reopen: "إعادة فتح",
  close: "إغلاق",
};

export function RbacV2Tab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [editingGrants, setEditingGrants] = useState<Map<string, Grant>>(new Map());
  const [saving, setSaving] = useState(false);

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
  const { data: sodData } = useApiQuery<{ violations: any[] }>(["rbac-sod"], "/rbac/v2/sod");

  const features = featuresData?.features || [];
  const roles = rolesData?.data || [];
  const grants = grantsData?.grants || [];

  // Build feature tree (parent → children)
  const featureTree = useMemo(() => {
    const tree = new Map<string, Feature[]>();
    for (const f of features) {
      const parent = f.parent_key || "__root__";
      if (!tree.has(parent)) tree.set(parent, []);
      tree.get(parent)!.push(f);
    }
    return tree;
  }, [features]);

  // Sync incoming grants → editing map
  useMemo(() => {
    const map = new Map<string, Grant>();
    for (const g of grants) map.set(g.feature_key, { ...g });
    setEditingGrants(map);
  }, [grants]);

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
      // Remove grant entirely
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
        })),
      };
      await apiFetch(`/rbac/v2/roles/${selectedRoleId}/grants`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
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

  if (featLoading || rolesLoading) return <LoadingSpinner />;
  if (featErr || rolesErr) return <ErrorState onRetry={() => { refetchRoles(); }} />;

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const violations = sodData?.violations || [];

  return (
    <div className="space-y-4">
      {/* SoD violations banner */}
      {violations.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-red-800">{violations.length} انتهاك لقاعدة فصل المهام (SoD)</p>
              <p className="text-sm text-red-600">يوجد أدوار تجمع بين صلاحيات لا يجوز اجتماعها (مثل إنشاء واعتماد القيد).</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* Roles list */}
        <div className="col-span-3">
          <Card>
            <CardHeader className="pb-2 flex flex-row justify-between items-center">
              <CardTitle className="text-sm">الأدوار ({roles.length})</CardTitle>
              <Button size="sm" variant="ghost" disabled>
                <Plus className="h-4 w-4 me-1" />
                جديد
              </Button>
            </CardHeader>
            <CardContent className="p-0 max-h-[600px] overflow-auto">
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRoleId(r.id)}
                  className={`w-full text-start p-3 border-b hover:bg-gray-50 transition ${
                    selectedRoleId === r.id ? "bg-blue-50 border-r-4 border-r-blue-500" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: r.color || "#3b82f6" }}
                    />
                    <span className="font-medium text-sm">{r.label_ar}</span>
                    {r.is_system && <Badge variant="outline" className="text-xs">نظامي</Badge>}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {r.member_count} موظف · {r.grant_count} صلاحية · المستوى {r.level}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Role editor */}
        <div className="col-span-9">
          {!selectedRole ? (
            <Card>
              <CardContent className="p-12 text-center text-gray-400">
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
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedRole.role_key} · المستوى {selectedRole.level}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled>
                    <Eye className="h-4 w-4 me-1" />
                    محاكاة
                  </Button>
                  <Button size="sm" variant="outline" disabled>
                    <Copy className="h-4 w-4 me-1" />
                    نسخ
                  </Button>
                  <Button size="sm" variant="outline" disabled>
                    <History className="h-4 w-4 me-1" />
                    السجل
                  </Button>
                  <Button size="sm" onClick={saveGrants} disabled={saving}>
                    <Save className="h-4 w-4 me-1" />
                    {saving ? "حفظ..." : "حفظ"}
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                <Tabs defaultValue="grants">
                  <TabsList>
                    <TabsTrigger value="grants">
                      <Layers className="h-4 w-4 me-1" />
                      الصلاحيات ({editingGrants.size})
                    </TabsTrigger>
                    <TabsTrigger value="fields" disabled>
                      الحقول الحساسة
                    </TabsTrigger>
                    <TabsTrigger value="limits" disabled>
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
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

interface FeatureTreeProps {
  features: Feature[];
  tree: Map<string, Feature[]>;
  grants: Map<string, Grant>;
  onToggleAction: (feature: Feature, action: string) => void;
  onScopeChange: (featureKey: string, scope: string) => void;
}

function FeatureTree({ features, tree, grants, onToggleAction, onScopeChange }: FeatureTreeProps) {
  const renderNode = (feature: Feature, depth: number) => {
    const grant = grants.get(feature.feature_key);
    const children = tree.get(feature.feature_key) || [];
    return (
      <div key={feature.feature_key} className="border-b last:border-b-0">
        <div className="grid grid-cols-12 gap-2 items-center py-2 hover:bg-gray-50" style={{ paddingInlineStart: `${depth * 20 + 8}px` }}>
          <div className="col-span-4 flex items-center gap-2">
            <span className="font-medium text-sm">{feature.label_ar}</span>
            {feature.is_self_service && <Badge variant="outline" className="text-xs bg-green-50 text-green-700">خدمة ذاتية</Badge>}
            {feature.is_system_critical && <Badge variant="outline" className="text-xs bg-red-50 text-red-700">حساس</Badge>}
          </div>
          <div className="col-span-6 flex flex-wrap gap-1">
            {feature.available_actions.map((a) => {
              const checked = grant?.actions.includes(a) ?? false;
              return (
                <label
                  key={a}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border cursor-pointer ${
                    checked ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-500"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggleAction(feature, a)}
                    className="h-3 w-3"
                  />
                  {ACTION_LABELS[a] || a}
                </label>
              );
            })}
          </div>
          <div className="col-span-2">
            {grant && (
              <Select value={grant.scope} onValueChange={(v) => onScopeChange(feature.feature_key, v)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {feature.available_scopes.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {SCOPE_LABELS[s] || s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
      <div className="grid grid-cols-12 gap-2 items-center py-2 px-2 bg-gray-100 border-b text-xs font-semibold text-gray-600">
        <div className="col-span-4">الميزة</div>
        <div className="col-span-6">الإجراءات</div>
        <div className="col-span-2">النطاق</div>
      </div>
      {roots.map((r) => renderNode(r, 0))}
    </div>
  );
}
