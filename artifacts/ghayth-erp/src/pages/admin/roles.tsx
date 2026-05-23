import { useState } from "react";
import { z } from "zod";
import { useFormContext } from "react-hook-form";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KeyRound, CheckCircle, Shield, Plus, X } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { roleKeyColors } from "@/contexts/app-context";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { MODULE_LABELS } from "@/lib/module-labels";
import {
  FormShell,
  FormTextField,
  FormNumberField,
  FormGrid,
} from "@workspace/ui-core";

// The `modules` field is a string[] of MODULE_LABELS keys. Schema
// enforces the closed-set; the picker lives below as a small
// FormContext-aware subcomponent (FormShell ships text/number/select
// only — multi-select isn't a primitive, so we drive it via
// useFormContext + watch/setValue).
const newRoleSchema = z.object({
  roleKey: z.string()
    .min(1, "مفتاح الدور مطلوب")
    .regex(/^[a-z_]+$/, "مفتاح الدور يجب أن يحتوي على حروف إنجليزية صغيرة وشرطات سفلية فقط"),
  label: z.string().trim().min(1, "اسم الدور مطلوب"),
  level: z.coerce.number().int().min(1).max(100),
  modules: z.array(z.string()),
});
type NewRoleForm = z.infer<typeof newRoleSchema>;

const ALL_MODULES = Object.keys(MODULE_LABELS);

const PERM_MODULES = [
  { key: "hr", label: "الموارد البشرية" },
  { key: "finance", label: "المالية" },
  { key: "fleet", label: "الأسطول" },
  { key: "property", label: "الأملاك" },
  { key: "warehouse", label: "المستودعات" },
  { key: "legal", label: "القانونية" },
  { key: "crm", label: "المبيعات" },
  { key: "support", label: "الدعم الفني" },
  { key: "operations", label: "العمليات" },
  { key: "governance", label: "الحوكمة" },
  { key: "reports", label: "التقارير" },
  { key: "documents", label: "المستندات" },
  { key: "settings", label: "الإعدادات" },
  { key: "admin", label: "مدير النظام" },
];

const PERM_ACTIONS = [
  { key: "read", label: "عرض" },
  { key: "write", label: "تعديل" },
  { key: "create", label: "إنشاء" },
  { key: "delete", label: "حذف" },
  { key: "approve", label: "موافقة" },
];

const ROLE_OPTIONS = [
  { value: "owner", label: "مالك النظام" },
  { value: "general_manager", label: "مدير عام" },
  { value: "hr_manager", label: "مدير الموارد البشرية" },
  { value: "finance_manager", label: "مدير المالية" },
  { value: "fleet_manager", label: "مدير الأسطول" },
  { value: "property_manager", label: "مدير الأملاك" },
  { value: "projects_manager", label: "مدير المشاريع" },
  { value: "warehouse_manager", label: "مدير المستودعات" },
  { value: "legal_manager", label: "مدير الشؤون القانونية" },
  { value: "support_manager", label: "مدير الدعم الفني" },
  { value: "crm_manager", label: "مدير المبيعات" },
  { value: "bi_manager", label: "مدير ذكاء الأعمال" },
  { value: "branch_manager", label: "مدير فرع" },
  { value: "employee", label: "موظف" },
];

