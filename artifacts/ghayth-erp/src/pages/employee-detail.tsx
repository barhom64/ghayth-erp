import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { useApiQuery, useApiMutation, asList, apiFetch, ApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { EntityPnlButton } from "@/components/shared/entity-pnl-button";
import { DetailPageLayout } from "@workspace/entity-kit";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import {
  PageStatusBadge,
  DataTable,
} from "@workspace/ui-core";
import {
  User, Phone, Mail, Briefcase, Calendar, Building, CreditCard,
  ListTodo, Clock, BookOpen, DollarSign, AlertTriangle, Printer,
  FileText, TrendingUp, TrendingDown, Minus, Award, Activity, CheckCircle2,
  XCircle, AlertCircle, ChevronDown, ChevronUp, Pencil, Check, X,
  KeyRound, ShieldCheck, Lock, Star, FileSignature, Package, Sparkles, Flame,
  // PR-6 (#2077) — icons for the three new tabs: documents (FileText
  // — already imported), evaluation (Award), activity (History), and
  // training (GraduationCap, renamed from Award which now belongs to
  // evaluation).
  History, GraduationCap, ArrowUpRight,
} from "lucide-react";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { useRoute, Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateAr, formatTimeAr, formatCurrency } from "@/lib/formatters";
import { VISA_TYPES, CONTRACT_TYPES, IQAMA_STATUS, hrLabel } from "@/lib/hr-type-maps";
import { PrintPreviewModal } from "@workspace/report-kit";
import { useBranchLetterhead } from "@/hooks/use-branch-letterhead";
import { useAuth } from "@/lib/auth";
import { EmployeeDisciplineSummary } from "@/components/shared/employee-discipline-summary";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";


type OperationalStatus = {
  status: string;
  label: string;
  color: string;
  reason: string;
};

function OperationalStatusBar({ employeeId }: { employeeId: string }) {
  const [opStatus, setOpStatus] = useState<OperationalStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    apiFetch<OperationalStatus>(`/hr/employee-status/${employeeId}`)
      .then(setOpStatus)
      .catch(() => setOpStatus({ status: "working", label: "على رأس العمل", color: "bg-status-success-surface text-status-success-foreground", reason: "" }))
      .finally(() => setLoading(false));
  }, [employeeId]);

  if (loading) return <Skeleton className="h-8 w-48" />;
  if (!opStatus) return null;

  const statusIcons: Record<string, any> = {
    working: CheckCircle2,
    on_leave: Calendar,
    late: AlertCircle,
    absent: XCircle,
    suspended: AlertTriangle,
    under_action: AlertTriangle,
    terminated: XCircle,
  };
  const Icon = statusIcons[opStatus.status] || CheckCircle2;

  return (
    <div className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border", opStatus.color)}>
      <Icon className="h-4 w-4" />
      <span>{opStatus.label}</span>
      {opStatus.reason && <span className="text-xs opacity-70">— {opStatus.reason}</span>}
    </div>
  );
}

