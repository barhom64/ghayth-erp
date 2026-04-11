import { useApiQuery, asList } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Clock, CheckCircle, XCircle, ArrowRight, AlertTriangle, FileText, Edit, Plus, Trash, Send, RotateCcw, ArrowUpRight, MessageCircle } from "lucide-react";

const ACTION_MAP: Record<string, { icon: typeof Clock; color: string; bg: string; label: string }> = {
  comment: { icon: MessageCircle, color: "text-indigo-600", bg: "bg-indigo-50", label: "تعليق" },
  create: { icon: Plus, color: "text-green-600", bg: "bg-green-50", label: "إنشاء" },
  update: { icon: Edit, color: "text-blue-600", bg: "bg-blue-50", label: "تحديث" },
  delete: { icon: Trash, color: "text-red-600", bg: "bg-red-50", label: "حذف" },
  approve: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50", label: "موافقة" },
  reject: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: "رفض" },
  status_change: { icon: ArrowRight, color: "text-orange-600", bg: "bg-orange-50", label: "تغيير حالة" },
  auto_task_created: { icon: Plus, color: "text-teal-600", bg: "bg-teal-50", label: "مهمة تلقائية" },
  auto_penalty_created: { icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-50", label: "غرامة تلقائية" },
  auto_invoice_created: { icon: FileText, color: "text-blue-600", bg: "bg-blue-50", label: "فاتورة تلقائية" },
  maintenance_completed: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", label: "إتمام صيانة" },
  "leave.created": { icon: Plus, color: "text-blue-600", bg: "bg-blue-50", label: "تقديم طلب إجازة" },
  "leave.stage1_approved": { icon: CheckCircle, color: "text-teal-600", bg: "bg-teal-50", label: "موافقة المدير" },
  "leave.stage2_approved": { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50", label: "موافقة HR" },
  "leave.approved": { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", label: "موافقة نهائية" },
  "leave.rejected": { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: "رفض" },
  "leave.returned": { icon: ArrowRight, color: "text-orange-600", bg: "bg-orange-50", label: "إرجاع" },
  "leave.escalated": { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50", label: "تصعيد" },
  "payroll.completed": { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", label: "صرف رواتب" },
  "invoice.created": { icon: Plus, color: "text-blue-600", bg: "bg-blue-50", label: "إنشاء فاتورة" },
  "invoice.paid": { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", label: "دفع" },
  "payroll.run": { icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50", label: "تشغيل الرواتب" },
  auto_task: { icon: Plus, color: "text-teal-600", bg: "bg-teal-50", label: "مهمة تلقائية" },
  auto_invoice: { icon: FileText, color: "text-violet-600", bg: "bg-violet-50", label: "فاتورة تلقائية" },
  auto_penalty: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", label: "غرامة تلقائية" },
  late_rent_escalation: { icon: ArrowUpRight, color: "text-amber-600", bg: "bg-amber-50", label: "تصعيد تأخير إيجار" },
};

function formatTimeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "الآن";
  if (min < 60) return `منذ ${min} دقيقة`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

interface EntityTimelineProps {
  entityType: string;
  entityId: number | string;
  maxItems?: number;
  className?: string;
}

export function EntityTimeline({ entityType, entityId, maxItems = 20, className }: EntityTimelineProps) {
  const { data } = useApiQuery<any>(
    ["entity-timeline", entityType, String(entityId)],
    `/audit-logs/${entityType}/${entityId}`,
    !!entityId
  );
  const { data: commentsData } = useApiQuery<any>(
    ["entity-comments-timeline", entityType, String(entityId)],
    `/entity-meta/comments/${entityType}/${entityId}`,
    !!entityId
  );
  const auditItems = asList(data?.data ?? data);
  const commentItems = asList(commentsData?.data ?? []).map((c: any) => ({
    ...c,
    action: "comment",
    userName: c.userName,
  }));
  const items = [...auditItems, ...commentItems].sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (!items.length) {
    return (
      <div className={cn("text-center py-4 text-gray-400 text-sm", className)}>
        <Clock className="w-6 h-6 mx-auto mb-1 text-gray-300" />
        لا يوجد سجل أحداث
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <div className="absolute start-4 top-0 bottom-0 w-0.5 bg-gray-200" />
      <div className="space-y-3">
        {items.slice(0, maxItems).map((item: any, i: number) => {
          const actionKey = item.action || "update";
          const style = ACTION_MAP[actionKey] || ACTION_MAP.update;
          const Icon = style.icon;
          return (
            <div key={item.id || i} className="relative flex items-start gap-3 ps-9">
              <div className={cn("absolute start-1.5 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white z-10", style.bg)}>
                <Icon className={cn("w-3 h-3", style.color)} />
              </div>
              <div className="flex-1 min-w-0 bg-gray-50/50 rounded-lg p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-800">{style.label}</span>
                  <span className="text-xs text-gray-400 shrink-0">{formatTimeAgo(item.createdAt)}</span>
                </div>
                {item.userName && <p className="text-xs text-gray-500 mt-0.5">بواسطة {item.userName}</p>}
                {item.action === "comment" && item.body && (
                  <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{item.body}</p>
                )}
                {item.action !== "comment" && item.after && typeof item.after === "object" && Object.keys(item.after).length > 0 && (
                  <div className="mt-1 text-xs text-gray-500 truncate">
                    {item.after.message ? (
                      <span>{String(item.after.message)}</span>
                    ) : (
                      Object.entries(item.after).slice(0, 3).map(([k, v]) => (
                        <span key={k} className="me-2">{k}: {String(v)}</span>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface StageStep {
  label: string;
  status: "completed" | "current" | "pending" | "rejected" | "skipped";
  detail?: string;
  time?: string;
}

export function ProcessStages({ steps, className }: { steps: StageStep[]; className?: string }) {
  const statusStyle: Record<string, { dot: string; line: string; text: string }> = {
    completed: { dot: "bg-green-500 ring-green-200", line: "bg-green-400", text: "text-green-700" },
    current: { dot: "bg-blue-500 ring-blue-200 animate-pulse", line: "bg-gray-300", text: "text-blue-700" },
    pending: { dot: "bg-gray-300 ring-gray-200", line: "bg-gray-200", text: "text-gray-500" },
    rejected: { dot: "bg-red-500 ring-red-200", line: "bg-red-300", text: "text-red-700" },
    skipped: { dot: "bg-gray-200 ring-gray-100", line: "bg-gray-200", text: "text-gray-400" },
  };

  return (
    <div className={cn("flex items-start gap-0 overflow-x-auto py-2", className)}>
      {steps.map((step, i) => {
        const s = statusStyle[step.status] || statusStyle.pending;
        return (
          <div key={i} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1 min-w-[80px]">
              <div className={cn("w-4 h-4 rounded-full ring-2", s.dot)} />
              <span className={cn("text-xs font-medium text-center", s.text)}>{step.label}</span>
              {step.detail && <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[80px]">{step.detail}</span>}
              {step.time && <span className="text-[10px] text-gray-400">{step.time}</span>}
            </div>
            {i < steps.length - 1 && (
              <div className={cn("h-0.5 w-8 mt-2 shrink-0", s.line)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const COLLECTION_PHASES: Record<number, { label: string; color: string }> = {
  1: { label: "تذكير ودي", color: "text-blue-600" },
  2: { label: "تذكير رسمي", color: "text-yellow-600" },
  3: { label: "إشعار إداري", color: "text-orange-600" },
  4: { label: "تصعيد إدارة", color: "text-red-500" },
  5: { label: "إجراء قانوني", color: "text-red-700" },
  6: { label: "شطب", color: "text-gray-600" },
};

export function CollectionStages({ invoiceId, className }: { invoiceId: number; className?: string }) {
  const { data } = useApiQuery<any>(
    ["collection-history", String(invoiceId)],
    `/finance/collection/${invoiceId}/history`,
    !!invoiceId
  );
  const history = asList(data);
  const currentPhase = history.length > 0 ? Math.max(...history.map((h: any) => h.stage || 0)) : 0;

  const steps: StageStep[] = Object.entries(COLLECTION_PHASES).map(([phase, info]) => {
    const phaseNum = Number(phase);
    const entry = history.find((h: any) => h.stage === phaseNum);
    let status: StageStep["status"] = "pending";
    if (entry) status = "completed";
    else if (phaseNum === currentPhase + 1) status = "current";
    return {
      label: info.label,
      status,
      detail: entry?.performedByName,
      time: entry?.createdAt ? formatDateAr(entry.createdAt) : undefined,
    };
  });

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-medium text-gray-600">مراحل التحصيل</p>
      <ProcessStages steps={steps} />
      {currentPhase > 0 && (
        <p className="text-xs text-gray-500">
          المرحلة الحالية: <span className={COLLECTION_PHASES[currentPhase]?.color || ""}>{COLLECTION_PHASES[currentPhase]?.label}</span>
        </p>
      )}
    </div>
  );
}

const WF_ACTION_MAP: Record<string, { icon: typeof Clock; color: string; bg: string; label: string }> = {
  submit: { icon: Send, color: "text-blue-600", bg: "bg-blue-50", label: "تقديم" },
  approve: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", label: "موافقة" },
  reject: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: "رفض" },
  return: { icon: RotateCcw, color: "text-orange-600", bg: "bg-orange-50", label: "إرجاع" },
  refer: { icon: ArrowRight, color: "text-purple-600", bg: "bg-purple-50", label: "إحالة" },
  escalate: { icon: ArrowUpRight, color: "text-yellow-600", bg: "bg-yellow-50", label: "تصعيد" },
};

interface WorkflowTimelineProps {
  instanceId?: number;
  refTable?: string;
  refId?: number;
  className?: string;
}

export function WorkflowTimeline({ instanceId, refTable, refId, className }: WorkflowTimelineProps) {
  const endpoint = instanceId
    ? `/workflows/${instanceId}/timeline`
    : refTable && refId
      ? `/workflows/timeline/${refTable}/${refId}`
      : null;

  const { data } = useApiQuery<any>(
    ["workflow-timeline", String(instanceId ?? ""), String(refTable ?? ""), String(refId ?? "")],
    endpoint!,
    !!endpoint
  );

  const instance = data?.instance;
  const actions = asList(data?.actions);
  const steps = asList(data?.steps);

  if (!instance && !actions.length) {
    return null;
  }

  const stageSteps: StageStep[] = steps.length > 0
    ? [
        { label: "تقديم", status: "completed" as const, time: instance?.createdAt ? formatDateAr(instance.createdAt) : undefined },
        ...steps.map((s: any) => {
          const actionForStep = actions.find((a: any) => a.stepOrder === s.stepOrder && a.action !== "submit");
          let status: StageStep["status"] = "pending";
          if (actionForStep?.action === "approve") status = "completed";
          else if (actionForStep?.action === "reject") status = "rejected";
          else if (s.stepOrder === instance?.currentStepOrder && instance?.status === "pending") status = "current";
          else if (s.stepOrder < (instance?.currentStepOrder ?? 999)) status = "completed";
          return {
            label: s.stepName,
            status,
            detail: actionForStep?.actionByName,
            time: actionForStep?.createdAt ? formatDateAr(actionForStep.createdAt) : undefined,
          };
        }),
      ]
    : [];

  return (
    <div className={cn("space-y-4", className)}>
      {instance && (
        <div className="flex items-center gap-3 flex-wrap">
          <SlaStatusBadge status={instance.slaStatus} />
          {instance.expectedCompletionAt && (
            <span className="text-xs text-gray-400">
              الموعد المتوقع: {formatDateAr(instance.expectedCompletionAt)}
            </span>
          )}
        </div>
      )}

      {stageSteps.length > 0 && <ProcessStages steps={stageSteps} />}

      {actions.length > 0 && (
        <div className="relative">
          <div className="absolute start-4 top-0 bottom-0 w-0.5 bg-gray-200" />
          <div className="space-y-3">
            {actions.map((item: any, i: number) => {
              const actionKey = item.action || "submit";
              const style = WF_ACTION_MAP[actionKey] || WF_ACTION_MAP.submit;
              const Icon = style.icon;
              return (
                <div key={item.id || i} className="relative flex items-start gap-3 ps-9">
                  <div className={cn("absolute start-1.5 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white z-10", style.bg)}>
                    <Icon className={cn("w-3 h-3", style.color)} />
                  </div>
                  <div className="flex-1 min-w-0 bg-gray-50/50 rounded-lg p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{item.stepName || style.label}</span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded", style.bg, style.color)}>{style.label}</span>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{formatTimeAgo(item.createdAt)}</span>
                    </div>
                    {item.actionByName && <p className="text-xs text-gray-500 mt-0.5">بواسطة {item.actionByName}</p>}
                    {item.notes && <p className="text-xs text-gray-600 mt-1">{item.notes}</p>}
                    {item.referredToName && <p className="text-xs text-purple-600 mt-0.5">محال إلى: {item.referredToName}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const SLA_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  normal: { label: "عادي", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
  warning: { label: "قريب من المهلة", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
  exceeded: { label: "تجاوز المهلة", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  escalated: { label: "مُصعّد", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  auto_approved: { label: "موافقة تلقائية", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
};

export function SlaStatusBadge({ status, className }: { status?: string; className?: string }) {
  if (!status) return null;
  const config = SLA_STATUS_CONFIG[status] || SLA_STATUS_CONFIG.normal;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", config.color, config.bg, config.border, className)}>
      {status === "warning" && <AlertTriangle className="w-3 h-3" />}
      {status === "exceeded" && <Clock className="w-3 h-3" />}
      {status === "escalated" && <ArrowUpRight className="w-3 h-3" />}
      {config.label}
    </span>
  );
}
