// ════════════════════════════════════════════════════════════════════════════
// HR-019 — Org Memberships admin (#1799 §B closure for bridges)
//
// قبل: 3 جداول bridges (employee_team_memberships، employee_committee_memberships،
// employee_project_assignments) موجودة من migration 274 لكن لا يمكن إسناد
// عضوية موظف لـ فريق/لجنة/مشروع من النظام — كانت §B "كاملة بصريًا" لكن فارغة.
// بعد: هذه الصفحة بـ 3 tabs (فرق/لجان/مشاريع). كل tab يختار entity من قائمة
// ثم يعرض الأعضاء الحاليين + form إضافة عضو + زر إنهاء عضوية (end-date).
//
// تستهلك endpoints HR-019 من routes/org.ts:
//   GET    /org/teams/:teamId/members
//   POST   /org/team-memberships              (UPSERT)
//   DELETE /org/team-memberships/:id          (end-date)
//   (نفس النمط للجان والمشاريع)
// ════════════════════════════════════════════════════════════════════════════
import { useState, useMemo } from "react";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GuardedButton } from "@/components/shared/permission-gate";
import { TeamSelect, CommitteeSelect, ProjectSelect } from "@/components/shared/entity-selects";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Trash2, Users, Gavel, Briefcase } from "lucide-react";

const PERM_WRITE = "admin:update";

interface Member {
  id: number;
  assignmentId: number;
  employeeId: number;
  employeeName: string;
  role: string;
  jobTitle?: string;
  isVoting?: boolean;
  allocationPercent?: number;
  costCenterId?: number | null;
  startDate: string;
  endDate?: string | null;
}

interface SimpleEntity { id: number; name: string; type?: string }
interface Project { id: number; name: string }

// ─── Generic Members table column set ──────────────────────────────────────
function baseColumns(roleLabels: Record<string, string>): DataTableColumn<Member>[] {
  return [
    { key: "employeeName", header: "الموظف", render: (m) => (
      <div>
        <div className="font-medium">{m.employeeName}</div>
        <div className="text-xs text-muted-foreground">
          assignment #{m.assignmentId}{m.jobTitle ? ` · ${m.jobTitle}` : ""}
        </div>
      </div>
    )},
    { key: "role", header: "الدور", render: (m) => (
      <Badge variant={m.role === "lead" || m.role === "chair" ? "default" : "outline"}>
        {roleLabels[m.role] || m.role}
      </Badge>
    )},
    { key: "startDate", header: "منذ", render: (m) => m.startDate?.slice(0, 10) || "—" },
  ];
}

// ════════════════════════════════════════════════════════════════════════════
// TEAMS TAB
// ════════════════════════════════════════════════════════════════════════════
const TEAM_ROLE_LABELS = { member: "عضو", lead: "قائد", observer: "مراقب" };

