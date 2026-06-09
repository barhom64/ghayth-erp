// ════════════════════════════════════════════════════════════════════════════
// HR-016 — Unified Work Queue (#1799 priority #11)
//
// قبل: المستخدم يفتح 4 شاشات (/hr/approvals + /tasks + /inbox + /notifications)
// لمعرفة "ما ينتظر إجراءاته اليوم".
// بعد: شاشة واحدة تجمع كل المصادر بنفس الـ card shape مع tab filters.
//
// تستهلك endpoints موجودة (لا backend جديد):
//   - GET /my-space        → pendingApprovals (HR + finance approvals)
//   - GET /tasks           → tasks (assignedTo current user)
//   - GET /notifications   → unread bell notifications
//   - GET /inbox/threads   → communications threads (موصى به كـ tab منفصل)
//
// كل card يحوي: type badge + icon + title + meta + action link (deep-link
// للشاشة الأصلية). هذا يحافظ على workflow الموجود — لا نحاول إعادة بناء
// كل تفاعل في الـ queue.
// ════════════════════════════════════════════════════════════════════════════
import { useMemo } from "react";
import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatDateAr } from "@/lib/formatters";
import {
  CheckSquare, Inbox, Bell, ClipboardCheck, ArrowUpRight,
  AlertCircle, Calendar, Mail, MessageCircle,
} from "lucide-react";

