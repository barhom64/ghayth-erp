// ════════════════════════════════════════════════════════════════════════════
// PR-5 (#2077) — صندوق الأعمال الموحّد (Unified Work Inbox).
//
// قبل: مدير HR يفتح 5 صفحات صباحًا (/notifications + /action-center +
// /hr/approval-inbox + /finance/approvals-inbox + /tasks) ليرى ما ينتظر
// إجراءاته. بعد: صفحة واحدة باسم «صندوق الأعمال» تُجمِّع المصادر
// الموجودة في أربعة أقسام يطلبها المنتج صراحةً (لا backend جديد، لا
// جدول جديد، لا workflow جديد — فقط طبقة تجميع + فلاتر).
//
// الأقسام الأربعة (حرفيًا كما طلبها صاحب المنتج):
//   1. يحتاج إجراء مني — Pending approvals across HR + finance + workflow.
//                       يُجمَّع من /my-space.pendingApprovals (الذي يقفل
//                       بالـrole على ما يُنتظر اعتمادي).
//   2. مهامي           — Tasks assigned to me, مُقسَّمة:
//                          • متأخرة (dueDate < اليوم)
//                          • اليوم    (dueDate = اليوم)
//                          • هذا الأسبوع
//                          • هذا الشهر
//   3. إشعارات مهمة    — Filtered to ACTIONABLE notification types:
//                          • مخالفة الحضور
//                          • تقييم جديد
//                          • انتهاء العقد
//                          • انتهاء الإقامة
//                          • تذكيرات الانتهاء الأخرى
//   4. متابعاتي        — Things I follow up on (طلباتي + طلبات فريقي +
//                       طلبات إدارتي بحسب الدور والنطاق):
//                          • طلباتي     ← /my-space.openRequests
//                          • طلبات فريقي ← /hr/leave-requests?branchId=mine
//                          • طلبات إدارتي ← /hr/leave-requests?departmentId=mine
//
// السياسة: لا جدول جديد، لا engine جديد. كل عداد + كل بطاقة + كل deep-link
// يُبنى من مصادر تشغيلية قائمة.
// ════════════════════════════════════════════════════════════════════════════
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatDateAr } from "@/lib/formatters";
import { useAppContext } from "@/contexts/app-context";
import {
  CheckSquare, Bell, ClipboardCheck, ArrowUpRight, AlertCircle, Calendar,
  FileWarning, ClipboardList, AlertTriangle, Inbox,
} from "lucide-react";

type PendingApproval = {
  id: number;
  type: string;
  employeeName?: string;
  title?: string;
  status?: string;
  createdAt: string;
};

type Task = {
  id: number;
  title: string;
  status: string;
  priority: string | null;
  dueDate?: string | null;
  scheduledDate: string | null;
  scheduledStart: string | null;
  clientName?: string | null;
  createdAt?: string;
};

type Notification = {
  id: number;
  type: string;
  title: string;
  body?: string;
  priority?: string;
  isRead: boolean;
  createdAt: string;
  refType?: string;
  refId?: number;
  actionUrl?: string;
};

type LeaveRow = {
  id: number;
  employeeName?: string;
  employeeId?: number;
  departmentId?: number | null;
  branchId?: number | null;
  leaveType?: string;
  status: string;
  createdAt: string;
};

type OpenRequest = {
  id: number;
  type: string;
  title: string;
  status: string;
  createdAt: string;
};

// Notification types we consider ACTIONABLE on this page (the rest are
// passive informational notifications that the bell handles).
// Pulled from notification-type usage across the codebase + the
// audit's «إشعارات مهمة» list (violation, evaluation, contract/iqama
// expiry).
const ACTIONABLE_NOTIF_TYPES = new Set([
  "attendance_violation",
  "auto_violation",
  "performance_evaluation",
  "evaluation_created",
  "contract_expiry",
  "contract_expiring",
  "iqama_expiry",
  "iqama_expiring",
  "passport_expiry",
  "passport_expiring",
  "document_expiry",
  "visa_expiry",
  "loan_overdue",
  "leave_overdue",
  "task_overdue",
]);

const APPROVAL_TYPE_LABEL: Record<string, string> = {
  leave: "إجازة",
  loan: "سلفة",
  overtime: "وقت إضافي",
  exit: "نهاية خدمة",
  expense: "مصروف",
  purchase_order: "أمر شراء",
  custody: "عهدة",
  official_letter: "خطاب رسمي",
  hr_transfer: "نقل موظف",
  umrah_booking: "حجز عمرة",
};

