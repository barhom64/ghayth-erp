// ════════════════════════════════════════════════════════════════════════════
// RBAC-004 — Effective Permissions Viewer (#1799 priority #3)
//
// «ماذا يظهر لمن ومتى» — لكل مستخدم: ما الصلاحيات النهائية بعد دمج
// قوالب الأدوار + الـ overrides + الـ deny rules. الـ backend موجود
// منذ زمن (`GET /admin/users/:id/effective-permissions`)، الصفحة هذه
// تستهلكه فقط — لا backend جديد ولا تكرار.
//
// يصل من:
//   /admin/effective-permissions?userId=42
//   ملف الموظف 360 → تبويب «الأدوار والصلاحيات» → زر «الصلاحيات الفعلية»
// ════════════════════════════════════════════════════════════════════════════
import { useState, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Shield, Search, Filter, X, AlertTriangle, ShieldCheck } from "lucide-react";

interface Permission {
  feature: string;
  actions: string[];
  scope: string;
  conditions: unknown | null;
  source: { roleKey: string; roleLabel: string; isPrimary: boolean };
}

interface Override {
  feature: string;
  action: string | null;
  scope: string | null;
  type: string; // 'grant' | 'deny'
}

interface EffectiveResponse {
  userId: number;
  email: string;
  permissions: Permission[];
  overrides: Override[];
}

interface UserOption {
  id: number;
  email: string;
  name?: string | null;
}

// Arabic translations for scope codes — kept tight; missing keys fall through.
const SCOPE_LABEL: Record<string, string> = {
  self: "الذات فقط",
  team: "الفريق",
  department: "الإدارة",
  branch: "الفرع",
  company: "الشركة كاملة",
  global: "عابر الشركات",
  none: "بدون",
};

const ACTION_LABEL: Record<string, string> = {
  list: "عرض القائمة",
  view: "عرض التفاصيل",
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  approve: "اعتماد",
  reject: "رفض",
  release: "إفراج",
  pay: "دفع",
  post: "ترحيل",
  export: "تصدير",
  import: "استيراد",
};

function actionLabel(a: string) { return ACTION_LABEL[a] || a; }
function scopeLabel(s: string) { return SCOPE_LABEL[s] || s; }