export default function AdminRolesPage() {
  const { toast } = useToast();
  const { data: predefinedData, isLoading, isError, refetch: refetchPredefined } = useApiQuery<any>(["predefined-roles"], "/admin/predefined-roles");
  const { data: roleModulesData, refetch } = useApiQuery<any>(["role-modules"], "/settings/role-modules");
  const predefinedRoles: any[] = predefinedData?.data || [];
  const roleModulesMap = new Map<string, string[]>(
    (roleModulesData?.data || []).map((r: any) => [r.roleKey, Array.isArray(r.modules) ? r.modules : []])
  );
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"modules" | "permissions" | "create">("modules");

  const [selectedPermRole, setSelectedPermRole] = useState("employee");
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set());
  const [permsLoading, setPermsLoading] = useState(false);
  const [permSaving, setPermSaving] = useState<string | null>(null);

  const [creatingRole, setCreatingRole] = useState(false);

  const rolePermColumns: DataTableColumn<any>[] = [
    { key: "label", header: "الوحدة", width: "144px", render: (r: any) => <span className="font-medium text-sm text-status-neutral-foreground">{r.label}</span> },
    ...PERM_ACTIONS.map((action) => ({
      key: action.key,
      header: action.label,
      align: "center" as const,
      render: (r: any) => {
        const perm = `${r.key}:${action.key}`;
        const hasWildcard = rolePerms.has("*") || rolePerms.has(`${r.key}:*`);
        const hasPerm = hasWildcard || rolePerms.has(perm);
        const isSaving = permSaving === perm;
        return (
          <button
            onClick={() => !hasWildcard && toggleRolePerm(r.key, action.key)}
            disabled={hasWildcard || isSaving}
            className={cn("w-7 h-7 rounded-md transition-all mx-auto flex items-center justify-center border-2",
              hasPerm ? hasWildcard ? "bg-status-info-surface border-status-info-surface cursor-not-allowed" : "bg-status-success-surface border-green-500 hover:bg-green-200"
                : "bg-white border-border hover:border-gray-400",
              isSaving && "opacity-50")}
            title={hasWildcard ? "صلاحية كاملة" : hasPerm ? "انقر لإزالة" : "انقر لإضافة"}>
            {hasPerm && <CheckCircle className={cn("h-4 w-4", hasWildcard ? "text-status-info" : "text-status-success-foreground")} />}
          </button>
        );
      },
    })),
  ];

  if (isLoading) return <DataTable columns={rolePermColumns} data={[]} isLoading={true} searchPlaceholder={null} noToolbar />;
  if (isError) return <DataTable columns={rolePermColumns} data={[]} isError={true} searchPlaceholder={null} noToolbar />;

  const createNewRole = async (values: NewRoleForm) => {
    setCreatingRole(true);
    try {
      await apiFetch("/admin/roles", {
        method: "POST",
        body: JSON.stringify({
          roleKey: values.roleKey,
          label: values.label,
          level: values.level,
          modules: values.modules,
          permissions: [],
        }),
      });
      toast({ title: `تم إنشاء الدور "${values.label}" بنجاح` });
      refetchPredefined();
      setActiveTab("modules");
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "فشل في إنشاء الدور" });
    }
    setCreatingRole(false);
  };

  const startEdit = (r: any) => {
    setEditingRole(r.roleKey);
    const currentModules = roleModulesMap.get(r.roleKey) ?? r.modules;
    setEditModules([...currentModules]);
  };

  const toggleModule = (mod: string) => {
    setEditModules(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]);
  };

  const saveModules = async () => {
    if (!editingRole) return;
    setSaving(true);
    try {
      await apiFetch(`/settings/role-modules/${editingRole}`, {
        method: "PUT",
        body: JSON.stringify({ modules: editModules }),
      });
      toast({ title: "تم حفظ الوحدات بنجاح" });
      setEditingRole(null);
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "فشل في حفظ الوحدات" });
    }
    setSaving(false);
  };

  const loadRolePerms = async (role: string) => {
    setPermsLoading(true);
    try {
      const data = await apiFetch(`/permissions/role-permissions`);
      const perms = (data.data || []).filter((p: any) => p.role === role).map((p: any) => p.permission as string);
      setRolePerms(new Set(perms));
    } catch { setRolePerms(new Set()); }
    setPermsLoading(false);
  };

  const toggleRolePerm = async (module: string, action: string) => {
    const perm = `${module}:${action}`;
    const hasPerm = rolePerms.has(perm) || rolePerms.has(`${module}:*`) || rolePerms.has("*");
    setPermSaving(perm);
    try {
      if (hasPerm && rolePerms.has(perm)) {
        await apiFetch("/permissions/role-permissions", {
          method: "DELETE",
          body: JSON.stringify({ role: selectedPermRole, permission: perm }),
        });
        setRolePerms(prev => { const s = new Set(prev); s.delete(perm); return s; });
      } else if (!hasPerm) {
        await apiFetch("/permissions/role-permissions", {
          method: "POST",
          body: JSON.stringify({ role: selectedPermRole, permission: perm }),
        });
        setRolePerms(prev => new Set([...prev, perm]));
      }
    } catch {
      toast({ variant: "destructive", title: "فشل في تحديث الصلاحية" });
    }
    setPermSaving(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <KeyRound className="w-8 h-8 text-purple-600" />
            إدارة الأدوار والصلاحيات
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">تعيين الوحدات المسموحة لكل دور وضبط مصفوفة الصلاحيات</p>
        </div>
        <GuardedButton perm="admin:create" size="sm" onClick={() => setActiveTab(activeTab === "create" ? "modules" : "create")}>
          {activeTab === "create" ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إنشاء دور جديد</>}
        </GuardedButton>
      </div>

      <div className="flex gap-2 border-b">
        <button onClick={() => setActiveTab("modules")} className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === "modules" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-status-neutral-foreground")}>
          الوحدات المسموحة لكل دور
        </button>
        <button onClick={() => { setActiveTab("permissions"); loadRolePerms(selectedPermRole); }} className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === "permissions" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-status-neutral-foreground")}>
          مصفوفة الصلاحيات التفصيلية
        </button>
        <button onClick={() => setActiveTab("create")} className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === "create" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-status-neutral-foreground")}>
          إنشاء دور جديد
        </button>
      </div>

      {activeTab === "modules" && (
        <div className="grid grid-cols-1 gap-4">
          {predefinedRoles.map((r) => (
            <Card key={r.roleKey} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: (roleKeyColors[r.roleKey] || "#95A5A6") + "15" }}>
                      <KeyRound className="w-4 h-4" style={{ color: roleKeyColors[r.roleKey] || "#95A5A6" }} />
                    </div>
                    <div>
                      <span className="font-semibold text-sm">{r.label}</span>
                      <Badge variant="outline" className="ms-2 text-[10px]">مستوى {r.level}</Badge>
                      <Badge className="ms-1 text-[10px]" style={{ backgroundColor: (roleKeyColors[r.roleKey] || "#95A5A6") + "20", color: roleKeyColors[r.roleKey] || "#95A5A6", border: "none" }}>
                        {r.roleKey}
                      </Badge>
                    </div>
                  </div>
                  {r.roleKey !== "owner" && (
                    editingRole === r.roleKey ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveModules} disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ"}</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingRole(null)}>إلغاء</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => startEdit(r)}>تعديل الوحدات</Button>
                    )
                  )}
                </div>
                {editingRole === r.roleKey ? (
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mt-2">
                    {ALL_MODULES.map(mod => (
                      <button key={mod} onClick={() => toggleModule(mod)}
                        className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs transition-all text-start",
                          editModules.includes(mod) ? "bg-status-info-surface border-blue-400 text-status-info-foreground font-medium" : "bg-white border-border text-muted-foreground hover:border-gray-400")}>
                        {editModules.includes(mod) && <CheckCircle className="h-3 w-3 flex-shrink-0" />}
                        {MODULE_LABELS[mod] || mod}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(roleModulesMap.get(r.roleKey) ?? r.modules).map((m: string) => (
                      <Badge key={m} variant="outline" className="text-[10px] px-1.5 py-0">{MODULE_LABELS[m] || m}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "permissions" && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-sm mb-1.5 block">اختر الدور لضبط صلاحياته</Label>
              <Select value={selectedPermRole} onValueChange={(v) => { setSelectedPermRole(v); loadRolePerms(v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {predefinedRoles.map((r: any) => (
                    <SelectItem key={r.roleKey} value={r.roleKey}>
                      {r.label}{r.isCustom ? " (مخصص)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {permsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">جاري التحميل...</p>
            ) : (
              <div>
                <DataTable
                  columns={rolePermColumns}
                  data={PERM_MODULES}
                  noToolbar
                  pageSize={0}
                  rowKey={(r: any) => r.key}
                />
                {rolePerms.has("*") && (
                  <p className="text-xs text-status-info-foreground mt-2 flex items-center gap-1">
                    <Shield className="h-3 w-3" />هذا الدور يمتلك صلاحيات كاملة (*)
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "create" && (
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold text-base flex items-center gap-2 mb-4">
              <Plus className="h-4 w-4 text-purple-600" />
              إنشاء دور جديد مخصص
            </h3>
            <FormShell
              schema={newRoleSchema}
              defaultValues={{ roleKey: "", label: "", level: 10, modules: [] }}
              submitLabel={creatingRole ? "جاري الإنشاء..." : "إنشاء الدور"}
              onSubmit={async (values, ctx) => {
                await createNewRole(values);
                ctx.reset();
              }}
            >
              <FormGrid cols={3}>
                <FormTextField
                  name="roleKey"
                  label="مفتاح الدور (بالإنجليزية)"
                  required
                  placeholder="custom_manager"
                />
                <FormTextField
                  name="label"
                  label="اسم الدور بالعربية"
                  required
                  placeholder="مدير مخصص"
                />
                <FormNumberField name="level" label="مستوى الصلاحية (1–100)" />
              </FormGrid>
              <ModulesPicker />
            </FormShell>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Multi-select chips driven by react-hook-form state (via FormShell's
// internal FormProvider). Lives outside the schema's primitive types
// so the picker can render its existing button-grid UI verbatim.
function ModulesPicker() {
  const { watch, setValue } = useFormContext<NewRoleForm>();
  const modules = watch("modules");
  const toggle = (mod: string) => {
    setValue(
      "modules",
      modules.includes(mod) ? modules.filter((m) => m !== mod) : [...modules, mod],
      { shouldDirty: true, shouldValidate: true },
    );
  };
  return (
    <div className="mt-4">
      <Label className="block mb-2">الوحدات المسموحة</Label>
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        {ALL_MODULES.map((mod) => (
          <button
            type="button"
            key={mod}
            onClick={() => toggle(mod)}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs transition-all text-start",
              modules.includes(mod)
                ? "bg-purple-50 border-purple-400 text-purple-700 font-medium"
                : "bg-white border-border text-muted-foreground hover:border-gray-400",
            )}
          >
            {modules.includes(mod) && <CheckCircle className="h-3 w-3 flex-shrink-0" />}
            {MODULE_LABELS[mod] || mod}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2">الوحدات المختارة: {modules.length}</p>
    </div>
  );
}
