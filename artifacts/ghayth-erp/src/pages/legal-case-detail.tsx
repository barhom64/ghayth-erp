import { useState } from "react";
import { z } from "zod";
import { useParams } from "wouter";
import { DetailPageLayout, type ExtraTab } from "@workspace/entity-kit";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { PrintButton } from "@/components/shared/print-button";
import { ClientPortalLinkCard } from "@/components/shared/client-portal-link-card";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PageStatusBadge,
  resolveStatus,
  FormShell,
  FormTextField,
  FormDateField,
  FormNumberField,
  FormSelectField,
  FormTextareaField,
  FormGrid,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import {
  Gavel, Calendar, FileText, AlertTriangle, Clock,
  CheckCircle2, User, MapPin, TrendingUp, Activity,
  Plus, ChevronRight, Info, X, Scale, Mail, DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EntityObligations } from "@/components/shared/entity-obligations";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";


const STEP_IMPACTS: Record<string, { icon: string; title: string; description: string; severity: "info" | "warning" | "danger" | "success" }> = {
  session_added: { icon: "⚖️", title: "جلسة جديدة", description: "تحديث حالة القضية وإشعار المحامي", severity: "info" },
  judgment: { icon: "📋", title: "حكم قضائي", description: "أثر مالي محتمل — تعويض أو غرامة", severity: "warning" },
  delay: { icon: "⏰", title: "تأخير جلسة", description: "تنبيه خطر — تأجيل يرفع تكلفة القضية", severity: "danger" },
  closed_won: { icon: "✅", title: "القضية مغلقة — ربح", description: "تحسين تقرير المخاطر القانونية", severity: "success" },
  closed_lost: { icon: "❌", title: "القضية مغلقة — خسارة", description: "ينتج التزام مالي — تعويض أو غرامة", severity: "danger" },
  notice_sent: { icon: "📨", title: "إنذار صادر", description: "تصعيد — إشعار الإدارة العليا مطلوب", severity: "warning" },
};

function ImpactBadge({ severity, label }: { severity: "info" | "warning" | "danger" | "success"; label: string }) {
  const colors = {
    info: "bg-status-info-surface text-status-info-foreground border-status-info-surface",
    warning: "bg-status-warning-surface text-status-warning-foreground border-status-warning-surface",
    danger: "bg-status-error-surface text-status-error-foreground border-status-error-surface",
    success: "bg-status-success-surface text-status-success-foreground border-status-success-surface",
  };
  return <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", colors[severity])}>{label}</span>;
}