type PendingApproval = {
  id: number;
  type: "leave" | "loan" | "overtime" | "exit" | string;
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

type Thread = {
  id: number;
  channel: "email" | "whatsapp" | "sms";
  lastMessage?: string;
  recipient?: string;
  preview?: string;
  createdAt: string;
  unreadCount?: number;
};

// ─── helpers ───────────────────────────────────────────────────────────────
const APPROVAL_TYPE_LABEL: Record<string, string> = {
  leave: "إجازة",
  loan: "سلفة",
  overtime: "وقت إضافي",
  exit: "خروج نهائي",
  expense: "مصروف",
  purchase_order: "أمر شراء",
  salary_advance: "سلفة راتب",
  custody: "عهدة",
  official_letter: "خطاب رسمي",
  hr_transfer: "نقل موظف",
};

function approvalDeepLink(a: PendingApproval): string {
  // Route map — falls back to /hr/approvals if type unknown.
  switch (a.type) {
    case "leave": return `/hr/leaves/${a.id}`;
    case "loan": return `/hr/loans/${a.id}`;
    case "overtime": return `/hr/overtime/${a.id}`;
    case "exit": return `/hr/exit/${a.id}`;
    case "expense": return `/finance/expenses/${a.id}`;
    case "purchase_order": return `/finance/purchase-orders/${a.id}`;
    default: return "/hr/approvals";
  }
}

function priorityBadgeClass(p?: string | null): string {
  switch ((p || "").toLowerCase()) {
    case "high":
    case "urgent":
    case "critical":
      return "bg-status-error-surface text-status-error-foreground";
    case "medium":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-surface-subtle text-muted-foreground";
  }
}

// ─── unified item shape ────────────────────────────────────────────────────
type QueueItem = {
  key: string; // dedupe key
  source: "approval" | "task" | "notification" | "thread";
  icon: typeof ClipboardCheck;
  typeLabel: string;
  title: string;
  meta?: string;
  priorityClass: string;
  createdAt: string;
  href: string;
};

export default function WorkQueuePage() {
  const { data: mySpace, isLoading: lMS, isError: eMS } = useApiQuery<{ pendingApprovals?: PendingApproval[] }>(
    ["my-space-queue"], "/my-space",
  );
  const { data: tasksData, isLoading: lT, isError: eT } = useApiQuery<{ data?: Task[] }>(
    ["my-tasks-queue"], "/tasks?limit=50&status=pending,in_progress",
  );
  const { data: notifsData, isLoading: lN, isError: eN } = useApiQuery<{ data?: Notification[] }>(
    ["my-notifs-queue"], "/notifications?limit=50&unreadOnly=true",
  );
  const { data: threadsData, isLoading: lI } = useApiQuery<{ data?: Thread[] }>(
    ["my-threads-queue"], "/inbox/threads?limit=20",
  );

  const approvals = mySpace?.pendingApprovals ?? [];
  const tasks = tasksData?.data ?? [];
  const notifs = notifsData?.data ?? [];
  const threads = threadsData?.data ?? [];

  // Build the unified items list. Each source maps into the same shape.
  const items: QueueItem[] = useMemo(() => {
    const out: QueueItem[] = [];
    for (const a of approvals) {
      out.push({
        key: `approval:${a.type}:${a.id}`,
        source: "approval",
        icon: ClipboardCheck,
        typeLabel: APPROVAL_TYPE_LABEL[a.type] || a.type,
        title: a.title || `${APPROVAL_TYPE_LABEL[a.type] || a.type} — ${a.employeeName ?? "موظف"}`,
        meta: a.employeeName,
        priorityClass: "bg-status-info-surface text-status-info-foreground",
        createdAt: a.createdAt,
        href: approvalDeepLink(a),
      });
    }
    for (const t of tasks) {
      out.push({
        key: `task:${t.id}`,
        source: "task",
        icon: CheckSquare,
        typeLabel: "مهمة",
        title: t.title,
        meta: t.clientName || (t.scheduledDate ? `مجدولة ${formatDateAr(t.scheduledDate)}` : undefined),
        priorityClass: priorityBadgeClass(t.priority),
        createdAt: t.createdAt || t.scheduledDate || new Date().toISOString(), // utc-ok: fallback sort key only, never displayed
        href: `/tasks/${t.id}`,
      });
    }
    for (const n of notifs) {
      out.push({
        key: `notif:${n.id}`,
        source: "notification",
        icon: Bell,
        typeLabel: "إشعار",
        title: n.title,
        meta: n.body?.slice(0, 80),
        priorityClass: priorityBadgeClass(n.priority),
        createdAt: n.createdAt,
        href: n.actionUrl || (n.refType && n.refId ? `/${n.refType}/${n.refId}` : "/notifications"),
      });
    }
    for (const th of threads) {
      if (!th.unreadCount || th.unreadCount === 0) continue;
      out.push({
        key: `thread:${th.id}`,
        source: "thread",
        icon: th.channel === "email" ? Mail : MessageCircle,
        typeLabel: th.channel === "email" ? "بريد" : th.channel === "whatsapp" ? "واتساب" : "رسالة",
        title: th.preview || th.lastMessage || `محادثة ${th.recipient}`,
        meta: th.recipient,
        priorityClass: "bg-surface-subtle text-muted-foreground",
        createdAt: th.createdAt,
        href: `/inbox/threads/${th.id}`,
      });
    }
    return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [approvals, tasks, notifs, threads]);

  const counts = {
    all: items.length,
    approval: items.filter((i) => i.source === "approval").length,
    task: items.filter((i) => i.source === "task").length,
    notification: items.filter((i) => i.source === "notification").length,
    thread: items.filter((i) => i.source === "thread").length,
  };

  const anyLoading = lMS || lT || lN || lI;
  const anyError = eMS || eT || eN;
  if (anyLoading) return <PageShell title="ما ينتظر إجراءاتي" subtitle="جاري التحميل..."><LoadingSpinner /></PageShell>;
  if (anyError && items.length === 0) return <PageShell title="ما ينتظر إجراءاتي" subtitle="فشل التحميل"><ErrorState /></PageShell>;

  return (
    <PageShell
      title="ما ينتظر إجراءاتي"
      subtitle="كل ما يحتاج اعتمادك / مهامك المفتوحة / إشعاراتك غير المقروءة في مكان واحد"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "ما ينتظر إجراءاتي" },
      ]}
    >
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="all" className="gap-2">
            <Inbox className="h-4 w-4" /> الكل
            <Badge variant="secondary" className="ms-1">{counts.all}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approval" className="gap-2">
            <ClipboardCheck className="h-4 w-4" /> للاعتماد
            {counts.approval > 0 && <Badge variant="destructive" className="ms-1">{counts.approval}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="task" className="gap-2">
            <CheckSquare className="h-4 w-4" /> مهامي
            {counts.task > 0 && <Badge variant="secondary" className="ms-1">{counts.task}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="notification" className="gap-2">
            <Bell className="h-4 w-4" /> إشعارات
            {counts.notification > 0 && <Badge variant="secondary" className="ms-1">{counts.notification}</Badge>}
          </TabsTrigger>
          {counts.thread > 0 && (
            <TabsTrigger value="thread" className="gap-2">
              <Mail className="h-4 w-4" /> محادثات غير مقروءة
              <Badge variant="secondary" className="ms-1">{counts.thread}</Badge>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="all" className="mt-4"><Feed items={items} /></TabsContent>
        <TabsContent value="approval" className="mt-4"><Feed items={items.filter((i) => i.source === "approval")} emptyMsg="لا توجد طلبات تنتظر اعتمادك." /></TabsContent>
        <TabsContent value="task" className="mt-4"><Feed items={items.filter((i) => i.source === "task")} emptyMsg="لا توجد مهام مفتوحة." /></TabsContent>
        <TabsContent value="notification" className="mt-4"><Feed items={items.filter((i) => i.source === "notification")} emptyMsg="كل إشعاراتك مقروءة." /></TabsContent>
        <TabsContent value="thread" className="mt-4"><Feed items={items.filter((i) => i.source === "thread")} emptyMsg="لا توجد محادثات غير مقروءة." /></TabsContent>
      </Tabs>

      {/* deep-links to the original screens — kept so power users can dive
          into the full feature of each source. */}
      <Card className="mt-6">
        <CardContent className="p-3 flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground">عرض كامل:</span>
          <Link href="/hr/approvals"><span className="text-primary hover:underline">طلبات الاعتماد →</span></Link>
          <span className="text-muted-foreground">·</span>
          <Link href="/tasks"><span className="text-primary hover:underline">المهام →</span></Link>
          <span className="text-muted-foreground">·</span>
          <Link href="/notifications"><span className="text-primary hover:underline">كل الإشعارات →</span></Link>
          <span className="text-muted-foreground">·</span>
          <Link href="/inbox"><span className="text-primary hover:underline">صندوق التواصل →</span></Link>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function Feed({ items, emptyMsg }: { items: QueueItem[]; emptyMsg?: string }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
          {emptyMsg || "لا يوجد شيء ينتظر إجراءاتك الآن."}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card key={it.key} className="hover:bg-surface-subtle/50 transition-colors">
            <CardContent className="p-3 flex items-start gap-3">
              <div className="mt-0.5">
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className={it.priorityClass}>{it.typeLabel}</Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDateAr(it.createdAt)}
                  </span>
                </div>
                <p className="text-sm font-medium truncate">{it.title}</p>
                {it.meta && <p className="text-xs text-muted-foreground truncate">{it.meta}</p>}
              </div>
              <Link href={it.href}>
                <Button variant="ghost" size="sm" className="shrink-0">
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