function approvalDeepLink(a: PendingApproval): string {
  switch (a.type) {
    case "leave": return `/hr/leaves/${a.id}`;
    case "loan": return `/hr/loans/${a.id}`;
    case "overtime": return `/hr/overtime/${a.id}`;
    case "exit": return `/hr/exit/${a.id}`;
    case "expense": return `/finance/expenses/${a.id}`;
    case "purchase_order": return `/finance/purchase-orders/${a.id}`;
    case "custody": return `/finance/custodies/${a.id}`;
    case "official_letter": return `/hr/official-letters/${a.id}`;
    case "hr_transfer": return `/hr/transfers/${a.id}`;
    case "umrah_booking": return `/umrah/bookings/${a.id}`;
    default: return "/hr/approval-inbox";
  }
}

type FollowupScope = "mine" | "team" | "department";

function classifyTaskUrgency(t: Task): "overdue" | "today" | "week" | "month" {
  const due = t.dueDate || t.scheduledDate;
  if (!due) return "month";
  const dueDate = new Date(due);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // utc-ok: UI bucket day-truncation, not a finance period
  const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()); // utc-ok: same — UI bucket math
  const msPerDay = 86400000;
  const daysOff = Math.round((dueDay.getTime() - today.getTime()) / msPerDay);
  if (daysOff < 0) return "overdue";
  if (daysOff === 0) return "today";
  if (daysOff <= 7) return "week";
  return "month";
}