function DeadlineBar({ sessions }: { sessions: any[] }) {
  const upcoming = sessions
    .filter((s: any) => s.sessionDate && new Date(s.sessionDate) >= new Date())
    .sort((a: any, b: any) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime());

  if (upcoming.length === 0) return null;

  return (
    <Card className="border-status-warning-surface bg-status-warning-surface">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-status-warning-foreground" />
          <h3 className="font-semibold text-status-warning-foreground">المواعيد القادمة</h3>
        </div>
        <div className="space-y-2">
          {upcoming.slice(0, 3).map((s: any, i: number) => {
            const daysLeft = Math.ceil((new Date(s.sessionDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <ChevronRight className="h-4 w-4 text-status-warning" />
                  <span className="text-status-warning-foreground">{formatDateAr(s.sessionDate)} — {s.location || "محكمة"}</span>
                </div>
                <Badge className={cn("text-xs", daysLeft <= 3 ? "bg-status-error-surface text-status-error-foreground" : daysLeft <= 7 ? "bg-orange-100 text-orange-700" : "bg-status-warning-surface text-status-warning-foreground")}>
                  {daysLeft} أيام
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CaseTimeline({ sessions }: { sessions: any[] }) {
  const events = [...sessions].sort((a: any, b: any) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">لا توجد أحداث بعد</p>
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="absolute end-4 top-0 bottom-0 w-0.5 bg-gray-200" />
      <div className="space-y-4">
        {events.map((e: any, i: number) => {
          const isPast = new Date(e.sessionDate) < new Date();
          return (
            <div key={i} className="relative flex items-start gap-4 pr-10">
              <div className={cn(
                "absolute end-2 w-5 h-5 rounded-full border-2 flex items-center justify-center",
                isPast ? "bg-status-info-surface0 border-blue-500" : "bg-white border-amber-400"
              )}>
                {isPast ? <CheckCircle2 className="h-3 w-3 text-white" /> : <Clock className="h-3 w-3 text-status-warning" />}
              </div>
              <div className="flex-1 pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{formatDateAr(e.sessionDate)}</span>
                  {e.result && <Badge variant="outline" className="text-xs">{e.result}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{e.location || "—"} {e.judge ? `• القاضي: ${e.judge}` : ""}</p>
                {e.notes && <p className="text-xs text-muted-foreground mt-1 bg-surface-subtle rounded p-2">{e.notes}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Schemas for the case sub-resource forms ──────────────────────────────
// Each schema mirrors the backend's create*Schema in routes/legal.ts.

const judgmentSchema = z.object({
  judgmentDate: z.string().min(1, "تاريخ الحكم مطلوب"),
  verdict: z.string().min(1, "نص الحكم مطلوب"),
  judgmentType: z.string().trim(),
  amount: z.coerce.number(),
  paidAmount: z.coerce.number(),
  dueDate: z.string(),
  notes: z.string().trim(),
});
type JudgmentForm = z.infer<typeof judgmentSchema>;
const defaultJudgmentForm: JudgmentForm = {
  judgmentDate: "", verdict: "", judgmentType: "", amount: 0, paidAmount: 0, dueDate: "", notes: "",
};

const correspondenceSchema = z.object({
  direction: z.enum(["outgoing", "incoming"]),
  subject: z.string().min(1, "الموضوع مطلوب"),
  parties: z.string().trim(),
  correspondenceDate: z.string(),
  documentRef: z.string().trim(),
  notes: z.string().trim(),
});
type CorrespondenceForm = z.infer<typeof correspondenceSchema>;
const defaultCorrespondenceForm: CorrespondenceForm = {
  direction: "outgoing", subject: "", parties: "", correspondenceDate: "", documentRef: "", notes: "",
};

const caseCostSchema = z.object({
  amount: z.coerce.number().positive("المبلغ مطلوب وأكبر من صفر"),
  type: z.string().min(1, "نوع التكلفة مطلوب"),
  notes: z.string().trim(),
});
type CaseCostForm = z.infer<typeof caseCostSchema>;
const defaultCaseCostForm: CaseCostForm = {
  amount: 0, type: "", notes: "",
};

function AddJudgmentForm({ caseId, onSuccess }: { caseId: number; onSuccess: () => void }) {
  const saveMut = useApiMutation<unknown, JudgmentForm>(
    `/legal/cases/${caseId}/judgments`,
    "POST",
    [["legal-case", String(caseId)], ["legal-case-judgments", String(caseId)]],
    { successMessage: "تم تسجيل الحكم", onSuccess },
  );
  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <h4 className="font-semibold mb-3 text-sm">إضافة حكم جديد</h4>
        <FormShell
          schema={judgmentSchema}
          defaultValues={defaultJudgmentForm}
          submitLabel="حفظ الحكم"
          onSubmit={async (values, ctx) => {
            await saveMut.mutateAsync(values);
            ctx.reset();
          }}
        >
          <FormGrid cols={2}>
            <FormDateField name="judgmentDate" label="تاريخ الحكم" required />
            <FormTextField name="judgmentType" label="نوع الحكم" placeholder="ابتدائي / استئنافي / تنفيذ" />
            <FormTextareaField name="verdict" label="نص الحكم" required className="md:col-span-2" />
            <FormNumberField name="amount" label="قيمة الحكم" />
            <FormNumberField name="paidAmount" label="المسدد" />
            <FormDateField name="dueDate" label="تاريخ الاستحقاق" />
            <FormTextareaField name="notes" label="ملاحظات" className="md:col-span-2" />
          </FormGrid>
        </FormShell>
      </CardContent>
    </Card>
  );
}

function AddCorrespondenceForm({ caseId, onSuccess }: { caseId: number; onSuccess: () => void }) {
  const saveMut = useApiMutation<unknown, CorrespondenceForm>(
    `/legal/cases/${caseId}/correspondence`,
    "POST",
    [["legal-case", String(caseId)], ["legal-case-correspondence", String(caseId)]],
    { successMessage: "تم تسجيل المراسلة", onSuccess },
  );
  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <h4 className="font-semibold mb-3 text-sm">إضافة مراسلة جديدة</h4>
        <FormShell
          schema={correspondenceSchema}
          defaultValues={defaultCorrespondenceForm}
          submitLabel="حفظ المراسلة"
          onSubmit={async (values, ctx) => {
            await saveMut.mutateAsync(values);
            ctx.reset();
          }}
        >
          <FormGrid cols={2}>
            <FormSelectField
              name="direction"
              label="الاتجاه"
              options={[
                { value: "outgoing", label: "صادرة" },
                { value: "incoming", label: "واردة" },
              ]}
            />
            <FormDateField name="correspondenceDate" label="تاريخ المراسلة" />
            <FormTextField name="subject" label="الموضوع" required className="md:col-span-2" />
            <FormTextField name="parties" label="الأطراف" />
            <FormTextField name="documentRef" label="مرجع المستند" />
            <FormTextareaField name="notes" label="ملاحظات" className="md:col-span-2" />
          </FormGrid>
        </FormShell>
      </CardContent>
    </Card>
  );
}

function AddCostForm({ caseId, onSuccess }: { caseId: number; onSuccess: () => void }) {
  const saveMut = useApiMutation<unknown, CaseCostForm>(
    `/legal/cases/${caseId}/costs`,
    "POST",
    [["legal-case", String(caseId)]],
    { successMessage: "تم تسجيل التكلفة", onSuccess },
  );
  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <h4 className="font-semibold mb-3 text-sm">إضافة تكلفة جديدة</h4>
        <FormShell
          schema={caseCostSchema}
          defaultValues={defaultCaseCostForm}
          submitLabel="حفظ التكلفة"
          onSubmit={async (values, ctx) => {
            await saveMut.mutateAsync(values);
            ctx.reset();
          }}
        >
          <FormGrid cols={2}>
            <FormSelectField
              name="type"
              label="نوع التكلفة"
              options={[
                { value: "lawyer_fee", label: "أتعاب محامي" },
                { value: "court_fee", label: "رسوم محكمة" },
                { value: "expert_fee", label: "أتعاب خبير" },
                { value: "translation", label: "ترجمة" },
                { value: "other", label: "أخرى" },
              ]}
            />
            <FormNumberField name="amount" label="المبلغ" />
            <FormTextareaField name="notes" label="ملاحظات" className="md:col-span-2" />
          </FormGrid>
        </FormShell>
      </CardContent>
    </Card>
  );
}

// sessionDate required (was a bare toast guard on submit).
const sessionSchema = z.object({
  sessionDate: z.string().min(1, "تاريخ الجلسة مطلوب"),
  location: z.string().trim(),
  judge: z.string().trim(),
  result: z.string().trim(),
  notes: z.string().trim(),
  nextSessionDate: z.string(),
});
type SessionForm = z.infer<typeof sessionSchema>;
const defaultSessionForm: SessionForm = {
  sessionDate: "", location: "", judge: "", result: "", notes: "", nextSessionDate: "",
};

function AddSessionForm({ caseId, onSuccess }: { caseId: number; onSuccess: () => void }) {
  const saveMut = useApiMutation<any, SessionForm>(
    `/legal/cases/${caseId}/sessions`,
    "POST",
    [["legal-case", String(caseId)], ["legal-cases"]],
    {
      successMessage: "تمت إضافة الجلسة بنجاح",
      onSuccess,
    },
  );

  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <h4 className="font-semibold mb-3 text-sm">إضافة جلسة جديدة</h4>
        <FormShell
          schema={sessionSchema}
          defaultValues={defaultSessionForm}
          submitLabel="حفظ الجلسة"
          onSubmit={async (values, ctx) => {
            await saveMut.mutateAsync(values);
            ctx.reset();
          }}
        >
          <FormGrid cols={2}>
            <FormDateField name="sessionDate" label="تاريخ الجلسة" required />
            <FormTextField name="location" label="المكان" placeholder="اسم المحكمة" />
            <FormTextField name="judge" label="القاضي" />
            <FormTextField name="result" label="نتيجة الجلسة" placeholder="مثال: تأجيل، حكم، مذكرة..." />
            <FormDateField name="nextSessionDate" label="الجلسة التالية" />
            <FormTextField name="notes" label="ملاحظات" className="md:col-span-2" />
          </FormGrid>
          <div className="mt-3 p-3 bg-status-info-surface rounded-lg text-xs text-status-info-foreground flex items-start gap-2">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>الأثر المتوقع:</strong> إضافة جلسة ستحدث حالة القضية تلقائياً (مفتوح → جاري) وستُرسل إشعار للمحامي.
            </div>
          </div>
        </FormShell>
      </CardContent>
    </Card>
  );
}

function StepImpactPanel({ caseStatus }: { caseStatus: string }) {
  const impacts: { icon: string; title: string; desc: string; type: "info" | "warning" | "danger" | "success" }[] = [];

  if (caseStatus === "open") {
    impacts.push({ icon: "⚖️", title: "أول جلسة تحول القضية للجاري", desc: "حالة القضية تتغير تلقائياً عند إضافة الجلسة الأولى", type: "info" });
  }
  if (caseStatus === "in_progress") {
    impacts.push({ icon: "📅", title: "تأخير الجلسة", desc: "تأجيل يزيد تكاليف المحامي ويرفع مستوى الخطر", type: "warning" });
    impacts.push({ icon: "📋", title: "نتيجة الجلسة → حكم", desc: "الحكم قد ينتج أثر مالي (تعويض أو غرامة)", type: "warning" });
  }
  if (caseStatus === "judgment") {
    impacts.push({ icon: "💰", title: "حكم بالتعويض أو الغرامة", desc: "يُنشئ تلقائياً التزام مالي في سجل الشركة", type: "danger" });
    impacts.push({ icon: "🔄", title: "التنفيذ يتبع الحكم", desc: "بعد الحكم يمكن الانتقال لمرحلة التنفيذ", type: "info" });
  }
  if (caseStatus === "closed") {
    impacts.push({ icon: "📊", title: "تحديث تقرير المخاطر", desc: "ملف القضية يُغلق ويُضاف للسجل القانوني للشركة", type: "info" });
  }

  if (impacts.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-status-info" /> أثر كل خطوة</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {impacts.map((imp, i) => (
          <div key={i} className={cn("p-3 rounded-lg text-sm flex items-start gap-2", {
            "bg-status-info-surface": imp.type === "info",
            "bg-status-warning-surface": imp.type === "warning",
            "bg-status-error-surface": imp.type === "danger",
            "bg-status-success-surface": imp.type === "success",
          })}>
            <span className="text-base">{imp.icon}</span>
            <div>
              <div className={cn("font-medium text-xs", {
                "text-status-info-foreground": imp.type === "info",
                "text-status-warning-foreground": imp.type === "warning",
                "text-status-error-foreground": imp.type === "danger",
                "text-status-success-foreground": imp.type === "success",
              })}>{imp.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{imp.desc}</div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function LegalCaseDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAddSession, setShowAddSession] = useState(false);
  const [showAddJudgment, setShowAddJudgment] = useState(false);
  const [showAddCorrespondence, setShowAddCorrespondence] = useState(false);
  const [showAddCost, setShowAddCost] = useState(false);
  const [viewCorrespondenceId, setViewCorrespondenceId] = useState<number | null>(null);
  const [manualRiskInput, setManualRiskInput] = useState("");
  const [confirmCloseCase, setConfirmCloseCase] = useState(false);

  // GET /legal/correspondence/:id — full correspondence row including
  // its parent caseNumber/caseTitle. Used when the user clicks a row in
  // the correspondence tab.
  const { data: corrDetail } = useApiQuery<any>(
    ["legal-correspondence", String(viewCorrespondenceId)],
    viewCorrespondenceId ? `/legal/correspondence/${viewCorrespondenceId}` : null,
    !!viewCorrespondenceId,
  );

  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("legal_case", Number(id));

  const { data: caseData, refetch, isLoading, error } = useApiQuery<any>(["legal-case", id], `/legal/cases/${id}`);

  // Sub-resource fetches — each endpoint is dedicated and case-scoped.
  // Kept independent from the main caseData payload so adding a judgment
  // or correspondence row doesn't have to refetch the whole case header.
  const { data: judgmentsResp, refetch: refetchJudgments } = useApiQuery<any>(
    ["legal-case-judgments", id],
    `/legal/cases/${id}/judgments`,
    !!id,
  );
  const { data: correspondenceResp, refetch: refetchCorrespondence } = useApiQuery<any>(
    ["legal-case-correspondence", id],
    `/legal/cases/${id}/correspondence`,
    !!id,
  );
  // Dedicated sessions endpoint — falls back to caseData.sessions if the
  // main payload still embeds them, but lets us refresh sessions without
  // refetching the entire case header.
  const { data: sessionsResp, refetch: refetchSessions } = useApiQuery<any>(
    ["legal-case-sessions", id],
    `/legal/cases/${id}/sessions`,
    !!id,
  );
  const judgments: any[] = asList(judgmentsResp?.data ?? judgmentsResp);
  const correspondence: any[] = asList(correspondenceResp?.data ?? correspondenceResp);

  // PATCH /legal/cases/:id/financial-risk — adjusts the case's posted
  // financial-risk amount independently from the status flow. Required
  // for re-estimates when the risk assessment changes mid-case.
  const financialRiskMut = useApiMutation<any, { amount: number; notes?: string }>(
    () => `/legal/cases/${id}/financial-risk`,
    "PATCH",
    [["legal-case", String(id)]],
    { successMessage: "تم تحديث المخاطر المالية" },
  );

  const transitionMut = useApiMutation<any, { status: string }>(
    () => `/legal/cases/${id}`,
    "PATCH",
    [["legal-case", String(id)], ["legal-cases"]],
    {
      successMessage: false,
      onSuccess: (_d, body) => {
        toast({ title: `تم تحديث حالة القضية إلى: ${resolveStatus(body.status, "legal_case")?.label || body.status}` });
      },
    }
  );

  // Dedicated /close endpoint (vs. the generic status PATCH) so the
  // backend can run lifecycle side-effects (lawyer notification, risk
  // closure, audit row) that wouldn't fire on a plain status change.
  const closeMut = useApiMutation<any, { reason?: string }>(
    `/legal/cases/${id}/close`,
    "POST",
    [["legal-case", String(id)], ["legal-cases"]],
    { successMessage: "تم إغلاق القضية", onSuccess: () => refetch() },
  );

  const sessions = asList(sessionsResp?.data ?? sessionsResp) || caseData?.sessions || [];

  const handleSessionAdded = () => {
    setShowAddSession(false);
    refetchSessions();
    refetch();
    qc.invalidateQueries({ queryKey: ["legal-cases"] });
    qc.invalidateQueries({ queryKey: ["legal-stats"] });
  };

  const handleJudgmentAdded = () => {
    setShowAddJudgment(false);
    refetchJudgments();
    refetch();
  };
  const handleCorrespondenceAdded = () => {
    setShowAddCorrespondence(false);
    refetchCorrespondence();
  };
  const handleCostAdded = () => {
    setShowAddCost(false);
    refetch();
  };

  const handleClose = () => {
    setConfirmCloseCase(true);
  };
  const confirmedClose = () => {
    setConfirmCloseCase(false);
    closeMut.mutate({});
  };

  const handleTransition = (newStatus: string) => {
    transitionMut.mutate({ status: newStatus });
  };

  const allowedTransitions: string[] = caseData?.allowedTransitions || [];

  // --- Status mapping for DetailPageLayout ---
  const statusToneMap: Record<string, "default" | "success" | "warning" | "destructive" | "info" | "muted"> = {
    open: "info",
    in_progress: "warning",
    judgment: "warning",
    won: "success",
    closed: "muted",
    lost: "destructive",
  };

  // --- Actions (header buttons) ---
  const actions = (
    <div className="flex items-center gap-2 flex-wrap">
      {allowedTransitions.map((t: string) => (
        <GuardedButton
          perm="legal:create"
          key={t}
          size="sm"
          variant="outline"
          onClick={() => handleTransition(t)}
          className={cn("text-xs gap-1", {
            "border-status-success-surface text-status-success-foreground hover:bg-status-success-surface": t === "closed" || t === "won",
            "border-status-error-surface text-status-error-foreground hover:bg-status-error-surface": t === "lost",
            "border-status-info-surface text-status-info-foreground hover:bg-status-info-surface": t === "in_progress" || t === "judgment",
          })}
        >
          {resolveStatus(t, "legal_case")?.label || t}
        </GuardedButton>
      ))}
      {caseData && caseData.status !== "closed" && (
        <GuardedButton
          perm="legal.cases:update"
          size="sm"
          variant="outline"
          className="text-xs gap-1 text-status-error-foreground"
          onClick={handleClose}
          disabled={closeMut.isPending}
          title="إغلاق نهائي للقضية (يُفعّل آثارًا تلقائية: إشعار المحامي، إغلاق المخاطر)"
        >
          <X className="h-3 w-3" />
          إغلاق القضية
        </GuardedButton>
      )}
      <PrintButton entityType="legal_judgment" entityId={id ?? ""} />
    </div>
  );

  // --- Overview content (main info card + deadline bar + sidebar panels) ---
  const overview = caseData ? (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardContent className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">الحالة</p>
                <PageStatusBadge status={caseData.status} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">الأولوية</p>
                <PageStatusBadge status={caseData.priority} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">نوع القضية</p>
                <span className="text-sm font-medium">{caseData.caseType || "-"}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> المحكمة</p>
                <span className="text-sm">{caseData.court || "-"}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><User className="h-3 w-3" /> الخصم</p>
                <span className="text-sm">{caseData.opposingParty || "-"}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Gavel className="h-3 w-3" /> المحامي</p>
                <span className="text-sm font-medium">{caseData.lawyerName || "-"}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">تاريخ الرفع</p>
                <span className="text-sm">{formatDateAr(caseData.filingDate) || "-"}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">عدد الجلسات</p>
                <span className="text-sm font-bold">{sessions.length}</span>
              </div>
            </div>

            {caseData.description && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-1">الوصف</p>
                <p className="text-sm text-muted-foreground">{caseData.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <DeadlineBar sessions={sessions} />

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">التسلسل الزمني للقضية</CardTitle></CardHeader>
          <CardContent>
            <CaseTimeline sessions={sessions} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <StepImpactPanel caseStatus={caseData.status} />
        <RiskPanel caseData={caseData} sessions={sessions} />
        {id && (
          <ClientPortalLinkCard
            entityType="legal_case"
            entityId={Number(id)}
            patchPath={`/legal/cases/${id}`}
            linkedClientId={caseData.clientId ?? null}
            linkedClientName={caseData.clientName ?? null}
            perm="legal.cases:update"
            onUpdated={refetch}
            invalidateKeys={[["legal-case", String(id)], ["legal-cases"]]}
          />
        )}
        {id && <EntityObligations entityType="legal-case" entityId={Number(id)} hideWhenEmpty />}
      </div>
    </div>
  ) : null;

  // --- Extra tabs: sessions, case documents ---
  const extraTabs: ExtraTab[] = [
    {
      key: "sessions",
      label: "الجلسات",
      icon: Calendar,
      badge: sessions.length || undefined,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">الجلسات</h3>
            <GuardedButton perm="legal:create" size="sm" onClick={() => setShowAddSession(!showAddSession)}>
              {showAddSession ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />جلسة جديدة</>}
            </GuardedButton>
          </div>
          {showAddSession && <AddSessionForm caseId={Number(id)} onSuccess={handleSessionAdded} />}
          {sessions.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا توجد جلسات مسجلة</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {[...sessions].sort((a: any, b: any) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime()).map((s: any, i: number) => {
                const isPast = new Date(s.sessionDate) < new Date();
                const daysLeft = Math.ceil((new Date(s.sessionDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <Card key={i} className={cn("border", isPast ? "border-border" : "border-status-warning-surface bg-status-warning-surface/50")}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", isPast ? "bg-status-info-surface" : "bg-status-warning-surface")}>
                            {isPast ? <CheckCircle2 className="h-4 w-4 text-status-info-foreground" /> : <Clock className="h-4 w-4 text-status-warning-foreground" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{formatDateAr(s.sessionDate)}</span>
                              {!isPast && <Badge className="bg-status-warning-surface text-status-warning-foreground text-xs">{daysLeft} أيام</Badge>}
                            </div>
                            {s.location && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{s.location}</p>}
                            {s.judge && <p className="text-xs text-muted-foreground mt-0.5">القاضي: {s.judge}</p>}
                            {s.notes && <p className="text-xs text-muted-foreground mt-1 bg-surface-subtle rounded px-2 py-1">{s.notes}</p>}
                          </div>
                        </div>
                        {s.result && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">{s.result}</Badge>
                        )}
                      </div>
                      {s.nextSessionDate && (
                        <div className="mt-2 pt-2 border-t border-dashed flex items-center gap-1 text-xs text-status-warning-foreground">
                          <Calendar className="h-3 w-3" />
                          الجلسة التالية: {formatDateAr(s.nextSessionDate)}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "judgments",
      label: "الأحكام",
      icon: Scale,
      badge: judgments.length || undefined,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">أحكام القضية</h3>
            <GuardedButton perm="legal:create" size="sm" onClick={() => setShowAddJudgment(!showAddJudgment)}>
              {showAddJudgment ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />حكم جديد</>}
            </GuardedButton>
          </div>
          {showAddJudgment && <AddJudgmentForm caseId={Number(id)} onSuccess={handleJudgmentAdded} />}
          {judgments.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Scale className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا توجد أحكام مسجلة</p>
              </CardContent>
            </Card>
          ) : (
            <DataTable
              columns={[
                { key: "judgmentDate", header: "تاريخ الحكم", sortable: true, render: (j) => formatDateAr(j.judgmentDate) },
                { key: "judgmentType", header: "النوع", render: (j) => j.judgmentType || "—" },
                { key: "verdict", header: "نص الحكم", render: (j) => <span className="text-xs">{j.verdict}</span> },
                { key: "amount", header: "القيمة", sortable: true, render: (j) => j.amount ? formatCurrency(Number(j.amount)) : "—" },
                { key: "paidAmount", header: "المسدد", render: (j) => j.paidAmount ? formatCurrency(Number(j.paidAmount)) : "—" },
                { key: "dueDate", header: "الاستحقاق", render: (j) => j.dueDate ? formatDateAr(j.dueDate) : "—" },
              ] as DataTableColumn<any>[]}
              data={judgments}
              noToolbar
              pageSize={10}
            />
          )}
        </div>
      ),
    },
    {
      key: "correspondence",
      label: "المراسلات",
      icon: Mail,
      badge: correspondence.length || undefined,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">مراسلات القضية</h3>
            <GuardedButton perm="legal:create" size="sm" onClick={() => setShowAddCorrespondence(!showAddCorrespondence)}>
              {showAddCorrespondence ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />مراسلة جديدة</>}
            </GuardedButton>
          </div>
          {showAddCorrespondence && <AddCorrespondenceForm caseId={Number(id)} onSuccess={handleCorrespondenceAdded} />}
          {correspondence.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا توجد مراسلات مسجلة</p>
              </CardContent>
            </Card>
          ) : (
            <DataTable
              columns={[
                { key: "correspondenceDate", header: "التاريخ", sortable: true, render: (c) => formatDateAr(c.correspondenceDate) },
                { key: "direction", header: "الاتجاه", render: (c) => (
                  <Badge variant="outline">{c.direction === "outgoing" ? "صادرة" : "واردة"}</Badge>
                )},
                { key: "subject", header: "الموضوع", render: (c) => <span className="text-xs">{c.subject}</span> },
                { key: "parties", header: "الأطراف", render: (c) => c.parties || "—" },
                { key: "documentRef", header: "المرجع", render: (c) => c.documentRef ? <span className="font-mono text-xs">{c.documentRef}</span> : "—" },
              ] as DataTableColumn<any>[]}
              data={correspondence}
              noToolbar
              pageSize={10}
              onRowClick={(r) => setViewCorrespondenceId(r.id)}
            />
          )}
          {viewCorrespondenceId && (
            <Card className="border-dashed">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">تفاصيل المراسلة</CardTitle>
                <button
                  type="button"
                  className="text-xs text-muted-foreground"
                  onClick={() => setViewCorrespondenceId(null)}
                >
                  إغلاق ×
                </button>
              </CardHeader>
              <CardContent>
                {corrDetail ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">الموضوع:</span><span className="font-medium">{corrDetail.subject}</span></div>
                    <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">التاريخ:</span><span>{corrDetail.correspondenceDate ? formatDateAr(corrDetail.correspondenceDate) : "—"}</span></div>
                    <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">الاتجاه:</span><Badge variant="outline">{corrDetail.direction === "outgoing" ? "صادرة" : "واردة"}</Badge></div>
                    <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">الأطراف:</span><span>{corrDetail.parties ?? "—"}</span></div>
                    <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">المرجع:</span><span className="font-mono text-xs">{corrDetail.documentRef ?? "—"}</span></div>
                    {corrDetail.notes && (
                      <div className="pt-1">
                        <p className="text-muted-foreground text-xs">ملاحظات</p>
                        <p className="whitespace-pre-wrap">{corrDetail.notes}</p>
                      </div>
                    )}
                  </div>
                ) : <LoadingSpinner />}
              </CardContent>
            </Card>
          )}
        </div>
      ),
    },
    {
      key: "costs",
      label: "التكاليف",
      icon: DollarSign,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">تكاليف القضية</h3>
            <GuardedButton perm="legal:create" size="sm" onClick={() => setShowAddCost(!showAddCost)}>
              {showAddCost ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />تكلفة جديدة</>}
            </GuardedButton>
          </div>
          {showAddCost && <AddCostForm caseId={Number(id)} onSuccess={handleCostAdded} />}
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
              <div>
                مجموع المخاطر المالية المتراكم على القضية:
                <span className="font-bold text-status-error-foreground ms-2">
                  {formatCurrency(Number(caseData?.financialRisk || 0))}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                إضافة تكلفة جديدة تُراكم القيمة على financialRisk الإجمالي للقضية.
              </p>
              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-xs whitespace-nowrap">تعديل يدوي:</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={manualRiskInput}
                  onChange={(e) => setManualRiskInput(e.target.value)}
                  placeholder={String(caseData?.financialRisk ?? 0)}
                  className="h-8 text-xs w-32"
                />
                <GuardedButton
                  perm="legal.cases:update"
                  variant="outline"
                  size="sm"
                  rateLimitAware
                  disabled={financialRiskMut.isPending || manualRiskInput.trim() === ""}
                  onClick={() => {
                    const amount = Number(manualRiskInput);
                    if (!Number.isFinite(amount) || amount < 0) {
                      toast({ variant: "destructive", title: "قيمة غير صالحة" });
                      return;
                    }
                    financialRiskMut.mutate({ amount });
                    setManualRiskInput("");
                  }}
                >
                  تحديث المخاطر
                </GuardedButton>
              </div>
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      key: "case-documents",
      label: "مستندات القضية",
      icon: FileText,
      content: () => <DocumentsSection caseId={Number(id)} caseTitle={caseData?.title || ""} />,
    },
  ];

  return (
    <>
    <DetailPageLayout
      title={caseData?.title || ""}
      subtitle={caseData?.caseNumber || undefined}
      backPath="/legal/cases"
      backLabel="القضايا"
      status={caseData ? {
        label: resolveStatus(caseData.status, "legal_case")?.label || caseData.status,
        tone: statusToneMap[caseData.status] || "default",
      } : undefined}
      refNumber={caseData?.caseNumber || undefined}
      createdAt={caseData?.createdAt}
      updatedAt={caseData?.updatedAt}
      entityType="legal-case"
      entityId={Number(id)}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={actions}
      overview={overview}
      extraTabs={[...extraTabs, ...registryExtraTabs]}
      hideTabs={registryHideTabs}
    />
    <ConfirmActionDialog
      open={confirmCloseCase}
      onOpenChange={(o) => !o && setConfirmCloseCase(false)}
      variant="destructive"
      title="تأكيد إغلاق القضية"
      description="سيتم إغلاق القضية وتشغيل side-effects (إشعار المحامي، إغلاق المخاطر، تسجيل audit row). متابعة؟"
      confirmLabel="تأكيد الإغلاق"
      onConfirm={confirmedClose}
    />
    </>
  );
}

function RiskPanel({ caseData, sessions }: { caseData: any; sessions: any[] }) {
  const upcoming = sessions.filter((s: any) => new Date(s.sessionDate) >= new Date());
  const overdue = sessions.filter((s: any) => {
    const d = new Date(s.sessionDate);
    return d < new Date() && !s.result;
  });

  const risks: { level: "low" | "medium" | "high" | "critical"; text: string }[] = [];

  if (caseData.priority === "high" || caseData.priority === "critical") {
    risks.push({ level: "high", text: "قضية بأولوية عالية — تتطلب متابعة يومية" });
  }
  if (overdue.length > 0) {
    risks.push({ level: "critical", text: `${overdue.length} جلسة بدون نتيجة مسجلة — خطر تأخير` });
  }
  if (upcoming.length === 0 && caseData.status === "in_progress") {
    risks.push({ level: "high", text: "لا جلسة مجدولة — يجب تحديد موعد الجلسة التالية" });
  }
  if (upcoming.length > 0) {
    const nextDays = Math.ceil((new Date(upcoming[0].sessionDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (nextDays <= 3) risks.push({ level: "critical", text: `جلسة خلال ${nextDays} أيام — تحضير فوري مطلوب` });
    else if (nextDays <= 7) risks.push({ level: "medium", text: `جلسة خلال ${nextDays} أيام` });
  }

  const riskColors = { low: "bg-surface-subtle text-muted-foreground border-border", medium: "bg-status-info-surface text-status-info-foreground border-status-info-surface", high: "bg-orange-50 text-orange-700 border-orange-200", critical: "bg-status-error-surface text-status-error-foreground border-status-error-surface" };

  if (risks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" /> مؤشرات الخطر
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {risks.map((r, i) => (
          <div key={i} className={cn("text-xs p-2.5 rounded-lg border", riskColors[r.level])}>
            {r.text}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DocumentsSection({ caseId, caseTitle }: { caseId: number; caseTitle: string }) {
  const { data: docsResp } = useApiQuery<any>(
    ["case-docs", String(caseId)],
    `/documents?entity=legal_case&entityId=${caseId}`
  );
  const items = asList(docsResp);

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">لا توجد مستندات مرتبطة بهذه القضية</p>
            <p className="text-xs mt-1">ارفع مستنداً من صفحة المستندات واربطه بهذه القضية</p>
          </CardContent>
        </Card>
      ) : (
        items.map((d: any) => (
          <Card key={d.id}>
            <CardContent className="p-3 flex items-center gap-3">
              <FileText className="h-8 w-8 text-status-info flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{d.title}</p>
                <p className="text-xs text-muted-foreground">{d.fileName || ""} — {formatDateAr(d.createdAt)}</p>
              </div>
              <PageStatusBadge status={d.status} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
