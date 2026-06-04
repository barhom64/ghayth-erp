import { useState } from "react";
import { z } from "zod";
import { useFormContext } from "react-hook-form";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KeyRound, CheckCircle, Shield, Plus, X } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { roleKeyColors } from "@/contexts/app-context";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  FormShell,
  FormTextField,
  FormNumberField,
  FormGrid,
} from "@workspace/ui-core";
import { MODULE_LABELS } from "@/lib/module-labels";

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
  // GET /admin/roles — system + custom roles roll-up used to show the
  // total count alongside the predefined system roles.
  const { data: allRolesData } = useApiQuery<any>(["admin-roles"], "/admin/roles");
  const allRolesCount = Number(allRolesData?.total ?? (allRolesData?.data?.length ?? 0));

  // Admin-only role-permission CRUD.
  //   GET    /admin/role-permissions          — list (filterable by role)
  //   POST   /admin/role-permissions          — add a (role, permission) row
  //   PUT    /admin/role-permissions/bulk     — replace all rows for a role atomically
  //   DELETE /admin/role-permissions/:id      — drop one (role, permission) row
  const [permRoleFilter, setPermRoleFilter] = useState("");
  const rolePermsQ = useApiQuery<any>(
    ["admin-role-permissions", permRoleFilter],
    permRoleFilter
      ? `/admin/role-permissions?role=${encodeURIComponent(permRoleFilter)}`
      : "/admin/role-permissions",
  );
  const rolePermsRows: any[] = rolePermsQ.data?.data ?? [];
  const [newPermRole, setNewPermRole] = useState("");
  const [newPerm, setNewPerm] = useState("");
  const handleAddPerm = async () => {
    if (!newPermRole.trim() || !newPerm.trim()) return;
    try {
      await apiFetch("/admin/role-permissions", {
        method: "POST",
        body: JSON.stringify({ role: newPermRole.trim(), permission: newPerm.trim() }),
      });
      toast({ title: "أُضيفت الصلاحية" });
      setNewPerm("");
      rolePermsQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الإضافة", description: err?.message });
    }
  };
  // Delete uses ConfirmDeleteDialog (R.1.4) — no native confirm() and
  // gives the user an "are you sure" moment before destroying ACL data.
  const [deletingPermId, setDeletingPermId] = useState<number | null>(null);
  const [bulkRole, setBulkRole] = useState("");
  const [bulkPerms, setBulkPerms] = useState("");
  const [bulkPreview, setBulkPreview] = useState(false);
  const handleBulkReplace = async () => {
    if (!bulkRole.trim()) return;
    const perms = bulkPerms
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await apiFetch("/admin/role-permissions/bulk", {
        method: "PUT",
        body: JSON.stringify({ role: bulkRole.trim(), permissions: perms }),
      });
      toast({ title: `استُبدلت ${perms.length} صلاحية للدور` });
      setBulkPerms("");
      setBulkRole("");
      rolePermsQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الاستبدال", description: err?.message });
    }
  };
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
    <PageShell
      title="إدارة الأدوار والصلاحيات"
      subtitle={`تعيين الوحدات المسموحة لكل دور وضبط مصفوفة الصلاحيات${allRolesCount > 0 ? ` · إجمالي الأدوار في النظام: ${allRolesCount}` : ""}`}
      breadcrumbs={[{ href: "/dashboard", label: "لوحة التحكم" }, { href: "/admin", label: "الإدارة" }, { label: "الأدوار والصلاحيات" }]}
      actions={
        <GuardedButton perm="admin:create" size="sm" onClick={() => setActiveTab(activeTab === "create" ? "modules" : "create")}>
          {activeTab === "create" ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إنشاء دور جديد</>}
        </GuardedButton>
      }
    >
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">صلاحيات الأدوار (إدارة منخفضة المستوى)</CardTitle>
          <p className="text-xs text-muted-foreground">
            تحرير مباشر لصلاحيات الأدوار في قاعدة بيانات الصلاحيات. الاستبدال الجماعي يستخدم معاملة واحدة لتجنّب وجود حالة وسطية.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">فلتر حسب الدور</label>
              <input
                value={permRoleFilter}
                onChange={(e) => setPermRoleFilter(e.target.value)}
                dir="ltr"
                className="w-full h-7 px-2 border rounded text-xs"
                placeholder="role_key (اتركه فارغاً لرؤية الكل)"
              />
            </div>
            <span className="text-muted-foreground">{rolePermsRows.length} صلاحية</span>
          </div>

          <div className="border rounded">
            <div className="max-h-48 overflow-y-auto divide-y">
              {rolePermsRows.slice(0, 50).map((p: any) => (
                <div key={p.id} className="px-2 py-1 flex items-center justify-between">
                  <span className="font-mono text-[10px]">
                    {p.role} <span className="text-muted-foreground">→</span> {p.permission}
                  </span>
                  <GuardedButton
                    perm="admin:update"
                    variant="ghost"
                    size="sm"
                    className="text-[10px] h-6 text-status-error-foreground"
                    onClick={() => setDeletingPermId(p.id)}
                  >
                    حذف
                  </GuardedButton>
                </div>
              ))}
              {rolePermsRows.length === 0 && (
                <p className="text-muted-foreground p-2 text-center">لا توجد صلاحيات مطابقة</p>
              )}
            </div>
          </div>
          <ConfirmDeleteDialog
            open={deletingPermId !== null}
            onOpenChange={(o) => !o && setDeletingPermId(null)}
            entity={{
              type: "role_permission",
              id: deletingPermId ?? 0,
              name: (() => {
                const row = rolePermsRows.find((p: any) => p.id === deletingPermId);
                return row ? `${row.role} → ${row.permission}` : `صلاحية #${deletingPermId ?? "?"}`;
              })(),
            }}
            deletePath={deletingPermId !== null ? `/admin/role-permissions/${deletingPermId}` : ""}
            invalidateKeys={[["admin-role-permissions"]]}
            onDeleted={() => { setDeletingPermId(null); rolePermsQ.refetch(); }}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 border rounded bg-surface-subtle/30 space-y-2">
              <p className="text-xs font-semibold">إضافة صلاحية واحدة</p>
              <input
                value={newPermRole}
                onChange={(e) => setNewPermRole(e.target.value)}
                placeholder="role"
                dir="ltr"
                className="w-full h-7 px-2 border rounded text-xs"
              />
              <input
                value={newPerm}
                onChange={(e) => setNewPerm(e.target.value)}
                placeholder="permission"
                dir="ltr"
                className="w-full h-7 px-2 border rounded text-xs"
              />
              <GuardedButton
                perm="admin:update"
                size="sm"
                rateLimitAware
                onClick={handleAddPerm}
                disabled={!newPermRole.trim() || !newPerm.trim()}
              >
                إضافة
              </GuardedButton>
            </div>
            <div className="p-3 border rounded bg-surface-subtle/30 space-y-2">
              <p className="text-xs font-semibold">استبدال جماعي لدور</p>
              <input
                value={bulkRole}
                onChange={(e) => setBulkRole(e.target.value)}
                placeholder="role"
                dir="ltr"
                className="w-full h-7 px-2 border rounded text-xs"
              />
              <textarea
                value={bulkPerms}
                onChange={(e) => setBulkPerms(e.target.value)}
                placeholder={"perm1\nperm2,perm3"}
                dir="ltr"
                className="w-full h-16 px-2 py-1 border rounded text-xs font-mono"
              />
              <GuardedButton
                perm="admin:update"
                size="sm"
                variant="destructive"
                rateLimitAware
                onClick={() => setBulkPreview(true)}
                disabled={!bulkRole.trim()}
              >
                استبدال (مدمّر)
              </GuardedButton>
              {bulkPreview && (
                <div className="mt-2 p-2 border border-status-warning-surface bg-status-warning-surface/30 rounded text-xs space-y-1">
                  <p className="font-semibold text-status-warning-foreground">تأكيد الاستبدال الجماعي</p>
                  <p>
                    سيُحذف جميع صلاحيات الدور <span className="font-mono">"{bulkRole.trim()}"</span> الحاليّة وتُستبدل بـ{" "}
                    <span className="font-mono">{bulkPerms.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).length}</span> صلاحية جديدة.
                  </p>
                  <div className="flex items-center gap-2">
                    <GuardedButton perm="admin:update" size="sm" variant="destructive" rateLimitAware onClick={() => { handleBulkReplace(); setBulkPreview(false); }}>
                      نعم، استبدال
                    </GuardedButton>
                    <Button size="sm" variant="outline" onClick={() => setBulkPreview(false)}>إلغاء</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </PageShell>
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
