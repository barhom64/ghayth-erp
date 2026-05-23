import { useState } from "react";
import { z } from "zod";
import { useParams } from "wouter";
import { DetailPageLayout, type ExtraTab } from "@workspace/entity-kit";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageStatusBadge, resolveStatus } from "@/components/page-status-badge";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import {
  FormShell, FormTextField, FormDateField, FormGrid,
} from "@/components/form-shell";
import {
  Gavel, Calendar, FileText, AlertTriangle, Clock,
  CheckCircle2, User, MapPin, TrendingUp, Activity,
  Plus, ChevronRight, Info, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EntityObligations } from "@/components/shared/entity-obligations";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";


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

  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("legal_case", Number(id));

  const { data: caseData, refetch, isLoading, error } = useApiQuery<any>(["legal-case", id], id ? `/legal/cases/${id}` : null);

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

  const sessions = caseData?.sessions || [];

  const handleSessionAdded = () => {
    setShowAddSession(false);
    refetch();
    qc.invalidateQueries({ queryKey: ["legal-cases"] });
    qc.invalidateQueries({ queryKey: ["legal-stats"] });
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
      key: "case-documents",
      label: "مستندات القضية",
      icon: FileText,
      content: () => <DocumentsSection caseId={Number(id)} caseTitle={caseData?.title || ""} />,
    },
  ];

  return (
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
