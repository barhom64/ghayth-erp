// ════════════════════════════════════════════════════════════════════════════
// PR-7 (#2077) — الشجرة التنظيمية الموحّدة (Unified Org Tree).
//
// Renders the decided hierarchy in one collapsible view:
//
//   Company → Branch → Administration → Department → Team
//
// Committee + Project + Cost Center are NOT in the tree (per the product
// owner's decision); they show as «الارتباطات التشغيلية» side-panel on
// the employee 360, not here.
//
// The page is read-mostly: it reads /settings/org-tree (the new
// aggregator that returns the nested structure in ONE call) + offers
// inline create dialogs for the missing nodes the audit found dark:
// administrations (NEW level), departments (existing), teams
// (existing — link to /admin/org-memberships for full team CRUD).
// Every mutation hits the corresponding settings endpoint
// (/settings/administrations, /settings/departments) — no new backend.
// ════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuardedButton } from "@/components/shared/permission-gate";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import {
  Building, Building2, Users, Users2, Network, Plus, ChevronDown, ChevronLeft,
  AlertTriangle, Layers, ArrowUpRight,
} from "lucide-react";

interface Team { id: number; name: string; departmentId: number | null; leaderAssignmentId: number | null; employeeCount: number; }
interface Dept { id: number; name: string; branchId: number | null; administrationId: number | null; managerId: number | null; employeeCount: number; teams: Team[]; }
interface Adm  { id: number; name: string; branchId: number | null; isActive: boolean; employeeCount: number; departments: Dept[]; }
interface Branch { id: number; name: string; administrations: Adm[]; }
interface TreeResp {
  company: { id: number; name: string };
  branches: Branch[];
  crossBranchAdministrations: Adm[];
  orphanDepartments: Dept[];
}

const PERM_WRITE = "hr.organization:update";