export default function WorkInboxPage() {
  const { selectedBranchId } = useAppContext();
  const [followupScope, setFollowupScope] = useState<FollowupScope>("mine");

  // ── Source 1: pending approvals (already role-gated server-side) ──
  const { data: mySpace, isLoading: lMS, isError: eMS } = useApiQuery<{
    pendingApprovals?: PendingApproval[];
    openRequests?: OpenRequest[];
  }>(["work-inbox-mySpace"], "/my-space");

  // ── Source 2: my tasks (status open) ──
  const { data: tasksData, isLoading: lT, isError: eT } = useApiQuery<{ data?: Task[] }>(
    ["work-inbox-tasks"], "/tasks?limit=100&status=pending,in_progress&assignedToMe=1",
  );

  // ── Source 3: my unread + actionable notifications ──
  const { data: notifsData, isLoading: lN, isError: eN } = useApiQuery<{ data?: Notification[] }>(
    ["work-inbox-notifs"], "/notifications?limit=100&unreadOnly=true",
  );

  // ── Source 4: team + department leave requests (scope = team/dept).
  // Loaded only when the operator picks the wider scope so the page
  // stays cheap by default. The endpoint enforces scope server-side
  // (branchId / departmentId filters resolved against req.scope).
  const wantTeam = followupScope === "team";
  const wantDept = followupScope === "department";
  const { data: teamReqs } = useApiQuery<{ data?: LeaveRow[] }>(
    ["work-inbox-team-leaves", String(selectedBranchId ?? 0)],
    `/hr/leave-requests?branchId=${selectedBranchId ?? ""}&limit=50&status=pending`,
    { enabled: wantTeam && !!selectedBranchId },
  );
  const { data: deptReqs } = useApiQuery<{ data?: LeaveRow[] }>(
    ["work-inbox-dept-leaves"],
    `/hr/leave-requests?scope=department&limit=50&status=pending`,
    { enabled: wantDept },
  );

  const approvals = mySpace?.pendingApprovals ?? [];
  const myRequests = mySpace?.openRequests ?? [];
  const tasks = tasksData?.data ?? [];
  const notifs = (notifsData?.data ?? []).filter(
    (n) => ACTIONABLE_NOTIF_TYPES.has(n.type) || (n.priority === "high" || n.priority === "critical"),
  );
  const teamLeaves = teamReqs?.data ?? [];
  const deptLeaves = deptReqs?.data ?? [];

  // ── Section 2 — tasks split by urgency ──
  const tasksByUrgency = useMemo(() => {
    const buckets: Record<"overdue" | "today" | "week" | "month", Task[]> = {
      overdue: [], today: [], week: [], month: [],
    };
    for (const t of tasks) buckets[classifyTaskUrgency(t)].push(t);
    return buckets;
  }, [tasks]);

  const counts = {
    actions: approvals.length,
    tasksTotal: tasks.length,
    tasksOverdue: tasksByUrgency.overdue.length,
    tasksToday: tasksByUrgency.today.length,
    notifs: notifs.length,
    myRequests: myRequests.length,
    teamRequests: teamLeaves.length,
    deptRequests: deptLeaves.length,
  };

  const total = counts.actions + counts.tasksTotal + counts.notifs;

  const anyLoading = lMS || lT || lN;
  const anyError = eMS && eT && eN;
  if (anyLoading) return <PageShell title="صندوق الأعمال" subtitle="جاري التحميل..."><LoadingSpinner /></PageShell>;
  if (anyError) return <PageShell title="صندوق الأعمال" subtitle="فشل التحميل"><ErrorState /></PageShell>;

  return (
    <PageShell
      title="صندوق الأعمال"
      subtitle="كل ما ينتظر إجراءاتك — موافقات، مهامك، إشعارات مهمة، متابعاتك — في صفحة واحدة"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "صندوق الأعمال" },
      ]}
      data-testid="work-inbox"
    >
      <Tabs defaultValue="actions" className="w-full">
        <TabsList className="flex flex-wrap h-auto" data-testid="work-inbox-tabs">
          <TabsTrigger value="actions" className="gap-2" data-testid="tab-actions">
            <ClipboardCheck className="h-4 w-4" />
            يحتاج إجراء مني
            {counts.actions > 0 && <Badge variant="destructive" className="ms-1">{counts.actions}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2" data-testid="tab-tasks">
            <CheckSquare className="h-4 w-4" />
            مهامي
            {counts.tasksOverdue > 0 && <Badge variant="destructive" className="ms-1">{counts.tasksOverdue} متأخرة</Badge>}
            {counts.tasksTotal > 0 && counts.tasksOverdue === 0 && <Badge variant="secondary" className="ms-1">{counts.tasksTotal}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="notifs" className="gap-2" data-testid="tab-notifs">
            <Bell className="h-4 w-4" />
            إشعارات مهمة
            {counts.notifs > 0 && <Badge variant="secondary" className="ms-1">{counts.notifs}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="followups" className="gap-2" data-testid="tab-followups">
            <ClipboardList className="h-4 w-4" />
            متابعاتي
            {counts.myRequests > 0 && <Badge variant="secondary" className="ms-1">{counts.myRequests}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ───────────────────────────── 1. يحتاج إجراء مني ───────────────────────────── */}
        <TabsContent value="actions" className="mt-4">
          {approvals.length === 0 ? (
            <EmptyState text="لا توجد طلبات تنتظر اعتمادك." />
          ) : (
            <div className="space-y-2">
              {approvals.map((a) => (
                <ItemCard
                  key={`approval:${a.type}:${a.id}`}
                  icon={ClipboardCheck}
                  badgeText={APPROVAL_TYPE_LABEL[a.type] || a.type}
                  badgeClass="bg-status-info-surface text-status-info-foreground"
                  title={a.title || `${APPROVAL_TYPE_LABEL[a.type] || a.type} — ${a.employeeName ?? "موظف"}`}
                  meta={a.employeeName}
                  createdAt={a.createdAt}
                  href={approvalDeepLink(a)}
                  testId={`action-${a.type}-${a.id}`}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ───────────────────────────── 2. مهامي ───────────────────────────── */}
        <TabsContent value="tasks" className="mt-4">
          {tasks.length === 0 ? (
            <EmptyState text="لا توجد مهام مفتوحة." />
          ) : (
            <div className="space-y-6">
              <TaskBucket
                title="مهام متأخرة"
                tone="error"
                tasks={tasksByUrgency.overdue}
                emptyMsg="لا توجد مهام متأخرة — أحسنت."
              />
              <TaskBucket
                title="مهام اليوم"
                tone="warning"
                tasks={tasksByUrgency.today}
                emptyMsg="لا توجد مهام مجدولة اليوم."
              />
              <TaskBucket
                title="مهام هذا الأسبوع"
                tone="info"
                tasks={tasksByUrgency.week}
                emptyMsg="لا توجد مهام هذا الأسبوع."
              />
              <TaskBucket
                title="مهام هذا الشهر"
                tone="muted"
                tasks={tasksByUrgency.month}
                emptyMsg="لا توجد مهام هذا الشهر."
              />
            </div>
          )}
        </TabsContent>

        {/* ───────────────────────────── 3. إشعارات مهمة ───────────────────────────── */}
        <TabsContent value="notifs" className="mt-4">
          {notifs.length === 0 ? (
            <EmptyState text="لا توجد إشعارات تتطلّب إجراءً." />
          ) : (
            <div className="space-y-2">
              {notifs.map((n) => (
                <ItemCard
                  key={`notif:${n.id}`}
                  icon={notifIcon(n.type)}
                  badgeText={notifLabel(n.type)}
                  badgeClass={n.priority === "high" || n.priority === "critical"
                    ? "bg-status-error-surface text-status-error-foreground"
                    : "bg-amber-50 text-amber-700"}
                  title={n.title}
                  meta={n.body?.slice(0, 80)}
                  createdAt={n.createdAt}
                  href={n.actionUrl || (n.refType && n.refId ? `/${n.refType}/${n.refId}` : "/notifications")}
                  testId={`notif-${n.id}`}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ───────────────────────────── 4. متابعاتي ───────────────────────────── */}
        <TabsContent value="followups" className="mt-4">
          {/* Scope filter: شخصي / فريقي / إدارتي. The mine view is free
              (already in /my-space response); team + department fire
              lazy queries gated on the scope chosen. */}
          <div className="flex gap-2 mb-4" data-testid="followups-scope-filter">
            {([
              { k: "mine", label: "طلباتي", n: counts.myRequests },
              { k: "team", label: "طلبات فريقي", n: counts.teamRequests },
              { k: "department", label: "طلبات إدارتي", n: counts.deptRequests },
            ] as const).map((opt) => (
              <Button
                key={opt.k}
                variant={followupScope === opt.k ? "default" : "outline"}
                size="sm"
                onClick={() => setFollowupScope(opt.k as FollowupScope)}
                data-testid={`followups-scope-${opt.k}`}
              >
                {opt.label}{opt.n > 0 ? ` (${opt.n})` : ""}
              </Button>
            ))}
          </div>

          {followupScope === "mine" && (
            myRequests.length === 0
              ? <EmptyState text="لا توجد طلبات نشطة لك." />
              : <div className="space-y-2">
                  {myRequests.map((r) => (
                    <ItemCard
                      key={`req:${r.type}:${r.id}`}
                      icon={ClipboardList}
                      badgeText={APPROVAL_TYPE_LABEL[r.type] || r.type}
                      badgeClass="bg-surface-subtle text-muted-foreground"
                      title={r.title}
                      meta={r.status}
                      createdAt={r.createdAt}
                      href={approvalDeepLink(r as PendingApproval)}
                      testId={`my-req-${r.id}`}
                    />
                  ))}
                </div>
          )}
          {followupScope === "team" && (
            teamLeaves.length === 0
              ? <EmptyState text="لا توجد طلبات نشطة في فريقك (الفرع)." />
              : <div className="space-y-2">
                  {teamLeaves.map((r) => (
                    <ItemCard
                      key={`team-leave:${r.id}`}
                      icon={ClipboardList}
                      badgeText="إجازة"
                      badgeClass="bg-surface-subtle text-muted-foreground"
                      title={`${r.leaveType || "إجازة"} — ${r.employeeName ?? "موظف"}`}
                      meta={r.status}
                      createdAt={r.createdAt}
                      href={`/hr/leaves/${r.id}`}
                      testId={`team-leave-${r.id}`}
                    />
                  ))}
                </div>
          )}
          {followupScope === "department" && (
            deptLeaves.length === 0
              ? <EmptyState text="لا توجد طلبات نشطة في إدارتك." />
              : <div className="space-y-2">
                  {deptLeaves.map((r) => (
                    <ItemCard
                      key={`dept-leave:${r.id}`}
                      icon={ClipboardList}
                      badgeText="إجازة"
                      badgeClass="bg-surface-subtle text-muted-foreground"
                      title={`${r.leaveType || "إجازة"} — ${r.employeeName ?? "موظف"}`}
                      meta={r.status}
                      createdAt={r.createdAt}
                      href={`/hr/leaves/${r.id}`}
                      testId={`dept-leave-${r.id}`}
                    />
                  ))}
                </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Deep-links — kept so power users can dive into the full pages. */}
      <Card className="mt-6">
        <CardContent className="p-3 flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground">الصفحات الأصلية:</span>
          <Link href="/hr/approval-inbox"><span className="text-primary hover:underline">طلبات اعتماد HR →</span></Link>
          <span className="text-muted-foreground">·</span>
          <Link href="/action-center"><span className="text-primary hover:underline">مركز القرارات →</span></Link>
          <span className="text-muted-foreground">·</span>
          <Link href="/tasks"><span className="text-primary hover:underline">كل المهام →</span></Link>
          <span className="text-muted-foreground">·</span>
          <Link href="/notifications"><span className="text-primary hover:underline">كل الإشعارات →</span></Link>
          <span className="text-muted-foreground">·</span>
          <Link href="/inbox"><span className="text-primary hover:underline">صندوق التواصل →</span></Link>
        </CardContent>
      </Card>

      {/* Tiny footer counter that proves the page consolidates real data. */}
      <p className="text-xs text-muted-foreground mt-3 text-center" data-testid="work-inbox-total">
        إجمالي ما ينتظر إجراءاتك: <span className="font-bold text-foreground">{total}</span> (موافقات {counts.actions} + مهام {counts.tasksTotal} + إشعارات {counts.notifs})
      </p>
    </PageShell>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────
function notifIcon(type: string) {
  if (type.includes("violation")) return AlertTriangle;
  if (type.includes("expir")) return FileWarning;
  if (type.includes("evaluation") || type.includes("performance")) return ClipboardCheck;
  return Bell;
}

function notifLabel(type: string): string {
  if (type === "attendance_violation" || type === "auto_violation") return "مخالفة حضور";
  if (type === "performance_evaluation" || type === "evaluation_created") return "تقييم";
  if (type === "contract_expiry" || type === "contract_expiring") return "انتهاء عقد";
  if (type === "iqama_expiry" || type === "iqama_expiring") return "انتهاء إقامة";
  if (type === "passport_expiry" || type === "passport_expiring") return "انتهاء جواز";
  if (type === "visa_expiry") return "انتهاء تأشيرة";
  if (type === "loan_overdue") return "سلفة متأخرة";
  if (type === "leave_overdue") return "إجازة معلَّقة";
  if (type === "task_overdue") return "مهمة متأخرة";
  return "إشعار";
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
        {text}
      </CardContent>
    </Card>
  );
}

interface ItemCardProps {
  icon: typeof ClipboardCheck;
  badgeText: string;
  badgeClass: string;
  title: string;
  meta?: string;
  createdAt: string;
  href: string;
  testId?: string;
}
function ItemCard({ icon: Icon, badgeText, badgeClass, title, meta, createdAt, href, testId }: ItemCardProps) {
  return (
    <Card className="hover:bg-surface-subtle/50 transition-colors" data-testid={testId}>
      <CardContent className="p-3 flex items-start gap-3">
        <div className="mt-0.5">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className={badgeClass}>{badgeText}</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDateAr(createdAt)}
            </span>
          </div>
          <p className="text-sm font-medium truncate">{title}</p>
          {meta && <p className="text-xs text-muted-foreground truncate">{meta}</p>}
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0"><Link href={href}>
            <ArrowUpRight className="h-4 w-4" />
          </Link></Button>
      </CardContent>
    </Card>
  );
}

interface TaskBucketProps {
  title: string;
  tone: "error" | "warning" | "info" | "muted";
  tasks: Task[];
  emptyMsg: string;
}
function TaskBucket({ title, tone, tasks, emptyMsg }: TaskBucketProps) {
  if (tasks.length === 0) {
    return (
      <div data-testid={`task-bucket-${tone}`}>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
          {title} <Badge variant="outline" className="text-xs">0</Badge>
        </h3>
        <p className="text-xs text-muted-foreground italic">{emptyMsg}</p>
      </div>
    );
  }
  const toneClass = tone === "error" ? "bg-status-error-surface text-status-error-foreground"
                  : tone === "warning" ? "bg-amber-50 text-amber-700"
                  : tone === "info" ? "bg-status-info-surface text-status-info-foreground"
                  : "bg-surface-subtle text-muted-foreground";
  return (
    <div data-testid={`task-bucket-${tone}`}>
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        {title} <Badge variant="outline" className={toneClass}>{tasks.length}</Badge>
      </h3>
      <div className="space-y-2">
        {tasks.map((t) => (
          <ItemCard
            key={`task:${t.id}`}
            icon={CheckSquare}
            badgeText="مهمة"
            badgeClass={toneClass}
            title={t.title}
            meta={t.clientName || (t.dueDate ? `الاستحقاق ${formatDateAr(t.dueDate)}` : t.scheduledDate ? `مجدولة ${formatDateAr(t.scheduledDate)}` : undefined)}
            createdAt={t.createdAt || t.scheduledDate || t.dueDate || new Date().toISOString()}
            href={`/tasks/${t.id}`}
            testId={`task-${t.id}`}
          />
        ))}
      </div>
    </div>
  );
}