// PR-8 (#2077) — Lifecycle tab content.
// Renders the timeline + the «إجراء انتقال جديد» panel that wraps
// POST /employees/:id/lifecycle/transitions. The panel is intentionally
// minimal: pick a next state (the engine returns the legal options) +
// reason + the four dates. The backend runs the guards; this UI just
// shows the resulting error inline so HR knows which guard blocked.
function LifecycleTabContent({ employeeId, status, history, onTransitioned }: {
  employeeId: number;
  status: any;
  history: any[];
  onTransitioned: () => void;
}) {
  const { toast } = useToast();
  const nextOpts: Array<{ state: string; label: string }> = status?.nextTransitions ?? [];
  const [target, setTarget] = useState<string>(nextOpts[0]?.state ?? "");
  const [reason, setReason] = useState("");
  const [decisionDate, setDecisionDate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Map target state → event type. The engine uses event types under
  // the hood; this mapping mirrors EVENT_TO_STATE_AFTER server-side.
  const stateToEvent: Record<string, string> = {
    offer_extended: "offer_extended",
    onboarding: "offer_accepted",
    active: "onboarded",            // when current=onboarding
    probation: "probation_started",
    confirmed: "probation_passed",
    suspended: "suspended",
    resigned: "resigned",
    terminated: "terminated",
    clearance_pending: "clearance_started",
    clearance_complete: "clearance_completed",
  };
  const reactivation = status?.currentState === "terminated" && target === "active";
  const eventType = reactivation ? "reactivated" : (stateToEvent[target] ?? "");

  const submit = async () => {
    if (!eventType) { toast({ title: "اختر حالة هدف", variant: "destructive" }); return; }
    if (!reason.trim()) { toast({ title: "السبب مطلوب", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      await apiFetch(`/employees/${employeeId}/lifecycle/transitions`, {
        method: "POST",
        body: JSON.stringify({
          eventType,
          reason: reason.trim(),
          decisionDate: decisionDate || undefined,
          effectiveDate: effectiveDate || undefined,
          documentDate: documentDate || undefined,
          documentRef: documentRef || undefined,
          overrideReason: overrideReason || undefined,
        }),
      });
      toast({ title: "تم تسجيل الانتقال" });
      setReason(""); setDecisionDate(""); setEffectiveDate(""); setDocumentDate("");
      setDocumentRef(""); setOverrideReason("");
      onTransitioned();
    } catch (err: any) {
      toast({ title: err?.message || "فشل الانتقال", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5" data-testid="lifecycle-content">
      {/* Next-transition launcher: only HR-write users see the panel
          via the GuardedButton on submit. */}
      {nextOpts.length > 0 ? (
        <div className="border rounded-lg p-4 space-y-3 bg-surface-subtle/30" data-testid="lifecycle-transition-panel">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4" />
            إجراء انتقال جديد
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">الحالة المستهدفة</Label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full mt-1 border rounded px-2 py-1.5 text-sm"
                data-testid="lifecycle-target-select"
              >
                {nextOpts.map((o) => (
                  <option key={o.state} value={o.state}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">سبب الانتقال *</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: قرار اعتماد التثبيت" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">تاريخ القرار</Label>
              <Input type="date" value={decisionDate} onChange={(e) => setDecisionDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">تاريخ التنفيذ</Label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">تاريخ المستند</Label>
              <Input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">مرجع المستند</Label>
              <Input value={documentRef} onChange={(e) => setDocumentRef(e.target.value)} placeholder="مثال: HR-2026-045" className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">سبب التجاوز (إذا كانت الحوارس ستحجب)</Label>
              <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="اتركه فارغًا إن لم يكن لازمًا" className="mt-1" />
              <p className="text-[11px] text-muted-foreground mt-1">يُسجَّل التجاوز في الـAudit ويظهر في السجل أدناه — استخدمه فقط للحالات الموثَّقة.</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={submitting || !reason.trim()} data-testid="lifecycle-submit-btn">
              {submitting ? "جاري التنفيذ..." : "تسجيل الانتقال"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground border rounded p-3 bg-status-success-surface/30">
          <CheckCircle2 className="h-4 w-4 inline-block ms-1" />
          لا يوجد انتقال متاح من الحالة الحالية. (انتهت دورة الحياة أو الانتقال يتم خارج هذا التبويب.)
        </div>
      )}

      {/* Timeline. Each event card shows the four dates + the actor +
          the override reason when present (the override flag is the
          most-watched audit signal). */}
      <div className="border-t pt-4">
        <p className="text-sm font-semibold mb-3">السجل الزمني ({history.length})</p>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-4">لا يوجد سجل انتقالات لهذا الموظف بعد.</p>
        ) : (
          <div className="space-y-2">
            {history.map((e: any) => (
              <div key={e.id} className="border rounded p-3 text-sm" data-testid={`lifecycle-event-${e.id}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs">{e.eventLabel || e.eventType}</Badge>
                  {e.stateBeforeLabel && e.stateAfterLabel && (
                    <span className="text-xs text-muted-foreground">
                      {e.stateBeforeLabel} ← {e.stateAfterLabel}
                    </span>
                  )}
                  {e.overrideReason && (
                    <Badge className="bg-status-warning-surface text-status-warning-foreground border-0 text-xs ms-auto" data-testid="lifecycle-override-badge">
                      تجاوز موثَّق
                    </Badge>
                  )}
                </div>
                {e.reason && <p className="text-sm font-medium mb-2">{e.reason}</p>}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <DateRow label="تاريخ القرار" value={e.decisionDate} />
                  <DateRow label="تاريخ التنفيذ" value={e.effectiveDate} />
                  <DateRow label="تاريخ المستند" value={e.documentDate} />
                  <DateRow label="مرجع المستند" value={e.documentRef} mono />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground border-t pt-2">
                  <span>المنفِّذ: <strong>{e.actorName || `#${e.actorUserId}`}</strong></span>
                  <span>{e.activeRoleKey ? `بدور: ${e.activeRoleKey}` : ""}</span>
                  <span>{formatDateAr(e.createdAt)}</span>
                </div>
                {e.overrideReason && (
                  <p className="text-xs bg-amber-50 border border-amber-200 rounded p-2 mt-2">
                    <strong>سبب التجاوز:</strong> {e.overrideReason}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DateRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px]">{label}</p>
      <p className={cn("text-xs font-medium", mono && "font-mono")}>{value ? formatDateAr(value) : "—"}</p>
    </div>
  );
}

function QuickSummaryCard({ employee, serviceDays }: { employee: any; serviceDays: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
      <div className="bg-status-info-surface rounded-xl p-4 text-center">
        <p className="text-2xl font-bold text-status-info-foreground">{serviceDays}</p>
        <p className="text-xs text-muted-foreground mt-1">أيام الخدمة</p>
      </div>
      <div className="bg-status-success-surface rounded-xl p-4 text-center">
        <p className="text-2xl font-bold text-status-success-foreground">{formatCurrency(Number(employee.salary) || 0)}</p>
        <p className="text-xs text-muted-foreground mt-1">الراتب الأساسي</p>
      </div>
      <div className="bg-purple-50 rounded-xl p-4 text-center">
        <p className="text-2xl font-bold text-purple-700">{employee.departmentName || "—"}</p>
        <p className="text-xs text-muted-foreground mt-1">القسم</p>
      </div>
      <div className="bg-orange-50 rounded-xl p-4 text-center">
        <p className="text-2xl font-bold text-orange-700">{employee.jobTitle || "—"}</p>
        <p className="text-xs text-muted-foreground mt-1">المسمى الوظيفي</p>
      </div>
    </div>
  );
}

function AttendanceSummary({ attendance }: { attendance: any[] }) {
  const presentDays = attendance.filter(a => a.status === "present" || a.status === "present_off_day" || a.status === "present_out_of_range").length;
  const lateDays = attendance.filter(a => a.lateMinutes > 0).length;
  const absentDays = attendance.filter(a => a.status === "absent").length;
  const totalLateMin = attendance.reduce((s, a) => s + (a.lateMinutes || 0), 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <div className="text-center p-3 bg-status-success-surface rounded-lg">
        <p className="text-xl font-bold text-status-success-foreground">{presentDays}</p>
        <p className="text-xs text-muted-foreground">أيام حضور</p>
      </div>
      <div className="text-center p-3 bg-status-warning-surface rounded-lg">
        <p className="text-xl font-bold text-status-warning-foreground">{lateDays}</p>
        <p className="text-xs text-muted-foreground">أيام تأخر</p>
      </div>
      <div className="text-center p-3 bg-status-error-surface rounded-lg">
        <p className="text-xl font-bold text-status-error-foreground">{absentDays}</p>
        <p className="text-xs text-muted-foreground">أيام غياب</p>
      </div>
      <div className="text-center p-3 bg-orange-50 rounded-lg">
        <p className="text-xl font-bold text-orange-600">{totalLateMin}</p>
        <p className="text-xs text-muted-foreground">دقائق تأخر</p>
      </div>
    </div>
  );
}

// FinanceLinkageCard — surfaces the subsidiary custody account,
// outstanding custody balance, linked vehicle (driver case), and the
// internal vs personal email split. Drives the "is this employee
// properly wired into finance / fleet?" check at a glance instead of
// the operator hunting across 4 modules.
function FinanceLinkageCard({ employeeId }: { employeeId: string }) {
  const { data } = useApiQuery<any>(["employee-finance-summary", employeeId], `/employees/${employeeId}/finance-summary`, !!employeeId);
  if (!data) return null;
  const custody = data.custody ?? {};
  const vehicle = data.vehicle ?? null;
  const emails = data.emails ?? {};
  const pbxExtension = data.pbxExtension ?? null;
  const userAcct = data.userAccount ?? null;
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground font-medium">الربط المالي والوظيفي</p>
          <Badge variant="outline" className="text-[10px]">batch HR</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">حساب العهدة الفرعي</p>
            {custody.subsidiaryAccountCode ? (
              <>
                <p className="font-mono text-sm font-bold" data-testid="finance-link-custody-code">{custody.subsidiaryAccountCode}</p>
                <p className="text-xs text-status-neutral-foreground">{custody.subsidiaryAccountName}</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">لا يوجد — أنشئ حساب فرعي للموظف من شاشة المحاسبة</p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">رصيد العهدة المفتوحة</p>
            <p className="font-bold text-lg" data-testid="finance-link-custody-balance">
              {Number(custody.outstandingAmount || 0).toLocaleString("ar-SA")} ر.س
            </p>
            <p className="text-xs text-muted-foreground">{Number(custody.openCount || 0)} عهدة مفتوحة</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">المركبة المرتبطة (سائق)</p>
            {vehicle ? (
              <p className="font-mono text-sm font-bold" data-testid="finance-link-vehicle">
                {vehicle.plateNumber}{vehicle.brand ? ` — ${vehicle.brand}` : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">لا توجد مركبة مرتبطة</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t">
          <div>
            <p className="text-xs text-muted-foreground">بريد الدخول</p>
            <p className="font-mono text-xs" dir="ltr" data-testid="finance-link-internal-email">{emails.loginEmail || "—"}</p>
            {userAcct && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {userAcct.isActive ? "حساب نشط" : "حساب غير نشط"}
                {userAcct.lastLoginAt ? ` · آخر دخول ${new Date(userAcct.lastLoginAt).toLocaleDateString("ar-SA")}` : " · لم يدخل بعد"}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">البريد الشخصي</p>
            <p className="font-mono text-xs" dir="ltr" data-testid="finance-link-personal-email">{emails.personal || "—"}</p>
            <p className="text-[10px] text-muted-foreground mt-1">للتواصل فقط — لا يُستخدم لتسجيل الدخول</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">تحويلة السنترال</p>
            {pbxExtension ? (
              <ClickToCallButton extension={pbxExtension.extension} employeeId={Number(employeeId)} />
            ) : (
              <p className="text-xs text-muted-foreground">لا توجد تحويلة مرتبطة</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ClickToCallButton — POSTs to /communications/click-to-call. When a
// PBX integration is wired (config.clickToCallUrl) the server originates
// the call directly; when it isn't, the server returns mode='tel' with
// a tel: URI the browser opens (system dialer). Either way the attempt
// is logged so an operator can audit who tried to call whom.
function ClickToCallButton({ extension, employeeId }: { extension: string; employeeId: number }) {
  const { toast } = useToast();
  const callMut = useApiMutation<
    { data: { mode: "pbx" | "tel"; telUri: string; detail: string; callId: string } },
    { target: string; relatedType?: string; relatedId?: number }
  >("/communications/click-to-call", "POST", undefined, { silent: true });

  const onClick = async () => {
    try {
      const r = await callMut.mutateAsync({ target: extension, relatedType: "employees", relatedId: employeeId });
      if (r.data.mode === "tel") {
        // Server didn't reach a PBX — fall back to the system dialer.
        window.location.href = r.data.telUri;
        toast({ title: "تم فتح برنامج الاتصال", description: "لم نتمكّن من توجيه السنترال — اتصل من جوالك" });
      } else {
        toast({ title: "تم بدء المكالمة", description: `السنترال يتصل بـ ${extension}` });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "تعذّر بدء المكالمة", description: e?.message ?? String(e) });
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={callMut.isPending}
      data-testid="finance-link-pbx-extension"
      className="font-mono text-sm font-bold text-status-info-foreground hover:underline disabled:opacity-50 inline-flex items-center gap-1"
      dir="ltr"
    >
      <Phone className="h-3.5 w-3.5" />
      {extension}
    </button>
  );
}

function LeaveBalanceSummary({ employeeId }: { employeeId: string }) {
  const { data } = useApiQuery<any>(["leave-balance-emp", employeeId], `/hr/leave-balance?employeeId=${employeeId}`, !!employeeId);
  const balances = data?.data || [];

  if (balances.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
      {balances.slice(0, 6).map((b: any) => (
        <div key={b.leaveTypeId} className="border rounded-lg p-3 bg-surface-subtle">
          <p className="text-xs text-muted-foreground">{b.name || b.leaveTypeName}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg font-bold text-status-success-foreground">{b.remaining ?? 0}</span>
            <span className="text-xs text-muted-foreground">/ {b.maxDays || b.entitled || 0} يوم</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
            <div
              className="bg-status-success-surface0 h-1.5 rounded-full"
              style={{ width: `${Math.min(100, ((b.remaining ?? 0) / (b.maxDays || b.entitled || 1)) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HR-014 — Performance / Signals widget for the overview tab.
// Reads `latestScore` (latest monthly row from employee_scores) and
// `activeSignals` (unacknowledged rows from employee_signals within the
// last 90 days). When `latestScore` is null and `activeSignals` is empty
// the widget surfaces an empty state explaining when the engines run
// (Mon 03:00 weekly + 1st of month 04:00) so HR doesn't think the page
// is broken on day-1 for a new hire.
// ════════════════════════════════════════════════════════════════════════════
// PR-4 (#2077) — props grow by one: `employeeId` so the widget can
// link to the dedicated score detail page (/hr/employees/:id/score)
// where the operator gets the full per-dimension rationale, raw
// counters, history, and the on-demand «إعادة الحساب» button.
function PerformanceWidget({ employeeId, latestScore, activeSignals }: {
  employeeId: number;
  latestScore: { compositeScore: number; trend: number; periodKey: string;
                 disciplineScore: number; activityScore: number;
                 productivityScore: number; qualityScore: number;
                 managerScore: number; developmentScore: number;
                 rationale?: Record<string, string>; computedAt: string } | null;
  activeSignals: Array<{ id: number; signalType: string; severity: string;
                         title: string; reasons: string[];
                         compositeScore?: number; createdAt: string; periodKey: string }>;
}) {
  if (!latestScore && activeSignals.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              الأداء والإشارات
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            لا يوجد سجل تقييم بعد. يُحسب التقييم تلقائيًا كل اثنين 03:00 (أسبوعي)
            وأول كل شهر 04:00 (شهري) — بعد تجميع بيانات حضور/مهام/تقييمات/تدريب كافية.
          </p>
        </CardContent>
      </Card>
    );
  }
  const score = latestScore?.compositeScore ?? 0;
  const scoreColor = score >= 85 ? "text-emerald-600" :
                     score >= 70 ? "text-status-info-foreground" :
                     score >= 50 ? "text-amber-600" : "text-status-error-foreground";
  const trendIcon = !latestScore || latestScore.trend === 0 ? Minus
                  : latestScore.trend > 0 ? TrendingUp : TrendingDown;
  const TrendIcon = trendIcon;
  const trendColor = !latestScore || latestScore.trend === 0 ? "text-muted-foreground"
                   : latestScore.trend > 0 ? "text-emerald-600" : "text-status-error-foreground";
  const sigCount = activeSignals.length;
  const critical = activeSignals.filter((s) => s.severity === "critical").length;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            الأداء والإشارات
            {latestScore && (
              <span className="text-xs text-muted-foreground font-mono">
                {latestScore.periodKey}
              </span>
            )}
            {/* PR-4 (#2077) — link to the dedicated score detail page
                where HR sees full rationale per dimension + raw counters
                + history + the on-demand recompute button. */}
            <Link href={`/hr/employees/${employeeId}/score`} asChild>
              <a className="text-xs text-status-info-foreground hover:underline ms-auto" data-testid="link-employee-score-detail">
                تفصيل كامل ←
              </a>
            </Link>
          </p>
          {sigCount > 0 && (
            <Badge variant={critical > 0 ? "destructive" : "outline"} className="gap-1">
              <Flame className="h-3 w-3" />
              {sigCount} إشار{sigCount === 1 ? "ة" : "ات"} نشطة
              {critical > 0 ? ` (${critical} حرج${critical === 1 ? "" : "ة"})` : ""}
            </Badge>
          )}
        </div>
        {latestScore && (
          <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
            <div className="flex flex-col items-center justify-center bg-surface-subtle rounded p-3">
              <div className="flex items-center gap-1">
                <span className={cn("text-4xl font-bold", scoreColor)}>
                  {Math.round(Number(score))}
                </span>
                <TrendIcon className={cn("h-5 w-5", trendColor)} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">من 100</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {[
                { k: "disciplineScore", l: "انضباط (20%)" },
                { k: "activityScore", l: "نشاط (15%)" },
                { k: "productivityScore", l: "إنتاجية (35%)" },
                { k: "qualityScore", l: "جودة (15%)" },
                { k: "managerScore", l: "تقييم المدير (10%)" },
                { k: "developmentScore", l: "تطوير ذاتي (5%)" },
              ].map((d) => {
                const v = Number((latestScore as any)[d.k] ?? 0);
                return (
                  <div key={d.k} className="flex justify-between bg-surface-subtle rounded px-2 py-1">
                    <span className="text-muted-foreground">{d.l}</span>
                    <span className="font-bold">{Math.round(v)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {activeSignals.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {activeSignals.slice(0, 3).map((sig) => {
              const sevColor = sig.severity === "critical" ? "bg-status-error-surface text-status-error-foreground"
                             : sig.severity === "high" ? "bg-amber-50 text-amber-700"
                             : sig.severity === "medium" ? "bg-status-info-surface text-status-info-foreground"
                             : "bg-surface-subtle text-muted-foreground";
              const typeLabel = sig.signalType === "risk" ? "تحذير"
                              : sig.signalType === "promotion" ? "مرشّح للترقية"
                              : sig.signalType === "burnout" ? "إرهاق محتمل"
                              : "إشارة";
              return (
                <div key={sig.id} className={cn("rounded p-2 text-xs", sevColor)}>
                  <div className="flex items-center gap-2 font-bold mb-0.5">
                    <span>{typeLabel}</span>
                    <span>·</span>
                    <span>{sig.title}</span>
                  </div>
                  {sig.reasons && sig.reasons.length > 0 && (
                    <ul className="text-[11px] opacity-80 list-disc list-inside">
                      {sig.reasons.slice(0, 2).map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                </div>
              );
            })}
            {activeSignals.length > 3 && (
              <p className="text-[11px] text-muted-foreground text-center">
                + {activeSignals.length - 3} إشارة أخرى
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ViolationTimeline({ violations }: { violations: any[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const escalationCount = violations.length;
  const escalationLevel = Math.min(escalationCount, 5);

  return (
    <div>
      {escalationCount > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-orange-50 border border-orange-200">
          <p className="text-sm font-medium text-orange-700 mb-2">مستوى التصعيد التأديبي</p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <div key={lvl} className="flex items-center gap-0">
                <div className={cn(
                  "w-4 h-4 rounded-full border-2",
                  lvl <= escalationLevel ? "border-orange-500 bg-orange-400" : "border-border bg-white"
                )} />
                {lvl < 5 && <div className={cn("w-6 h-0.5", lvl < escalationLevel ? "bg-orange-300" : "bg-gray-200")} />}
              </div>
            ))}
            <span className="text-xs text-muted-foreground ms-2">المستوى {escalationLevel}/5</span>
          </div>
          {escalationLevel >= 3 && (
            <p className="text-xs text-status-error-foreground mt-1 font-medium">تحذير: الموظف غير مؤهل للترقية حالياً بسبب المخالفات</p>
          )}
        </div>
      )}
      <div className="space-y-2">
        {violations.map((v: any) => (
          <div key={v.id} className="border rounded-lg overflow-hidden">
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-surface-subtle"
              onClick={() => setExpanded(expanded === v.id ? null : v.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{v.description}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[10px]">{violationTypeLabel(v.type)}</Badge>
                  <span className="text-xs text-muted-foreground">{v.period}</span>
                  {v.createdAt && <span className="text-xs text-muted-foreground">{formatDateAr(v.createdAt)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 ms-2">
                <SeverityBadge severity={v.severity} />
                {Number(v.deduction) > 0 && (
                  <span className="text-sm font-bold text-status-error-foreground">-{formatCurrency(Number(v.deduction))}</span>
                )}
                {expanded === v.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>
            {expanded === v.id && (
              <div className="px-3 pb-3 text-xs text-muted-foreground bg-surface-subtle border-t">
                <p>الشدة: {severityLabel(v.severity)} | النوع: {violationTypeLabel(v.type)} | الفترة: {v.period}</p>
                {v.deduction > 0 && <p className="text-status-error-foreground font-medium">الخصم: {formatCurrency(Number(v.deduction))}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// HR-001 / #1799 priority #1 — Employee 360 tabs.
// Two new tabs added: "الحساب والدخول" + "الأدوار والصلاحيات".
// These surface the user-account row and rbac_user_roles grants that
// were already loaded by the backend (see routes/employees.ts) so
// every HR officer can see at-a-glance: does this employee have a
// login? when did they last sign in? which roles do they hold?
// Roadmap (docs/HR_OPERATING_FOUNDATION_TASK.md §A.1) target is 14
// tabs; this batch adds 2/5 of the missing ones.
const TABS = [
  // HR-012 / #1799 priority #1 — Employee 360 final 3 tabs complete
  // the 14-tab target from the inventory.
  // PR-6 (#2077) — added the three missing tabs the deep audit
  // surfaced: documents (endpoint existed but the page never called
  // it), activity (audit timeline filtered by entityType=employees),
  // and evaluation (history view of the PR-4 scoring engine). The
  // tab order follows the «around the employee» mental model:
  // identity → documents → org → access → contract → operations
  // (attendance/leaves) → custody → financial → discipline →
  // history (activity + evaluation) → development.
  { key: "overview",    label: "نظرة شاملة",        icon: Activity },
  { key: "info",        label: "البيانات الشخصية",  icon: User },
  { key: "documents",   label: "الوثائق",           icon: FileText },        // PR-6 NEW
  { key: "titles",      label: "المسميات والمناصب", icon: Briefcase },
  { key: "account",     label: "الحساب والدخول",    icon: KeyRound },
  { key: "roles",       label: "الأدوار والصلاحيات", icon: ShieldCheck },
  { key: "contract",    label: "العقد",             icon: FileSignature },
  { key: "attendance",  label: "الحضور",            icon: Clock },
  { key: "leaves",      label: "الإجازات",          icon: Calendar },
  { key: "custodies",   label: "العهد والأصول",     icon: Package },
  { key: "payroll",     label: "الرواتب",           icon: DollarSign },
  { key: "violations",  label: "المخالفات",         icon: AlertTriangle },
  { key: "evaluation",  label: "التقييم",           icon: Award },           // PR-6 NEW
  { key: "tasks",       label: "المهام",            icon: ListTodo },
  { key: "trainings",   label: "التدريب",           icon: GraduationCap },
  { key: "activity",    label: "النشاط",            icon: History },         // PR-6 NEW
  { key: "lifecycle",   label: "دورة الحياة",       icon: Activity },        // PR-8 NEW
  { key: "finance",     label: "المالية",           icon: BookOpen },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// PR-6 (#2077) — Tab status: «مكتمل / ناقص / يحتاج إجراء / غير مصرح».
// The status drives both the badge color on the tab strip AND the empty
// state inside the tab so the operator never sees a blank list.
type TabStatus = "complete" | "missing" | "action_needed" | "forbidden";
const STATUS_LABEL: Record<TabStatus, string> = {
  complete:      "مكتمل",
  missing:       "ناقص",
  action_needed: "يحتاج إجراء",
  forbidden:     "غير مصرح",
};
const STATUS_TONE: Record<TabStatus, string> = {
  complete:      "bg-status-success-surface text-status-success-foreground",
  missing:       "bg-amber-50 text-amber-700",
  action_needed: "bg-status-error-surface text-status-error-foreground",
  forbidden:     "bg-surface-subtle text-muted-foreground",
};

export default function EmployeeDetail({ id: propId }: { id?: string }) {
  const [, params] = useRoute("/employees/:id");
  const [, navigate] = useLocation();
  const id = propId || params?.id || "";
  const { hideTabs: registryHideTabs } = useRegistryTabs("employee", id ?? "");
  const { data: employee, isLoading, isError, error, refetch } = useApiQuery<any>(["employee", id], `/employees/${id}`, !!id);

  // Per-employee intelligence rollups — KPIs (performance, attendance,
  // task completion) + daily schedule preview. Both lazy via `enabled`
  // so the queries only fire when an id is known.
  const { data: empKpisResp } = useApiQuery<any>(
    ["intelligence-employee-kpis", id],
    id ? `/intelligence/kpis/employee/${id}` : null,
    { enabled: !!id },
  );
  const empKpis = empKpisResp?.data ?? empKpisResp;
  const { data: empScheduleResp } = useApiQuery<any>(
    ["intelligence-employee-schedule", id],
    id ? `/intelligence/daily-schedule/employee/${id}` : null,
    { enabled: !!id },
  );
  const empSchedule: any[] = empScheduleResp?.data ?? empScheduleResp?.items ?? [];
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printHtml, setPrintHtml] = useState("");
  const [printTitle, setPrintTitle] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const branch = useBranchLetterhead(user?.branchId);
  const { data: templatesResp } = useApiQuery<any>(["doc-templates"], "/documents/templates");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  // PR-6 (#2077) — three new lazy queries for the three new tabs.
  // Each is gated on (activeTab match || id known) so we don't pay
  // for fetches the operator never opens.
  //
  // Documents: GET /employees/documents returns the company-wide list
  // (existing endpoint), we filter client-side on employeeId — keeping
  // the doctrine of «no new backend». Acceptable because employee
  // documents are typically <100 per company.
  const { data: docsResp } = useApiQuery<any>(
    ["employee-documents-list", String(id)],
    "/employees/documents",
    { enabled: !!id && activeTab === "documents" },
  );
  // Activity: GET /audit-logs/employees/:id. The endpoint is gated
  // server-side on admin.audit:view; if the operator doesn't have it
  // the request 403s and the tab renders the «غير مصرح» state instead
  // of crashing. The hook doesn't throw on 403, it sets isError.
  const { data: activityResp, isError: activityForbidden } = useApiQuery<any>(
    ["employee-activity-audit", String(id)],
    id ? `/audit-logs/employees/${id}` : null,
    { enabled: !!id && activeTab === "activity" },
  );
  // Evaluation: scoring history (PR-4). The route is gated on
  // hr.employees:list which the HR Manager has.
  const { data: scoringHistResp } = useApiQuery<any>(
    ["employee-scoring-history", String(id), "monthly"],
    id ? `/employees/${id}/scoring/history?scope=monthly&limit=12` : null,
    { enabled: !!id && activeTab === "evaluation" },
  );

  // PR-8 (#2077) — Lifecycle: status + history.
  // Status is light (current state + next allowed transitions) and
  // ALSO gates the lifecycle tab's status badge ("action_needed" when
  // a next transition exists). History is heavier; lazy.
  const { data: lifecycleStatusResp, refetch: refetchLifecycle } = useApiQuery<any>(
    ["employee-lifecycle-status", String(id)],
    id ? `/employees/${id}/lifecycle/status` : null,
    { enabled: !!id },
  );
  const { data: lifecycleHistResp } = useApiQuery<any>(
    ["employee-lifecycle-history", String(id)],
    id ? `/employees/${id}/lifecycle/history?limit=50` : null,
    { enabled: !!id && activeTab === "lifecycle" },
  );
  const [govEditing, setGovEditing] = useState(false);
  const [govForm, setGovForm] = useState<Record<string, string>>({});

  const govStartEdit = () => {
    setGovForm({
      borderNumber: employee?.borderNumber || "",
      visaNumber: employee?.visaNumber || "",
      visaType: employee?.visaType || "",
      visaExpiry: employee?.visaExpiry ? employee.visaExpiry.split("T")[0] : "",
      sponsorNumber: employee?.sponsorNumber || "",
      workPermitNumber: employee?.workPermitNumber || "",
      workPermitExpiry: employee?.workPermitExpiry ? employee.workPermitExpiry.split("T")[0] : "",
      iqamaStatus: employee?.iqamaStatus || "active",
    });
    setGovEditing(true);
  };

  const govSaveMut = useApiMutation<any, Record<string, string>>(
    `/employees/${id}`,
    "PATCH",
    [["employee", String(id)]],
    {
      successMessage: "تم تحديث البيانات الحكومية",
      onSuccess: () => setGovEditing(false),
    }
  );
  const govSaveEdit = () => {
    govSaveMut.mutate(govForm);
  };
  const hrTemplates = asList<any>(templatesResp).filter((t: any) => t.category === "hr" && t.isActive !== false);

  const handlePrintTemplate = async (template: any) => {
    setShowPrintMenu(false);
    try {
      const result = await apiFetch<any>(`/documents/templates/${template.id}/generate`, {
        method: "POST",
        body: JSON.stringify({ entityType: "employee", entityId: id }),
      });
      setPrintHtml(result.html || "");
      setPrintTitle(template.name);
      setPrintPreviewOpen(true);
    } catch {
      setPrintHtml("");
      setPrintTitle("خطأ");
      setPrintPreviewOpen(true);
    }
  };

  const tasks: any[] = employee?.tasks || [];
  const attendance: any[] = employee?.attendance || [];
  const leaves: any[] = employee?.leaves || [];
  const trainings: any[] = employee?.trainings || [];
  const payroll: any[] = employee?.payroll || [];
  const violations: any[] = employee?.violations || [];
  const loans: any[] = employee?.loans || [];
  const overtime: any[] = employee?.overtime || [];
  // HR-001 / #1799 priority #1 — fed by the GET /:id Promise.all
  // additions in routes/employees.ts. `userAccount` is null when the
  // employee has no login row in `users`; `roles` is empty when the
  // employee either has no account or has no rbac_user_roles grants.
  const userAccount: any = employee?.userAccount ?? null;
  const roles: any[] = employee?.roles || [];
  // HR-012 — second expansion: contract is single-row or null,
  // position is the admin position resolved from employee_assignments
  // (NULL when assignment is uncategorized), custodies is the
  // asset-bridge list (active first, then returned history).
  const contract: any = employee?.contract ?? null;
  const position: any = employee?.position ?? null;
  const custodies: any[] = employee?.custodies || [];
  // HR-014 — Employee 360 overview enrichment (#1799 priority #10).
  // Latest monthly composite score + unacknowledged signals from
  // the last 90 days. Both are nullable / empty by design.
  const latestScore: any = employee?.latestScore ?? null;
  const activeSignals: any[] = employee?.activeSignals || [];

  const hireDate = employee?.hireDate ? new Date(employee.hireDate) : null;
  const serviceDays = hireDate ? Math.floor((Date.now() - hireDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

  const pendingTasks = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled").length;

  // PR-6 (#2077) — extract PR-6 tab data + compute status badges.
  // Documents arrive from /employees/documents (company-wide list)
  // and are filtered client-side to this employee. Activity arrives
  // from /audit-logs/employees/:id (admin-gated; 403 → forbidden
  // state). Evaluation history comes from PR-4's /scoring/history.
  const allDocs: any[] = (docsResp?.data ?? docsResp ?? []) as any[];
  const documents = allDocs.filter((d: any) => String(d.employeeId) === String(id));
  const activityRows: any[] = (activityResp?.data ?? activityResp ?? []) as any[];
  const scoringHistory: any[] = (scoringHistResp?.data ?? scoringHistResp ?? []) as any[];
  const lifecycleHistory: any[] = (lifecycleHistResp?.data ?? lifecycleHistResp ?? []) as any[];

  // Compute the status of each tab. Used for both the tab strip badge
  // and the empty-state messaging. «action_needed» beats «complete»
  // when there are pending/expiring items so the operator's eye is
  // drawn to the right tab.
  const now = Date.now();
  const msIn90Days = 90 * 24 * 60 * 60 * 1000;
  const expiringDocs = [employee?.iqamaExpiry, employee?.passportExpiry, employee?.workPermitExpiry, employee?.visaExpiry]
    .filter(Boolean)
    .filter((d: string) => {
      const t = new Date(d).getTime();
      return !isNaN(t) && t > 0 && t < now + msIn90Days;
    }).length;
  const overdueTasks = tasks.filter((t: any) =>
    t.status !== "completed" && t.status !== "cancelled" && t.dueDate && new Date(t.dueDate).getTime() < now
  ).length;
  const openLeaves = leaves.filter((l: any) => l.status === "pending").length;
  const openViolations = violations.filter((v: any) => v.status === "pending" || v.status === "open").length;

  const tabStatus: Record<TabKey, TabStatus> = {
    overview:    "complete",
    info:        employee?.nationalId && employee?.phone ? "complete" : "missing",
    documents:   expiringDocs > 0 ? "action_needed" : (employee?.iqamaNumber || employee?.passportNumber) ? "complete" : "missing",
    titles:      employee?.jobTitle ? "complete" : "missing",
    account:     employee?.userAccount ? "complete" : "missing",
    roles:       roles.length > 0 ? "complete" : "missing",
    contract:    employee?.contract ? "complete" : "missing",
    attendance:  attendance.length > 0 ? "complete" : "missing",
    leaves:      openLeaves > 0 ? "action_needed" : leaves.length > 0 ? "complete" : "missing",
    custodies:   custodies.length > 0 ? "complete" : "missing",
    payroll:     payroll.length > 0 ? "complete" : "missing",
    violations:  openViolations > 0 ? "action_needed" : violations.length === 0 ? "complete" : "complete",
    evaluation:  latestScore ? "complete" : scoringHistory.length > 0 ? "complete" : "missing",
    tasks:       overdueTasks > 0 ? "action_needed" : tasks.length > 0 ? "complete" : "missing",
    trainings:   trainings.length > 0 ? "complete" : "missing",
    activity:    activityForbidden ? "forbidden" : activityRows.length > 0 ? "complete" : "missing",
    // PR-8 (#2077) — lifecycle. «action_needed» when the engine
    // suggests next transitions (HR has work to do); «complete» when
    // the employee is at a terminal-ish state (confirmed / clearance
    // complete); «missing» when no events have landed yet.
    lifecycle:   lifecycleStatusResp?.nextTransitions?.length ? "action_needed"
                 : lifecycleStatusResp?.currentState ? "complete" : "missing",
    finance:     "complete",
  };

  const overview = (
    <div className="space-y-4">
      {(empKpis || empSchedule.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {empKpis && (
            <div className="md:col-span-2 rounded-lg border bg-status-info-surface/30 p-3 text-sm">
              <p className="font-semibold mb-2">مؤشرات أداء الموظف</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(empKpis as Record<string, any>).slice(0, 8).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-mono font-semibold">{typeof v === "object" ? Object.keys(v ?? {}).length : String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {empSchedule.length > 0 && (
            <div className="rounded-lg border bg-purple-50/40 p-3 text-sm">
              <p className="font-semibold mb-2">جدول اليوم ({empSchedule.length})</p>
              <div className="space-y-1 text-xs">
                {empSchedule.slice(0, 5).map((s: any, i: number) => (
                  <div key={s.id ?? i} className="flex justify-between">
                    <span className="truncate">{s.title ?? s.taskTitle ?? s.subject ?? "—"}</span>
                    <span className="text-muted-foreground">{s.time ?? s.dueTime ?? ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex gap-1 border-b overflow-x-auto pb-px" data-testid="employee-360-tabs">
        {TABS.map((tab) => {
          const count = tab.key === "tasks" ? tasks.length
            : tab.key === "leaves" ? leaves.length
            : tab.key === "payroll" ? payroll.length
            : tab.key === "violations" ? violations.length
            : tab.key === "attendance" ? attendance.length
            : tab.key === "roles" ? roles.length
            : tab.key === "custodies" ? custodies.length
            : tab.key === "documents" ? documents.length
            : tab.key === "evaluation" ? scoringHistory.length
            : tab.key === "trainings" ? trainings.length
            : tab.key === "activity" ? activityRows.length
            : 0;
          // PR-6 (#2077) — status badge: «مكتمل/ناقص/يحتاج إجراء/غير
          // مصرح» on every tab so the operator instantly sees which
          // sections need attention without clicking. forbidden +
          // missing get muted tones; action_needed is red (impossible
          // to miss).
          const status = tabStatus[tab.key as TabKey];
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              data-testid={`tab-${tab.key}`}
              data-tab-status={status}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {count > 0 && tab.key !== "overview" && tab.key !== "info" && (
                <Badge variant="secondary" className="text-[10px] px-1.5 h-4">{count}</Badge>
              )}
              {status !== "complete" && tab.key !== "overview" && (
                <Badge
                  className={cn("text-[10px] px-1.5 h-4 border-0", STATUS_TONE[status])}
                  data-testid={`tab-status-${tab.key}`}
                >
                  {STATUS_LABEL[status]}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <QuickSummaryCard employee={employee} serviceDays={serviceDays} />

          {/* Integrated HR — finance/role/vehicle/email linkage at a glance.
              Renders the "is everything wired?" check in one card so HR
              doesn't have to bounce between custody/fleet/admin pages. */}
          <FinanceLinkageCard employeeId={id ?? ""} />

          {/* HR-014 — Performance score + active signals widget.
              Reads from the latest monthly row in employee_scores +
              the unacknowledged rows in employee_signals (last 90 days).
              When the engines haven't yet produced a score (new hire, or
              before the first monthly cron run), renders an empty state. */}
          <PerformanceWidget employeeId={Number(params?.id ?? 0)} latestScore={latestScore} activeSignals={activeSignals} />

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1 font-medium">الحضور (آخر 30 يوم)</p>
                <AttendanceSummary attendance={attendance} />
                <Button variant="ghost" size="sm" className="text-xs w-full mt-1" onClick={() => setActiveTab("attendance")}>
                  عرض التفاصيل →
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-2 font-medium">أرصدة الإجازات</p>
                <LeaveBalanceSummary employeeId={id} />
                <Button variant="ghost" size="sm" className="text-xs w-full mt-1" onClick={() => setActiveTab("leaves")}>
                  عرض الطلبات →
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-3 font-medium">المهام والأداء</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">إجمالي المهام</span>
                    <span className="font-bold">{tasks.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">المهام المعلقة</span>
                    <span className="font-bold text-orange-600">{pendingTasks}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">المخالفات</span>
                    <span className={cn("font-bold", violations.length > 0 ? "text-status-error-foreground" : "text-status-success-foreground")}>
                      {violations.length}
                    </span>
                  </div>
                  {violations.length >= 3 && (
                    <div className="text-xs text-status-error-foreground bg-status-error-surface rounded p-2 mt-2">
                      تحذير: الموظف غير مؤهل للترقية بسبب مخالفات متراكمة
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="text-xs w-full mt-3" onClick={() => setActiveTab("tasks")}>
                  عرض المهام →
                </Button>
              </CardContent>
            </Card>
          </div>

          {payroll.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-3 font-medium">آخر سجل راتب</p>
                {(() => {
                  const latest = payroll[0];
                  return (
                    <div className="flex items-center gap-6 flex-wrap">
                      <div>
                        <p className="text-xs text-muted-foreground">الفترة</p>
                        <p className="font-mono font-bold">{latest.period}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">الأساسي</p>
                        <p className="font-bold">{formatCurrency(Number(latest.basic || 0))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">الإجمالي</p>
                        <p className="font-bold">{formatCurrency(Number(latest.grossSalary || 0))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">الصافي</p>
                        <p className="font-bold text-status-success-foreground">{formatCurrency(Number(latest.netSalary || 0))}</p>
                      </div>
                      <PageStatusBadge status={latest.status} />
                    </div>
                  );
                })()}
                <Button variant="ghost" size="sm" className="text-xs w-full mt-3" onClick={() => setActiveTab("payroll")}>
                  عرض كل الرواتب →
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "info" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                المعلومات الأساسية
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoRow label="الاسم" value={employee.name} />
              <InfoRow label="الرقم الوظيفي" value={employee.empNumber || "-"} mono />
              <InfoRow label="الجنسية" value={employee.nationality || "-"} />
              <InfoRow label={<span className="flex items-center gap-2"><Phone className="h-4 w-4" /> الجوال</span>} value={employee.phone || "-"} dir="ltr" />
              <InfoRow label={<span className="flex items-center gap-2"><Mail className="h-4 w-4" /> البريد</span>} value={employee.email || "-"} last />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-muted-foreground" />
                معلومات العمل
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoRow label="المسمى الوظيفي" value={employee.jobTitle} bold />
              {/* PR-7 (#2077) — full org chain (شركة → فرع → إدارة → قسم → فريق).
                  The Administration row pulls from departments.administrationName
                  resolved by the /employees/:id route via the LEFT JOIN added
                  in PR-7. When NULL the row shows «—» (no UI break). */}
              <InfoRow label="الإدارة" value={employee.administrationName || "—"} />
              <InfoRow label="القسم" value={employee.departmentName || "-"} />
              <InfoRow label={<span className="flex items-center gap-2"><Building className="h-4 w-4" /> الفرع</span>} value={employee.branchName || "-"} />
              <InfoRow label="المدير المباشر" value={employee.managerName || "-"} />
              <InfoRow label={<span className="flex items-center gap-2"><Calendar className="h-4 w-4" /> تاريخ التعيين</span>} value={employee.hireDate ? formatDateAr(employee.hireDate) : "-"} />
              <InfoRow label="مدة الخدمة" value={`${serviceDays} يوم`} />
              <InfoRow label={<span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> الراتب الأساسي</span>} value={formatCurrency(Number(employee.salary) || 0)} bold last />
            </CardContent>
          </Card>

          {/* نقص بيانات مُصلَح: الآيبان/الحساب البنكي وجهة الطوارئ كانت تُحفظ
              عند الإنشاء لكن لا تظهر في التفاصيل — الرواتب تحتاج الآيبان،
              والموارد البشرية تحتاج جهة الطوارئ عند الأزمة. */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                المعلومات المالية وجهة الطوارئ
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <InfoRow label="البنك" value={employee.bankName || "—"} />
                <InfoRow label="رقم الحساب" value={employee.bankAccount || "—"} mono dir="ltr" />
                <InfoRow label="الآيبان (IBAN)" value={employee.iban || "—"} mono dir="ltr" last />
              </div>
              <div className="space-y-4">
                <InfoRow label={<span className="flex items-center gap-2"><Phone className="h-4 w-4" /> جهة اتصال الطوارئ</span>} value={employee.emergencyContact || "—"} />
                <InfoRow label={<span className="flex items-center gap-2"><Phone className="h-4 w-4" /> هاتف الطوارئ</span>} value={employee.emergencyPhone || "—"} dir="ltr" last />
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-status-info" />
                بيانات الإقامة والتأشيرة — الربط الحكومي (مقيم)
              </CardTitle>
              {!govEditing && (
                <GuardedButton perm="hr:create" variant="ghost" size="sm" onClick={govStartEdit}>
                  <Pencil className="h-4 w-4 me-1" />تعديل
                </GuardedButton>
              )}
            </CardHeader>
            <CardContent>
              {govEditing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">رقم الحدود</p>
                      <Input value={govForm.borderNumber} onChange={e => setGovForm(f => ({ ...f, borderNumber: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">رقم التأشيرة</p>
                      <Input value={govForm.visaNumber} onChange={e => setGovForm(f => ({ ...f, visaNumber: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">نوع التأشيرة</p>
                      <Select value={govForm.visaType || "_none"} onValueChange={(v) => setGovForm(f => ({ ...f, visaType: v === "_none" ? "" : v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">—</SelectItem>
                          <SelectItem value="work">عمل</SelectItem>
                          <SelectItem value="visit">زيارة</SelectItem>
                          <SelectItem value="transit">مرور</SelectItem>
                          <SelectItem value="hajj">حج</SelectItem>
                          <SelectItem value="umrah">عمرة</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">انتهاء التأشيرة</p>
                      <UnifiedDateInput value={govForm.visaExpiry} onChange={(iso) => setGovForm(f => ({ ...f, visaExpiry: iso }))} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">رقم الكفيل / المنشأة</p>
                      <Input value={govForm.sponsorNumber} onChange={e => setGovForm(f => ({ ...f, sponsorNumber: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">رقم رخصة العمل</p>
                      <Input value={govForm.workPermitNumber} onChange={e => setGovForm(f => ({ ...f, workPermitNumber: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">انتهاء رخصة العمل</p>
                      <UnifiedDateInput value={govForm.workPermitExpiry} onChange={(iso) => setGovForm(f => ({ ...f, workPermitExpiry: iso }))} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">حالة الإقامة</p>
                      <Select value={govForm.iqamaStatus} onValueChange={(v) => setGovForm(f => ({ ...f, iqamaStatus: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">سارية</SelectItem>
                          <SelectItem value="expired">منتهية</SelectItem>
                          <SelectItem value="renewal_pending">قيد التجديد</SelectItem>
                          <SelectItem value="cancelled">ملغاة</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <GuardedButton perm="hr:create" size="sm" onClick={govSaveEdit}>
                      <Check className="h-4 w-4 me-1" />حفظ
                    </GuardedButton>
                    <Button variant="outline" size="sm" onClick={() => setGovEditing(false)}>
                      <X className="h-4 w-4 me-1" />إلغاء
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم الإقامة</p><p className="font-mono text-sm">{employee.iqamaNumber || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">انتهاء الإقامة</p><p className="text-sm">{employee.iqamaExpiry ? formatDateAr(employee.iqamaExpiry) : "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">حالة الإقامة</p><p className="text-sm">{hrLabel(IQAMA_STATUS, employee.iqamaStatus)}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم الجواز</p><p className="font-mono text-sm">{employee.passportNumber || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">انتهاء الجواز</p><p className="text-sm">{employee.passportExpiry ? formatDateAr(employee.passportExpiry) : "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم الحدود</p><p className="font-mono text-sm">{employee.borderNumber || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم التأشيرة</p><p className="font-mono text-sm">{employee.visaNumber || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">نوع التأشيرة</p><p className="text-sm">{hrLabel(VISA_TYPES, employee.visaType)}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">انتهاء التأشيرة</p><p className="text-sm">{employee.visaExpiry ? formatDateAr(employee.visaExpiry) : "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم الكفيل / المنشأة</p><p className="font-mono text-sm">{employee.sponsorNumber || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم رخصة العمل</p><p className="font-mono text-sm">{employee.workPermitNumber || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">انتهاء رخصة العمل</p><p className="text-sm">{employee.workPermitExpiry ? formatDateAr(employee.workPermitExpiry) : "-"}</p></div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* HR-001 / #1799 priority #1 — Tab: الحساب والدخول.
          Surfaces the linked user-account row (or its absence) so an HR
          officer doesn't have to bounce to /admin/users to know whether
          the employee can sign in, when they last did, and whether the
          account is locked. Sensitive material (passwordHash, MFA secret)
          is never returned by the backend. */}
      {activeTab === "account" && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-status-info-foreground" />
              حساب الدخول
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!userAccount ? (
              <div className="text-center py-8">
                <Lock className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">لا يوجد حساب دخول مرتبط بهذا الموظف.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  يمكن إنشاء حساب من شاشة <a href="/admin/users" className="text-primary hover:underline">إدارة المستخدمين</a>.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">البريد الإلكتروني</p>
                  <p className="font-mono text-sm" dir="ltr">{userAccount.email || "-"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">الدور الرئيسي (legacy)</p>
                  <p className="text-sm">{userAccount.role || "-"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">حالة الحساب</p>
                  {userAccount.isActive ? (
                    <Badge className="bg-status-success-surface text-status-success-foreground">
                      <CheckCircle2 className="h-3 w-3 me-1" /> نشط
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-status-error-surface text-status-error-foreground">
                      <XCircle className="h-3 w-3 me-1" /> معطل
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">آخر دخول</p>
                  <p className="text-sm">
                    {userAccount.lastLoginAt
                      ? `${formatDateAr(userAccount.lastLoginAt)} · ${formatTimeAr(userAccount.lastLoginAt)}`
                      : <span className="text-muted-foreground">لم يسجل دخول بعد</span>}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">محاولات فاشلة (7 أيام)</p>
                  <p className="text-sm">
                    {(userAccount.failedLoginAttempts ?? 0) > 0 ? (
                      <span className="text-status-warning-foreground font-semibold">
                        {userAccount.failedLoginAttempts}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">قفل حتى</p>
                  <p className="text-sm">
                    {userAccount.lockedUntil ? (
                      <span className="text-status-error-foreground">
                        <Lock className="h-3 w-3 inline me-1" />
                        {formatDateAr(userAccount.lockedUntil)} · {formatTimeAr(userAccount.lockedUntil)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">لا قفل</span>
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">تاريخ إنشاء الحساب</p>
                  <p className="text-sm">{userAccount.createdAt ? formatDateAr(userAccount.createdAt) : "-"}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* HR-001 / #1799 priority #1 — Tab: الأدوار والصلاحيات.
          Lists every rbac_user_roles row attached to the employee's user
          account, scoped to the current company. Primary role surfaces
          first (is_primary DESC), then by level. Expired grants are
          shown but visually faded so the HR officer knows the role is
          no longer active. The "Effective Permissions" deep link goes
          to /admin/users/:id (RBAC-004 — the viewer UI itself is still
          a stub per the inventory doc; this is the entry point). */}
      {activeTab === "roles" && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-purple-600" />
              الأدوار النشطة ({roles.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!userAccount ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">يتطلب وجود حساب دخول أولاً.</p>
              </div>
            ) : roles.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">لا توجد أدوار RBAC مسندة لهذا الموظف.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  يمكن إسناد الأدوار من <a href={`/admin/users/${userAccount.id}`} className="text-primary hover:underline">شاشة المستخدم</a>.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {roles.map((r) => {
                  const isExpired = r.expiresAt && new Date(r.expiresAt) < new Date();
                  return (
                    <div
                      key={r.userRoleId}
                      className={cn(
                        "flex items-center justify-between gap-3 p-3 rounded-lg border",
                        isExpired ? "opacity-50 bg-muted/30" : "bg-surface-subtle/30"
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className="w-2 h-8 rounded-full"
                          style={{ backgroundColor: r.color || "#94a3b8" }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{r.labelAr || r.roleKey}</span>
                            {r.isPrimary && (
                              <Badge variant="outline" className="text-[10px] gap-1 border-amber-400 text-amber-700">
                                <Star className="h-2.5 w-2.5" /> رئيسي
                              </Badge>
                            )}
                            {r.isTemplate && (
                              <Badge variant="secondary" className="text-[10px]">قالب</Badge>
                            )}
                            {isExpired && (
                              <Badge variant="secondary" className="text-[10px] bg-status-error-surface text-status-error-foreground">
                                منتهي
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                            <span className="font-mono" dir="ltr">{r.roleKey}</span>
                            {r.level != null && <span>· مستوى {r.level}</span>}
                            {r.labelEn && <span>· {r.labelEn}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-end text-xs text-muted-foreground shrink-0">
                        <div>أسند: {r.assignedAt ? formatDateAr(r.assignedAt) : "-"}</div>
                        {r.expiresAt && (
                          <div className={isExpired ? "text-status-error" : ""}>
                            ينتهي: {formatDateAr(r.expiresAt)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t mt-3">
                  <a
                    href={`/admin/effective-permissions?userId=${userAccount.id}`}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    عرض الصلاحيات الفعلية الكاملة (Effective Permissions) →
                  </a>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* HR-012 / #1799 priority #1 — Tab: المسميات والمناصب.
          Joins the assignment's professional jobTitle (existing) with
          the new admin position (from §B migration 274). Same employee
          can be «محامي» (job title) holding the position «مدير قسم
          القانوني» (admin role) — both surfaces here. */}
      {activeTab === "titles" && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-status-info-foreground" />
              المسميات والمناصب
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">المسمى المهني (Job Title)</p>
                <p className="text-sm font-medium">{employee?.jobTitle || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">المنصب الإداري (Position)</p>
                {position ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{position.labelAr || position.positionKey}</span>
                    {position.level != null && (
                      <Badge variant="outline" className="text-[10px]">مستوى {position.level}</Badge>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    لم يُسند بعد — راجع §B في وثيقة الإصلاح
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">القسم</p>
                <p className="text-sm">{employee?.departmentName || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">الفرع</p>
                <p className="text-sm">{employee?.branchName || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">المدير المباشر</p>
                <p className="text-sm">{employee?.managerName || <span className="text-muted-foreground italic">—</span>}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">الفئة (للسياسات)</p>
                <p className="text-sm">
                  {employee?.categoryKey || (
                    <span className="text-muted-foreground italic">غير مصنّف</span>
                  )}
                </p>
              </div>
            </div>
            {position?.description && (
              <p className="text-xs text-muted-foreground mt-4 pt-3 border-t">
                {position.description}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* HR-012 / #1799 priority #1 — Tab: العقد.
          Loads the active employment contract (employee_contracts).
          Salary is NOT surfaced here — it lives on the «الرواتب» tab
          which has its own RBAC field-policy gate. */}
      {activeTab === "contract" && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-emerald-600" />
              العقد
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!contract ? (
              <div className="text-center py-6">
                <FileSignature className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">لا يوجد عقد نشط.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  يمكن إنشاء العقد من <a href="/hr/contracts" className="text-primary hover:underline">شاشة العقود</a>.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">رقم العقد</p>
                  <p className="font-mono text-sm">{contract.ref || `#${contract.id}`}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">نوع العقد</p>
                  <p className="text-sm">{hrLabel(CONTRACT_TYPES, contract.contractType)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">الحالة</p>
                  <PageStatusBadge status={contract.status} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">حالة الاعتماد</p>
                  <PageStatusBadge status={contract.approvalStatus} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">تاريخ البدء</p>
                  <p className="text-sm">{contract.startDate ? formatDateAr(contract.startDate) : "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">تاريخ الانتهاء</p>
                  <p className="text-sm">{contract.endDate ? formatDateAr(contract.endDate) : <span className="text-muted-foreground italic">غير محدد</span>}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">انتهاء فترة التجربة</p>
                  <p className="text-sm">{contract.probationEndDate ? formatDateAr(contract.probationEndDate) : "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">حالة فترة التجربة</p>
                  <p className="text-sm">{contract.probationStatus || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">توقيع الموظف</p>
                  {contract.signedByEmployee ? (
                    <Badge className="bg-status-success-surface text-status-success-foreground">
                      <CheckCircle2 className="h-3 w-3 me-1" /> موقّع
                    </Badge>
                  ) : (
                    <Badge variant="secondary">لم يوقّع</Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* HR-012 / #1799 priority #1 — Tab: العهد والأصول.
          Lists every asset (laptop, phone, SIM, etc.) from
          employee_assets (§9 migration 276) — active first then
          returned. Damage notes from condition fields surface as
          tooltip. Used by exit-clearance to know what's outstanding. */}
      {activeTab === "custodies" && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-5 w-5 text-purple-600" />
              العهد والأصول ({custodies.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {custodies.length === 0 ? (
              <div className="text-center py-6">
                <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">لا توجد عهد مسجلة لهذا الموظف.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  يُسجَّل اللابتوب، الهاتف، SIM، المركبة، إلخ — كل ما يحوزه الموظف من أصول الشركة.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {custodies.map((asset) => {
                  const isReturned = !!asset.returnedAt;
                  return (
                    <div
                      key={asset.id}
                      className={cn(
                        "flex items-center justify-between gap-3 p-3 rounded-lg border",
                        isReturned ? "opacity-60 bg-muted/30" : "bg-surface-subtle/30"
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-50">
                          <Package className="h-5 w-5 text-purple-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {asset.assetLabel || asset.assetKey}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {asset.assetType}
                            </Badge>
                            {isReturned ? (
                              <Badge className="bg-status-success-surface text-status-success-foreground text-[10px]">
                                مُعَاد
                              </Badge>
                            ) : (
                              <Badge className="bg-status-warning-surface text-status-warning-foreground text-[10px]">
                                نشط
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                            <span className="font-mono">{asset.assetKey}</span>
                            {asset.serialNumber && <span>· S/N: {asset.serialNumber}</span>}
                          </div>
                          {(asset.conditionOnAssign || asset.conditionOnReturn) && (
                            <div className="text-[11px] text-muted-foreground mt-1">
                              {asset.conditionOnAssign && <span>عند التسليم: {asset.conditionOnAssign}</span>}
                              {asset.conditionOnReturn && <span> · عند الاسترداد: {asset.conditionOnReturn}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-end text-xs text-muted-foreground shrink-0">
                        <div>سُلّم: {asset.assignedAt ? formatDateAr(asset.assignedAt) : "—"}</div>
                        {asset.returnedAt && (
                          <div>أُعيد: {formatDateAr(asset.returnedAt)}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "attendance" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">الحضور والانصراف (آخر 30 يوم)</CardTitle>
          </CardHeader>
          <CardContent>
            <AttendanceSummary attendance={attendance} />
            {attendance.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا يوجد سجل حضور</p>
            ) : (
              <div className="space-y-2">
                {attendance.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-surface-subtle">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">{formatDateAr(a.date)}</span>
                      <PageStatusBadge status={a.status} domain="attendance" />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>دخول: {formatTimeAr(a.checkIn)}</span>
                      <span>خروج: {formatTimeAr(a.checkOut)}</span>
                      {a.lateMinutes > 0 && (
                        <Badge variant="destructive" className="text-[10px]">تأخر {a.lateMinutes} د</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "leaves" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">أرصدة الإجازات</CardTitle>
            </CardHeader>
            <CardContent>
              <LeaveBalanceSummary employeeId={id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">طلبات الإجازات ({leaves.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {leaves.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">لا توجد طلبات إجازة</p>
              ) : (
                <div className="space-y-3">
                  {leaves.map((l: any) => (
                    <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-surface-subtle">
                      <div>
                        <p className="font-medium">{l.leaveTypeName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateAr(l.startDate)} — {formatDateAr(l.endDate)} ({l.days} أيام)
                        </p>
                        {l.reason && <p className="text-xs text-muted-foreground mt-1">{l.reason}</p>}
                      </div>
                      <PageStatusBadge status={l.status} domain="leave" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "payroll" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              سجل الرواتب ({payroll.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {payroll.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا يوجد سجل رواتب</p>
            ) : (
              <DataTable
                columns={[
                  { key: "period", header: "الفترة", render: (p) => <span className="font-mono">{p.period}</span> },
                  { key: "basic", header: "الأساسي", render: (p) => formatCurrency(Number(p.basic || 0)) },
                  { key: "grossSalary", header: "الإجمالي", render: (p) => formatCurrency(Number(p.grossSalary || 0)) },
                  { key: "gosi", header: "التأمينات", render: (p) => <span className="text-orange-600">{formatCurrency(Number(p.gosi || 0))}</span> },
                  { key: "lateDeduction", header: "خصم التأخر", render: (p) => <span className="text-status-error-foreground">{formatCurrency(Number(p.lateDeduction || 0))}</span> },
                  { key: "netSalary", header: "الصافي", render: (p) => <span className="font-bold text-status-success-foreground">{formatCurrency(Number(p.netSalary || 0))}</span> },
                  { key: "status", header: "الحالة", render: (p) => <PageStatusBadge status={p.status} /> },
                ]}
                data={payroll}
                noToolbar
                pageSize={0}
                searchPlaceholder={null}
              />
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "violations" && (
        <div className="space-y-4">
          <EmployeeDisciplineSummary
            employeeId={employee.id}
            employeeName={employee.name}
            title="ملف انضباط الموظف"
          />
          {violations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                  السجل التفصيلي ({violations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ViolationTimeline violations={violations} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "tasks" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">المهام المسندة ({tasks.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا توجد مهام مسندة</p>
            ) : (
              <div className="space-y-3">
                {tasks.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-surface-subtle">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{t.title}</p>
                      {t.projectName && <p className="text-xs text-muted-foreground">{t.projectName}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <PageStatusBadge status={t.status} />
                      <PriorityBadge priority={t.priority} />
                      {t.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          {formatDateAr(t.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "trainings" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">الدورات التدريبية ({trainings.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {trainings.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا توجد دورات تدريبية</p>
            ) : (
              <div className="space-y-3">
                {trainings.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-surface-subtle">
                    <div>
                      <p className="font-medium">{t.courseTitle}</p>
                      <p className="text-xs text-muted-foreground">{t.courseType || "-"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <PageStatusBadge status={t.status} />
                      {t.completedAt && (
                        <span className="text-xs text-muted-foreground">
                          {formatDateAr(t.completedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PR-6 (#2077) — three NEW tabs: documents + evaluation + activity.
          Each consumes an EXISTING endpoint (no new backend) and shows
          a summary header + last-N items + a deep-link to the canonical
          screen that owns the full surface. Empty + forbidden states
          are explicit (per the «status badges» mandate) so the operator
          never sees a blank tab.
          ───────────────────────────────────────────────────────────── */}
      {activeTab === "documents" && (
        <Card data-testid="tab-content-documents">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                وثائق الموظف ({documents.length})
              </span>
              {/* Quick-glance status of the 4 expiry fields living on
                  the employee row — iqama, passport, work permit, visa.
                  Drives the «يحتاج إجراء» badge on the documents tab. */}
              <span className="text-xs font-normal text-muted-foreground">
                {expiringDocs > 0
                  ? <Badge className="bg-status-error-surface text-status-error-foreground border-0">{expiringDocs} وثيقة تنتهي خلال 90 يومًا</Badge>
                  : "كل الوثائق سارية"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* The 4 government IDs always live on the employee row, so
                we render them as a fixed summary card BEFORE the
                attached documents list. Even when /employees/documents
                returns empty, this section still shows information. */}
            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <InfoRow label="الهوية / الإقامة" value={employee?.iqamaNumber || "—"} />
              <InfoRow label="انتهاء الإقامة" value={employee?.iqamaExpiry ? formatDateAr(employee.iqamaExpiry) : "—"} />
              <InfoRow label="رقم الجواز" value={employee?.passportNumber || "—"} />
              <InfoRow label="انتهاء الجواز" value={employee?.passportExpiry ? formatDateAr(employee.passportExpiry) : "—"} />
              <InfoRow label="رخصة العمل" value={employee?.workPermitNumber || "—"} />
              <InfoRow label="انتهاء رخصة العمل" value={employee?.workPermitExpiry ? formatDateAr(employee.workPermitExpiry) : "—"} last />
            </div>
            {documents.length === 0 ? (
              <div className="text-center py-6 border-t border-dashed">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-muted-foreground text-sm">لا توجد وثائق مرفقة لهذا الموظف</p>
                <p className="text-xs text-muted-foreground mt-1">يمكنك إضافة الوثائق من <Link href="/hr/documents" asChild><a className="text-primary hover:underline">إدارة وثائق الموارد البشرية</a></Link></p>
              </div>
            ) : (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2">الوثائق المرفقة ({documents.length})</p>
                {documents.slice(0, 5).map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between p-2 rounded border hover:bg-surface-subtle text-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{d.title || d.type || `وثيقة #${d.id}`}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{d.createdAt ? formatDateAr(d.createdAt) : "—"}</span>
                  </div>
                ))}
                {documents.length > 5 && (
                  <Link href="/hr/documents" asChild>
                    <a className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                      عرض كل الوثائق ({documents.length}) <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "evaluation" && (
        <Card data-testid="tab-content-evaluation">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                التقييم المؤسسي
              </span>
              <Link href={`/hr/employees/${id}/score`} asChild>
                <a className="text-xs text-primary hover:underline flex items-center gap-1">
                  التفصيل الكامل <ArrowUpRight className="h-3 w-3" />
                </a>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Latest score headline — always shown when present. */}
            {latestScore && (
              <div className="bg-surface-subtle rounded p-4 mb-4">
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-bold">{Math.round(Number(latestScore.compositeScore || 0))}</span>
                  <span className="text-muted-foreground pb-1">/100</span>
                  <Badge variant="outline" className="ms-auto">{latestScore.periodKey || "—"}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs mt-3">
                  {[
                    { k: "disciplineScore",   l: "انضباط" },
                    { k: "activityScore",     l: "نشاط" },
                    { k: "productivityScore", l: "إنتاجية" },
                    { k: "qualityScore",      l: "جودة" },
                    { k: "managerScore",      l: "تقييم المدير" },
                    { k: "developmentScore",  l: "تطوير" },
                  ].map((d) => (
                    <div key={d.k} className="bg-white rounded p-2 border">
                      <p className="text-muted-foreground">{d.l}</p>
                      <p className="font-bold">{Math.round(Number((latestScore as any)[d.k] || 0))}/100</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Scoring history — last 12 monthly periods. */}
            {scoringHistory.length === 0 && !latestScore ? (
              <div className="text-center py-6">
                <Award className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-muted-foreground text-sm">لا يوجد سجل تقييم لهذا الموظف بعد</p>
                <p className="text-xs text-muted-foreground mt-1">
                  يحسب المحرّك الدرجات أسبوعيًا (الإثنين 3 صباحًا) وشهريًا (1 من كل شهر) — أو اضغط «التفصيل الكامل» ثم «إعادة الحساب الآن».
                </p>
              </div>
            ) : scoringHistory.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2">السجل الشهري (آخر {Math.min(scoringHistory.length, 6)} أشهر)</p>
                <div className="space-y-1">
                  {scoringHistory.slice(0, 6).map((s: any) => (
                    <div key={`${s.scope}-${s.periodKey}`} className="flex items-center justify-between p-2 rounded border hover:bg-surface-subtle text-sm">
                      <span className="font-mono text-xs">{s.periodKey}</span>
                      <span className="font-bold">{Number(s.compositeScore).toFixed(1)}/100</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "activity" && (
        <Card data-testid="tab-content-activity">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5" />
              النشاط (آخر التغييرات على هذا الملف)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* PR-6 (#2077) — activity is the most sensitive tab in the
                360 view. /audit-logs/:entityType/:entityId is gated on
                admin.audit:view; non-admins get 403 → we render the
                «غير مصرح» state with a permission hint instead of
                trying to show the empty page that a blanket
                hideTab/permission gate would produce. */}
            {activityForbidden ? (
              <div className="text-center py-6">
                <Lock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-muted-foreground text-sm">لا تملك صلاحية عرض سجل النشاط</p>
                <p className="text-xs text-muted-foreground mt-1">يتطلّب صلاحية <code className="font-mono">admin.audit:view</code></p>
              </div>
            ) : activityRows.length === 0 ? (
              <div className="text-center py-6">
                <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-muted-foreground text-sm">لا يوجد نشاط مُسجَّل على هذا الملف</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activityRows.slice(0, 10).map((a: any) => (
                  <div key={a.id} className="flex items-start gap-3 p-2 rounded border hover:bg-surface-subtle text-sm">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{a.action}</Badge>
                        <span className="text-xs text-muted-foreground">{a.userName || `مستخدم #${a.userId}`}</span>
                      </div>
                      {a.reason && <p className="text-xs text-muted-foreground mt-1">{a.reason}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateAr(a.createdAt)}</span>
                  </div>
                ))}
                {activityRows.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    عرض 10 من {activityRows.length} سجلًا — افتح
                    <Link href={`/audit-logs?entity=employees&entityId=${id}`} asChild>
                      <a className="text-primary hover:underline mx-1">سجل التدقيق الكامل</a>
                    </Link>
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* PR-8 (#2077) — دورة الحياة tab. Reads the lifecycle status +
          history endpoints; surfaces the current state + a timeline +
          a transition launcher. The transition dialog is intentionally
          minimal (eventType + reason + the 4 dates) — every transition
          goes through POST /lifecycle/transitions which validates the
          state machine + runs the guards. */}
      {activeTab === "lifecycle" && (
        <Card data-testid="tab-content-lifecycle">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                دورة حياة الموظف
              </span>
              {lifecycleStatusResp?.currentStateLabel && (
                <Badge variant="outline" className="text-sm" data-testid="lifecycle-current-state">
                  الحالة الحالية: {lifecycleStatusResp.currentStateLabel}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LifecycleTabContent
              employeeId={Number(id)}
              status={lifecycleStatusResp}
              history={lifecycleHistory}
              onTransitioned={() => { refetchLifecycle(); refetch(); }}
            />
          </CardContent>
        </Card>
      )}

      {activeTab === "finance" && (
        <div className="space-y-4">
          {/* سلف الموظف */}
          {loans.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-emerald-600" />
                  سلف الموظف ({loans.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  columns={[
                    { key: "loanNumber", header: "رقم السلفة", render: (ln) => <span className="font-mono text-xs text-status-info-foreground">{ln.loanNumber}</span> },
                    { key: "loanType", header: "النوع", render: (ln) => {
                      const loanTypes: Record<string, string> = { salary_advance: "سلفة راتب", personal: "شخصية", emergency: "طارئة" };
                      return loanTypes[ln.loanType] || ln.loanType;
                    }},
                    { key: "amount", header: "المبلغ", render: (ln) => <span className="font-semibold">{formatCurrency(Number(ln.amount))}</span> },
                    { key: "remainingAmount", header: "المتبقي", render: (ln) => <span className="text-status-error-foreground">{formatCurrency(Number(ln.remainingAmount || 0))}</span> },
                    { key: "status", header: "الحالة", render: (ln) => <PageStatusBadge status={ln.status} /> },
                  ]}
                  data={loans}
                  noToolbar
                  pageSize={0}
                  searchPlaceholder={null}
                />
              </CardContent>
            </Card>
          )}

          {/* وقت إضافي */}
          {overtime.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-5 w-5 text-cyan-600" />
                  الوقت الإضافي ({overtime.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  columns={[
                    { key: "requestNumber", header: "رقم الطلب", render: (ot) => <span className="font-mono text-xs text-purple-700">{ot.requestNumber}</span> },
                    { key: "overtimeDate", header: "التاريخ", render: (ot) => <span className="text-muted-foreground">{formatDateAr(ot.overtimeDate)}</span> },
                    { key: "hours", header: "الساعات", render: (ot) => `${Number(ot.hours).toFixed(1)} ساعة` },
                    { key: "totalAmount", header: "المبلغ", render: (ot) => <span className="font-semibold text-status-success-foreground">{formatCurrency(Number(ot.totalAmount || 0))}</span> },
                    { key: "status", header: "الحالة", render: (ot) => <PageStatusBadge status={ot.status} /> },
                  ]}
                  data={overtime}
                  noToolbar
                  pageSize={0}
                  searchPlaceholder={null}
                />
              </CardContent>
            </Card>
          )}

          {/* الملف المالي العام */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-status-info-foreground" />
                الملف المالي للموظف
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EntityFinancialProfile entityType="employee" entityId={id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">دفتر الأستاذ المساعد</CardTitle></CardHeader>
            <CardContent>
              <FinancialTab entityType="employee" entityId={id} />
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );

  return (
    <>
      <DetailPageLayout
        title={employee?.name || "تفاصيل الموظف"}
        subtitle={employee ? `${employee.empNumber || "—"} · ${employee.jobTitle || "—"} · ${employee.branchName || "—"}` : undefined}
        backPath="/employees"
        entityType="employee"
        entityId={id}
        overview={overview}
        isLoading={isLoading}
        error={isError ? (error || new Error("خطأ في تحميل بيانات الموظف")) : undefined}
        onRetry={refetch}
        hideTabs={[...new Set(["tasks" as const, ...registryHideTabs])]}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <OperationalStatusBar employeeId={id} />
            <GuardedButton perm="hr:update" size="sm" onClick={() => navigate(`/employees/${id}/edit`)}>
              <Pencil className="h-4 w-4 me-1" />تعديل بيانات الموظف
            </GuardedButton>
            <PrintButton entityType="employee" entityId={id ?? ""} label="بطاقة الموظف" />
            {id && <EntityPnlButton entityType="employee" entityId={Number(id)} />}
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowPrintMenu(!showPrintMenu)}>
                <Printer className="h-4 w-4 me-1" />طباعة قوالب HR
              </Button>
              {showPrintMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowPrintMenu(false)} />
                  <div className="absolute start-0 top-full mt-1 z-50 bg-white border rounded-lg shadow-lg min-w-[200px] py-1">
                    {hrTemplates.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">لا توجد قوالب</p>
                    ) : (
                      hrTemplates.map((t: any) => (
                        <button
                          key={t.id}
                          className="w-full text-right px-3 py-2 text-sm hover:bg-surface-subtle flex items-center gap-2"
                          onClick={() => handlePrintTemplate(t)}
                        >
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          {t.name}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        }
      />
      {printPreviewOpen && (
        <PrintPreviewModal
          open={printPreviewOpen}
          onClose={() => setPrintPreviewOpen(false)}
          branch={branch}
          documentTitle={printTitle}
          documentRef=""
          documentDate={formatDateAr(new Date())}
        >
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(printHtml) }} />
        </PrintPreviewModal>
      )}
    </>
  );
}

function InfoRow({ label, value, mono, dir, bold, last }: {
  label: React.ReactNode; value: string; mono?: boolean; dir?: string; bold?: boolean; last?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-3 py-2", !last && "border-b")}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("col-span-2", mono && "font-mono", bold && "font-bold")} dir={dir}>{value}</span>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: "bg-status-error-surface text-status-error-foreground",
    high: "bg-orange-100 text-orange-800",
    medium: "bg-status-warning-surface text-yellow-800",
    low: "bg-status-success-surface text-status-success-foreground",
  };
  const labels: Record<string, string> = {
    critical: "حرج",
    high: "عالي",
    medium: "متوسط",
    low: "منخفض",
  };
  return (
    <Badge className={cn("text-[10px]", colors[priority] || "bg-surface-subtle text-status-neutral-foreground")}>
      {labels[priority] || priority}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-status-error-surface text-status-error-foreground",
    high: "bg-orange-100 text-orange-800",
    medium: "bg-status-warning-surface text-yellow-800",
    low: "bg-status-info-surface text-status-info-foreground",
  };
  return (
    <Badge className={cn("text-[10px]", colors[severity] || "bg-surface-subtle text-status-neutral-foreground")}>
      {severityLabel(severity)}
    </Badge>
  );
}

function severityLabel(severity: string): string {
  const labels: Record<string, string> = {
    critical: "حرج",
    high: "عالي",
    medium: "متوسط",
    low: "منخفض",
  };
  return labels[severity] || severity;
}

function violationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    late_arrival: "تأخر",
    gps_out_of_range: "خارج النطاق",
    absence: "غياب",
    early_leave: "انصراف مبكر",
    suspension: "إيقاف",
  };
  return labels[type] || type;
}