export default function OrgTreePage() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useApiQuery<TreeResp>(
    ["settings-org-tree"], "/settings/org-tree",
  );

  // ── State for inline create dialogs ───────────────────────────────
  const [showAdmDialog, setShowAdmDialog] = useState<{ branchId: number | null } | null>(null);
  const [showDeptDialog, setShowDeptDialog] = useState<{ administrationId: number; branchId: number | null } | null>(null);
  const [admName, setAdmName] = useState("");
  const [deptName, setDeptName] = useState("");

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const totals = {
    branches: data.branches.length,
    administrations: data.branches.reduce((s, b) => s + b.administrations.length, 0) + data.crossBranchAdministrations.length,
    departments: data.branches.reduce((s, b) => s + b.administrations.reduce((ss, a) => ss + a.departments.length, 0), 0) + data.orphanDepartments.length,
    teams: data.branches.reduce((s, b) => s + b.administrations.reduce((ss, a) => ss + a.departments.reduce((sss, d) => sss + d.teams.length, 0), 0), 0),
    orphanDepartments: data.orphanDepartments.length,
    crossBranchAdministrations: data.crossBranchAdministrations.length,
  };

  const createAdm = async () => {
    if (!admName.trim() || !showAdmDialog) return;
    try {
      await apiFetch("/settings/administrations", {
        method: "POST",
        body: JSON.stringify({
          name: admName.trim(),
          branchId: showAdmDialog.branchId,
        }),
      });
      toast({ title: "تم إنشاء الإدارة" });
      setShowAdmDialog(null);
      setAdmName("");
      refetch();
    } catch (e: any) { toast({ title: e?.message || "فشل الإنشاء", variant: "destructive" }); }
  };

  const createDept = async () => {
    if (!deptName.trim() || !showDeptDialog) return;
    try {
      await apiFetch("/settings/departments", {
        method: "POST",
        body: JSON.stringify({
          name: deptName.trim(),
          administrationId: showDeptDialog.administrationId,
          branchId: showDeptDialog.branchId,
        }),
      });
      toast({ title: "تم إنشاء القسم" });
      setShowDeptDialog(null);
      setDeptName("");
      refetch();
    } catch (e: any) { toast({ title: e?.message || "فشل الإنشاء", variant: "destructive" }); }
  };

  return (
    <PageShell
      title="الشجرة التنظيمية"
      subtitle="الهيكل الموحد: شركة ← فرع ← إدارة ← قسم ← فريق. اللجنة والمشروع ومركز التكلفة ارتباطات تشغيلية فوق الشجرة، ليست داخلها."
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/hr", label: "الموارد البشرية" },
        { label: "الشجرة التنظيمية" },
      ]}
      data-testid="org-tree-page"
    >
      {/* Totals strip — instant overview before diving into the tree. */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4" data-testid="org-tree-totals">
        <SummaryTile icon={Building2} label="الفروع"      n={totals.branches}        tone="info" />
        <SummaryTile icon={Layers}    label="الإدارات"    n={totals.administrations} tone="info" />
        <SummaryTile icon={Building}  label="الأقسام"     n={totals.departments}     tone="info" />
        <SummaryTile icon={Users2}    label="الفِرَق"      n={totals.teams}           tone="info" />
        <SummaryTile icon={AlertTriangle} label="أقسام بدون إدارة" n={totals.orphanDepartments} tone="warning" />
        <SummaryTile icon={AlertTriangle} label="إدارات بدون فرع"  n={totals.crossBranchAdministrations} tone="warning" />
      </div>

      <Card data-testid="org-tree-root">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="h-5 w-5" />
            {data.company.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.branches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا توجد فروع. أضف الفرع من <Link href="/settings"><a className="text-primary">الإعدادات</a></Link>.</p>
          ) : (
            <div className="space-y-3">
              {data.branches.map((b) => (
                <BranchNode
                  key={b.id}
                  branch={b}
                  onAddAdm={() => setShowAdmDialog({ branchId: b.id })}
                  onAddDept={(admId) => setShowDeptDialog({ administrationId: admId, branchId: b.id })}
                />
              ))}
              {data.crossBranchAdministrations.length > 0 && (
                <div className="border-t pt-3 mt-3" data-testid="cross-branch-administrations">
                  <p className="text-xs text-amber-700 font-semibold mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    إدارات لم تُربط بفرع ({data.crossBranchAdministrations.length})
                  </p>
                  {data.crossBranchAdministrations.map((a) => (
                    <AdmNode key={a.id} adm={a} onAddDept={(admId) => setShowDeptDialog({ administrationId: admId, branchId: null })} />
                  ))}
                </div>
              )}
              {data.orphanDepartments.length > 0 && (
                <div className="border-t pt-3 mt-3" data-testid="orphan-departments">
                  <p className="text-xs text-amber-700 font-semibold mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    أقسام بدون إدارة ({data.orphanDepartments.length}) — اربطها بإدارة لإكمال السلسلة
                  </p>
                  {data.orphanDepartments.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 p-2 rounded border mb-1 bg-amber-50/50 text-sm" data-testid={`orphan-dept-${d.id}`}>
                      <Building className="h-3.5 w-3.5 text-amber-700" />
                      <span className="font-medium">{d.name}</span>
                      <Badge variant="outline" className="text-xs">{d.employeeCount} موظف</Badge>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t pt-3 mt-3 flex justify-end gap-2">
                <GuardedButton perm={PERM_WRITE} onClick={() => setShowAdmDialog({ branchId: null })} variant="outline" size="sm">
                  <Plus className="h-4 w-4 me-1" /> إدارة بدون فرع
                </GuardedButton>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* «الارتباطات التشغيلية» — explicit reminder that committee +
          project + cost center live OUTSIDE the tree per the decision. */}
      <Card className="mt-4 border-dashed bg-status-info-surface/30" data-testid="operational-bridges-callout">
        <CardContent className="p-4">
          <p className="text-sm font-medium flex items-center gap-2 mb-2">
            <Layers className="h-4 w-4 text-status-info-foreground" />
            الارتباطات التشغيلية فوق الشجرة (لا داخلها)
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            القرار المعتمد: <strong>اللجنة + المشروع + مركز التكلفة</strong> ارتباطات تشغيلية يحملها الموظف بصرف
            النظر عن قسمه. تظهر كعضويات في ملف الموظف، وليست عقدًا في الهيكل.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href="/admin/org-memberships"><a className="text-primary hover:underline flex items-center gap-1">إدارة العضويات (فِرَق/لجان/مشاريع) <ArrowUpRight className="h-3 w-3" /></a></Link>
            <span className="text-muted-foreground">·</span>
            <Link href="/finance/cost-centers"><a className="text-primary hover:underline flex items-center gap-1">مراكز التكلفة <ArrowUpRight className="h-3 w-3" /></a></Link>
          </div>
        </CardContent>
      </Card>

      {/* Inline create dialogs — kept minimal. The admin can rename
          /edit later from /settings/departments or this page's PATCH
          flow (future-PR). */}
      {showAdmDialog && (
        <Card className="fixed inset-x-4 bottom-4 md:inset-x-auto md:right-8 md:w-80 shadow-xl z-50" data-testid="adm-dialog">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">إضافة إدارة جديدة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="اسم الإدارة (مثال: إدارة المالية)" value={admName} onChange={(e) => setAdmName(e.target.value)} />
            {showAdmDialog.branchId === null && (
              <p className="text-xs text-amber-700">سيتم إنشاؤها بدون ربط بفرع — يمكنك ربطها لاحقًا.</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setShowAdmDialog(null); setAdmName(""); }}>إلغاء</Button>
              <Button size="sm" onClick={createAdm} disabled={!admName.trim()}>إنشاء</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {showDeptDialog && (
        <Card className="fixed inset-x-4 bottom-4 md:inset-x-auto md:right-8 md:w-80 shadow-xl z-50" data-testid="dept-dialog">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">إضافة قسم جديد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="اسم القسم" value={deptName} onChange={(e) => setDeptName(e.target.value)} />
            <p className="text-xs text-muted-foreground">سيُربط بالإدارة المختارة.</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setShowDeptDialog(null); setDeptName(""); }}>إلغاء</Button>
              <Button size="sm" onClick={createDept} disabled={!deptName.trim()}>إنشاء</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

// ─── Helper components ─────────────────────────────────────────────────────
function SummaryTile({ icon: Icon, label, n, tone }: {
  icon: typeof Building; label: string; n: number; tone: "info" | "warning";
}) {
  const cls = tone === "warning"
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-status-info-surface bg-status-info-surface/40 text-status-info-foreground";
  return (
    <div className={`rounded-lg border p-3 ${cls}`} data-testid={`summary-${label}`}>
      <div className="flex items-center justify-between mb-1">
        <Icon className="h-4 w-4 opacity-70" />
        <span className="text-xl font-bold">{n}</span>
      </div>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function BranchNode({ branch, onAddAdm, onAddDept }: {
  branch: Branch; onAddAdm: () => void; onAddDept: (admId: number) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border rounded-lg" data-testid={`branch-${branch.id}`}>
      <button onClick={() => setOpen(!open)} className="w-full p-3 flex items-center gap-2 hover:bg-surface-subtle text-right">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        <Building2 className="h-4 w-4 text-status-info-foreground" />
        <span className="font-semibold">{branch.name}</span>
        <Badge variant="outline" className="text-xs ms-auto">{branch.administrations.length} إدارة</Badge>
      </button>
      {open && (
        <div className="p-3 pt-0 pe-6 space-y-2">
          {branch.administrations.length === 0 ? (
            <p className="text-xs text-muted-foreground italic ps-6">لا توجد إدارات لهذا الفرع.</p>
          ) : (
            branch.administrations.map((a) => (
              <AdmNode key={a.id} adm={a} onAddDept={onAddDept} />
            ))
          )}
          <div className="ps-6 pt-1">
            <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" onClick={onAddAdm} className="text-xs h-7">
              <Plus className="h-3.5 w-3.5 me-1" /> إضافة إدارة لهذا الفرع
            </GuardedButton>
          </div>
        </div>
      )}
    </div>
  );
}

function AdmNode({ adm, onAddDept }: { adm: Adm; onAddDept: (admId: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border rounded ${adm.isActive ? "" : "opacity-60"}`} data-testid={`adm-${adm.id}`}>
      <button onClick={() => setOpen(!open)} className="w-full p-2 flex items-center gap-2 hover:bg-surface-subtle text-right">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        <Layers className="h-3.5 w-3.5 text-amber-700" />
        <span className="font-medium text-sm">{adm.name}</span>
        {!adm.isActive && <Badge variant="outline" className="text-[10px]">مؤرشفة</Badge>}
        <Badge variant="secondary" className="text-[10px] ms-auto">{adm.departments.length} قسم</Badge>
        <Badge variant="outline" className="text-[10px]">{adm.employeeCount} موظف</Badge>
      </button>
      {open && (
        <div className="p-2 pt-0 pe-6 space-y-1">
          {adm.departments.length === 0 ? (
            <p className="text-xs text-muted-foreground italic ps-4">لا توجد أقسام في هذه الإدارة.</p>
          ) : (
            adm.departments.map((d) => (
              <div key={d.id} className="border rounded p-2 text-sm" data-testid={`dept-${d.id}`}>
                <div className="flex items-center gap-2">
                  <Building className="h-3.5 w-3.5 text-status-info-foreground" />
                  <span className="font-medium">{d.name}</span>
                  <Badge variant="outline" className="text-[10px] ms-auto">{d.teams.length} فريق</Badge>
                  <Badge variant="outline" className="text-[10px]">{d.employeeCount} موظف</Badge>
                </div>
                {d.teams.length > 0 && (
                  <div className="ps-5 mt-1 space-y-0.5">
                    {d.teams.map((t) => (
                      <div key={t.id} className="text-xs text-muted-foreground flex items-center gap-1.5" data-testid={`team-${t.id}`}>
                        <Users className="h-3 w-3" />
                        {t.name}
                        <span className="ms-auto font-mono">({t.employeeCount})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          <div className="ps-4 pt-1">
            <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" onClick={() => onAddDept(adm.id)} className="text-xs h-6">
              <Plus className="h-3 w-3 me-1" /> إضافة قسم لهذه الإدارة
            </GuardedButton>
          </div>
        </div>
      )}
    </div>
  );
}