export default function EffectivePermissionsPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const userIdParam = new URLSearchParams(search).get("userId");
  const [userIdInput, setUserIdInput] = useState(userIdParam || "");
  const [filter, setFilter] = useState("");

  // List of users in the company — picker source when no userId is provided.
  // Reuses /admin/users (already gates on assertAdmin).
  const { data: usersData } = useApiQuery<{ data: UserOption[] }>(
    ["admin-users-list"],
    "/admin/users?limit=500",
  );
  const users = usersData?.data ?? [];

  const userId = userIdParam ? Number(userIdParam) : null;
  const { data, isLoading, isError, refetch } = useApiQuery<EffectiveResponse>(
    ["effective-permissions", String(userId ?? "")],
    userId ? `/admin/users/${userId}/effective-permissions` : null,
    { enabled: userId !== null },
  );

  // Group permissions by feature module (the prefix before the first dot)
  // so the page reads top-down — accountants see «finance» grants, HR
  // sees «hr» grants, etc. Within each module sort by feature so the
  // diff between users is stable.
  const grouped = useMemo(() => {
    if (!data?.permissions) return new Map<string, Permission[]>();
    const f = filter.trim().toLowerCase();
    const filtered = f ? data.permissions.filter((p) =>
      p.feature.toLowerCase().includes(f) ||
      p.source.roleKey.toLowerCase().includes(f) ||
      p.actions.some((a) => a.toLowerCase().includes(f))
    ) : data.permissions;
    const map = new Map<string, Permission[]>();
    for (const p of filtered) {
      const mod = p.feature.split(".")[0] || "other";
      if (!map.has(mod)) map.set(mod, []);
      map.get(mod)!.push(p);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.feature.localeCompare(b.feature));
    return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }, [data, filter]);

  const setUserId = (id: string) => {
    navigate(id ? `/admin/effective-permissions?userId=${id}` : "/admin/effective-permissions");
  };

  return (
    <PageShell
      title="الصلاحيات الفعلية للمستخدم"
      subtitle="عرض كامل لما يُسمح للمستخدم بفعله بعد دمج قوالب الأدوار + التخصيصات + قواعد المنع"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/admin", label: "الإدارة" },
        { label: "الصلاحيات الفعلية" },
      ]}
    >
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div>
              <Label className="text-xs">المستخدم</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  placeholder="معرّف المستخدم (userId)"
                  value={userIdInput}
                  onChange={(e) => setUserIdInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") setUserId(userIdInput); }}
                  className="font-mono"
                />
                <Button onClick={() => setUserId(userIdInput)} disabled={!userIdInput}>
                  <Search className="h-4 w-4 me-1" /> عرض
                </Button>
              </div>
              {users.length > 0 && !userId && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground">أو اختر من القائمة:</Label>
                  <div className="flex flex-wrap gap-1 mt-1 max-h-40 overflow-y-auto">
                    {users.slice(0, 50).map((u) => (
                      <button
                        key={u.id}
                        onClick={() => { setUserIdInput(String(u.id)); setUserId(String(u.id)); }}
                        className="text-xs px-2 py-1 rounded bg-surface-subtle hover:bg-primary/10 transition-colors"
                      >
                        <span className="font-mono text-muted-foreground">#{u.id}</span>{" "}
                        {u.name || u.email}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {data && (
              <div className="text-sm">
                <Label className="text-xs">عدد الصلاحيات</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1">
                    <ShieldCheck className="h-3 w-3" /> {data.permissions.length}
                  </Badge>
                  {data.overrides.length > 0 && (
                    <Badge variant="outline" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> {data.overrides.length} override
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!userId && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
            اختر مستخدمًا لعرض صلاحياته الفعلية.
          </CardContent>
        </Card>
      )}

      {userId && isLoading && <LoadingSpinner />}
      {userId && isError && <ErrorState />}

      {userId && data && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="فلتر بالميزة / الدور / الإجراء..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="h-8 text-sm"
                />
                {filter && (
                  <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setFilter("")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-8" onClick={() => refetch()}>
                  تحديث
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Overrides surface first — they bypass role templates */}
          {data.overrides.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Overrides — استثناءات على مستوى المستخدم ({data.overrides.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {data.overrides.map((o, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant={o.type === "deny" ? "destructive" : "secondary"}>{o.type}</Badge>
                    <code className="font-mono">{o.feature}</code>
                    {o.action && <span className="text-muted-foreground">·</span>}
                    {o.action && <code className="font-mono">{actionLabel(o.action)}</code>}
                    {o.scope && <span className="text-muted-foreground">·</span>}
                    {o.scope && <Badge variant="outline" className="text-[10px]">{scopeLabel(o.scope)}</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {grouped.size === 0 && filter && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                لا توجد صلاحيات تطابق «{filter}»
              </CardContent>
            </Card>
          )}

          {grouped.size === 0 && !filter && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                هذا المستخدم لا يملك أي صلاحيات نشطة. تأكد من تعيين دور له من
                «الإدارة → المستخدمون».
              </CardContent>
            </Card>
          )}

          {[...grouped.entries()].map(([mod, perms]) => (
            <Card key={mod}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="font-mono">{mod}</span>
                  <Badge variant="outline">{perms.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {perms.map((p, i) => (
                  <div key={i} className="border rounded p-2 text-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <code className="font-mono font-bold">{p.feature}</code>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        من
                        <Badge variant={p.source.isPrimary ? "default" : "secondary"} className="text-[10px]">
                          {p.source.roleLabel}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">الإجراءات:</span>
                      {p.actions.map((a) => (
                        <Badge key={a} variant="outline" className="text-[10px] font-mono">{actionLabel(a)}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[11px] text-muted-foreground">النطاق:</span>
                      <Badge variant="secondary" className="text-[10px]">{scopeLabel(p.scope)}</Badge>
                      {p.conditions != null && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <AlertTriangle className="h-2.5 w-2.5" /> شروط مخصصة
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