function TeamsMembersTab() {
  const { toast } = useToast();
  const [teamId, setTeamId] = useState<string>("");
  const [form, setForm] = useState({ assignmentId: "", role: "member" });

  const { data: membersData, refetch, isLoading } = useApiQuery<{ data: Member[] }>(
    ["team-members", teamId],
    teamId ? `/org/teams/${teamId}/members` : null,
    { enabled: !!teamId },
  );
  const members = asList<Member>(membersData?.data || []);

  const add = async () => {
    const aid = Number(form.assignmentId);
    if (!teamId || !aid) { toast({ title: "اختر الفريق + معرّف التعيين", variant: "destructive" }); return; }
    try {
      await apiFetch("/org/team-memberships", {
        method: "POST",
        body: JSON.stringify({ assignmentId: aid, teamId: Number(teamId), role: form.role }),
      });
      toast({ title: "تم إضافة العضو" });
      setForm({ assignmentId: "", role: "member" });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };

  const endMembership = async (id: number) => {
    if (!confirm("إنهاء عضوية هذا العضو اعتبارًا من اليوم؟")) return;
    try {
      await apiFetch(`/org/team-memberships/${id}`, { method: "DELETE" });
      toast({ title: "تم الإنهاء" });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };

  const columns: DataTableColumn<Member>[] = [
    ...baseColumns(TEAM_ROLE_LABELS),
    { key: "actions", header: "", render: (m) => (
      <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-2 text-status-error" onClick={() => endMembership(m.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </GuardedButton>
    )},
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <TeamSelect
          label="اختر الفريق"
          placeholder="— لم يُختر بعد —"
          value={teamId}
          onChange={setTeamId}
        />
      </div>

      {teamId && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">إضافة عضو</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <div>
                  <Label className="text-xs">معرّف تعيين الموظف *</Label>
                  <Input type="number" value={form.assignmentId} onChange={(e) => setForm({ ...form, assignmentId: e.target.value })} className="mt-1 font-mono" />
                </div>
                <div>
                  <Label className="text-xs">الدور</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TEAM_ROLE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <GuardedButton perm={PERM_WRITE} onClick={add}><Plus className="h-4 w-4 me-1" /> إضافة</GuardedButton>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                assignmentId يُؤخذ من ملف الموظف 360 → tab «المسميات والمناصب». UPSERT — إذا كانت
                العضوية موجودة، يُحدَّث الدور.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> الأعضاء النشطون ({members.length})
            </CardTitle></CardHeader>
            <CardContent>
              {isLoading ? <LoadingSpinner /> : (
                <DataTable data={members} columns={columns} pageSize={20} noToolbar emptyMessage="لا يوجد أعضاء بعد." />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMMITTEES TAB
// ════════════════════════════════════════════════════════════════════════════
const COMMITTEE_ROLE_LABELS = { member: "عضو", chair: "رئيس", secretary: "سكرتير" };

function CommitteesMembersTab() {
  const { toast } = useToast();
  const [committeeId, setCommitteeId] = useState<string>("");
  const [form, setForm] = useState({ assignmentId: "", role: "member", isVoting: true });

  const { data: membersData, refetch, isLoading } = useApiQuery<{ data: Member[] }>(
    ["committee-members", committeeId],
    committeeId ? `/org/committees/${committeeId}/members` : null,
    { enabled: !!committeeId },
  );
  const members = asList<Member>(membersData?.data || []);

  const add = async () => {
    const aid = Number(form.assignmentId);
    if (!committeeId || !aid) { toast({ title: "اختر اللجنة + معرّف التعيين", variant: "destructive" }); return; }
    try {
      await apiFetch("/org/committee-memberships", {
        method: "POST",
        body: JSON.stringify({
          assignmentId: aid, committeeId: Number(committeeId),
          role: form.role, isVoting: form.isVoting,
        }),
      });
      toast({ title: "تم إضافة العضو" });
      setForm({ assignmentId: "", role: "member", isVoting: true });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };
  const endMembership = async (id: number) => {
    if (!confirm("إنهاء عضوية هذا العضو؟")) return;
    try {
      await apiFetch(`/org/committee-memberships/${id}`, { method: "DELETE" });
      toast({ title: "تم الإنهاء" });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };

  const columns: DataTableColumn<Member>[] = [
    ...baseColumns(COMMITTEE_ROLE_LABELS),
    { key: "isVoting", header: "حق التصويت", render: (m) => m.isVoting
      ? <Badge variant="default" className="text-xs">نعم</Badge>
      : <Badge variant="outline" className="text-xs">لا</Badge>
    },
    { key: "actions", header: "", render: (m) => (
      <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-2 text-status-error" onClick={() => endMembership(m.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </GuardedButton>
    )},
  ];

  return (
    <div className="space-y-3">
      <CommitteeSelect
        label="اختر اللجنة"
        placeholder="— لم تُختر بعد —"
        value={committeeId}
        onChange={setCommitteeId}
      />

      {committeeId && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">إضافة عضو</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                <div>
                  <Label className="text-xs">معرّف تعيين الموظف *</Label>
                  <Input type="number" value={form.assignmentId} onChange={(e) => setForm({ ...form, assignmentId: e.target.value })} className="mt-1 font-mono" />
                </div>
                <div>
                  <Label className="text-xs">الدور</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(COMMITTEE_ROLE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <input type="checkbox" id="voting" checked={form.isVoting} onChange={(e) => setForm({ ...form, isVoting: e.target.checked })} />
                  <Label htmlFor="voting" className="cursor-pointer">حق التصويت</Label>
                </div>
                <div className="flex items-end">
                  <GuardedButton perm={PERM_WRITE} onClick={add}><Plus className="h-4 w-4 me-1" /> إضافة</GuardedButton>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">
              <Gavel className="h-4 w-4" /> الأعضاء ({members.length})
            </CardTitle></CardHeader>
            <CardContent>
              {isLoading ? <LoadingSpinner /> : (
                <DataTable data={members} columns={columns} pageSize={20} noToolbar emptyMessage="لا يوجد أعضاء بعد." />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PROJECTS TAB
// ════════════════════════════════════════════════════════════════════════════
function ProjectsContributorsTab() {
  const { toast } = useToast();
  const [projectId, setProjectId] = useState<string>("");
  const [form, setForm] = useState({ assignmentId: "", role: "contributor", allocationPercent: "100" });

  const { data: cData, refetch, isLoading } = useApiQuery<{ data: Member[]; totalAllocationPercent?: number }>(
    ["project-contribs", projectId],
    projectId ? `/org/projects/${projectId}/contributors` : null,
    { enabled: !!projectId },
  );
  const contributors = asList<Member>(cData?.data || []);
  const totalAlloc = cData?.totalAllocationPercent ?? 0;

  const add = async () => {
    const aid = Number(form.assignmentId);
    const alloc = Number(form.allocationPercent);
    if (!projectId || !aid) { toast({ title: "اختر المشروع + معرّف التعيين", variant: "destructive" }); return; }
    if (!alloc || alloc <= 0 || alloc > 100) { toast({ title: "نسبة التخصيص بين 1 و 100", variant: "destructive" }); return; }
    try {
      await apiFetch("/org/project-assignments", {
        method: "POST",
        body: JSON.stringify({
          assignmentId: aid, projectId: Number(projectId),
          role: form.role, allocationPercent: alloc,
        }),
      });
      toast({ title: "تم إضافة المساهم" });
      setForm({ assignmentId: "", role: "contributor", allocationPercent: "100" });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };
  const endAssignment = async (id: number) => {
    if (!confirm("إنهاء تعيين هذا المساهم؟")) return;
    try {
      await apiFetch(`/org/project-assignments/${id}`, { method: "DELETE" });
      toast({ title: "تم الإنهاء" });
      refetch();
    } catch (err: any) { toast({ title: err?.message || "فشل", variant: "destructive" }); }
  };

  const columns: DataTableColumn<Member>[] = [
    { key: "employeeName", header: "الموظف", render: (m) => (
      <div>
        <div className="font-medium">{m.employeeName}</div>
        <div className="text-xs text-muted-foreground">assignment #{m.assignmentId}{m.jobTitle ? ` · ${m.jobTitle}` : ""}</div>
      </div>
    )},
    { key: "role", header: "الدور", render: (m) => <Badge variant="outline">{m.role}</Badge> },
    { key: "allocationPercent", header: "التخصيص", render: (m) => (
      <span className={Number(m.allocationPercent) >= 80 ? "font-bold text-status-info-foreground" : "font-mono"}>
        {Math.round(Number(m.allocationPercent || 0))}%
      </span>
    )},
    { key: "startDate", header: "منذ", render: (m) => m.startDate?.slice(0, 10) },
    { key: "actions", header: "", render: (m) => (
      <GuardedButton perm={PERM_WRITE} variant="ghost" size="sm" className="h-7 px-2 text-status-error" onClick={() => endAssignment(m.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </GuardedButton>
    )},
  ];

  return (
    <div className="space-y-3">
      <ProjectSelect
        label="اختر المشروع"
        placeholder="— لم يُختر بعد —"
        value={projectId}
        onChange={setProjectId}
      />

      {projectId && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">إضافة مساهم</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                <div>
                  <Label className="text-xs">معرّف تعيين الموظف *</Label>
                  <Input type="number" value={form.assignmentId} onChange={(e) => setForm({ ...form, assignmentId: e.target.value })} className="mt-1 font-mono" />
                </div>
                <div>
                  <Label className="text-xs">الدور</Label>
                  <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="contributor / lead / reviewer" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">نسبة التخصيص (%)</Label>
                  <Input type="number" min={1} max={100} value={form.allocationPercent} onChange={(e) => setForm({ ...form, allocationPercent: e.target.value })} className="mt-1 font-mono" />
                </div>
                <div className="flex items-end">
                  <GuardedButton perm={PERM_WRITE} onClick={add}><Plus className="h-4 w-4 me-1" /> إضافة</GuardedButton>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                مجموع نسب المساهمين يُفضَّل أن يساوي 100%. الـ allocation يُستخدم
                لتوزيع تكلفة الراتب على Cost Centers.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4" /> فريق المشروع ({contributors.length})
              </CardTitle>
              <Badge variant={totalAlloc === 100 ? "default" : totalAlloc > 100 ? "destructive" : "secondary"}>
                إجمالي التخصيص: {Math.round(totalAlloc)}%
              </Badge>
            </CardHeader>
            <CardContent>
              {isLoading ? <LoadingSpinner /> : (
                <DataTable data={contributors} columns={columns} pageSize={20} noToolbar emptyMessage="لا يوجد مساهمون بعد." />
              )}
              {totalAlloc > 100 && (
                <p className="text-xs text-status-error-foreground mt-2">
                  ⚠ إجمالي التخصيص يتجاوز 100% — راجع نسب المساهمين.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function OrgMembershipsPage() {
  return (
    <PageShell
      title="عضويات المؤسسة"
      subtitle="إسناد الموظفين للفِرَق + اللجان + المشاريع (HR-019)"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/admin", label: "الإدارة" },
        { label: "عضويات المؤسسة" },
      ]}
    >
      <Tabs defaultValue="teams" className="w-full">
        <TabsList>
          <TabsTrigger value="teams" className="gap-2"><Users className="h-4 w-4" /> أعضاء الفِرَق</TabsTrigger>
          <TabsTrigger value="committees" className="gap-2"><Gavel className="h-4 w-4" /> أعضاء اللجان</TabsTrigger>
          <TabsTrigger value="projects" className="gap-2"><Briefcase className="h-4 w-4" /> فِرَق المشاريع</TabsTrigger>
        </TabsList>
        <TabsContent value="teams" className="mt-4"><TeamsMembersTab /></TabsContent>
        <TabsContent value="committees" className="mt-4"><CommitteesMembersTab /></TabsContent>
        <TabsContent value="projects" className="mt-4"><ProjectsContributorsTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
