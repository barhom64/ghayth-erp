import { useState } from "react";
import { useParams } from "wouter";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import type { ExtraTab } from "@/components/shared/detail-page-layout";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { PageStatusBadge, resolveStatus } from "@/components/page-status-badge";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
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
    info: "bg-blue-50 text-blue-700 border-blue-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    success: "bg-green-50 text-green-700 border-green-200",
  };
  return <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", colors[severity])}>{label}</span>;
}

function DeadlineBar({ sessions }: { sessions: any[] }) {
  const upcoming = sessions
    .filter((s: any) => s.sessionDate && new Date(s.sessionDate) >= new Date())
    .sort((a: any, b: any) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime());

  if (upcoming.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-amber-600" />
          <h3 className="font-semibold text-amber-800">المواعيد القادمة</h3>
        </div>
        <div className="space-y-2">
          {upcoming.slice(0, 3).map((s: any, i: number) => {
            const daysLeft = Math.ceil((new Date(s.sessionDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <ChevronRight className="h-4 w-4 text-amber-500" />
                  <span className="text-amber-800">{formatDateAr(s.sessionDate)} — {s.location || "محكمة"}</span>
                </div>
                <Badge className={cn("text-xs", daysLeft <= 3 ? "bg-red-100 text-red-700" : daysLeft <= 7 ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700")}>
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
      <div className="text-center py-8 text-gray-400">
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
                isPast ? "bg-blue-500 border-blue-500" : "bg-white border-amber-400"
              )}>
                {isPast ? <CheckCircle2 className="h-3 w-3 text-white" /> : <Clock className="h-3 w-3 text-amber-500" />}
              </div>
              <div className="flex-1 pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{formatDateAr(e.sessionDate)}</span>
                  {e.result && <Badge variant="outline" className="text-xs">{e.result}</Badge>}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{e.location || "—"} {e.judge ? `• القاضي: ${e.judge}` : ""}</p>
                {e.notes && <p className="text-xs text-gray-400 mt-1 bg-gray-50 rounded p-2">{e.notes}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddSessionForm({ caseId, onSuccess }: { caseId: number; onSuccess: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ sessionDate: "", location: "", judge: "", result: "", notes: "", nextSessionDate: "" });

  const saveMut = useApiMutation<any, typeof form>(
    `/legal/cases/${caseId}/sessions`,
    "POST",
    [["legal-case", String(caseId)], ["legal-cases"]],
    {
      successMessage: "تمت إضافة الجلسة بنجاح",
      onSuccess: () => {
        setForm({ sessionDate: "", location: "", judge: "", result: "", notes: "", nextSessionDate: "" });
        onSuccess();
      },
    }
  );
  const saving = saveMut.isPending;

  const handleSave = () => {
    if (!form.sessionDate) { toast({ variant: "destructive", title: "تاريخ الجلسة مطلوب" }); return; }
    saveMut.mutate(form);
  };

  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <h4 className="font-semibold mb-3 text-sm">إضافة جلسة جديدة</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label className="text-xs">تاريخ الجلسة *</Label><DatePicker value={form.sessionDate} onChange={v => setForm({ ...form, sessionDate: v })} /></div>
          <div><Label className="text-xs">المكان</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="اسم المحكمة" /></div>
          <div><Label className="text-xs">القاضي</Label><Input value={form.judge} onChange={e => setForm({ ...form, judge: e.target.value })} /></div>
          <div><Label className="text-xs">نتيجة الجلسة</Label><Input value={form.result} onChange={e => setForm({ ...form, result: e.target.value })} placeholder="مثال: تأجيل، حكم، مذكرة..." /></div>
          <div><Label className="text-xs">الجلسة التالية</Label><DatePicker value={form.nextSessionDate} onChange={v => setForm({ ...form, nextSessionDate: v })} /></div>
          <div className="md:col-span-2"><Label className="text-xs">ملاحظات</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-blue-700 flex items-start gap-2">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>الأثر المتوقع:</strong> إضافة جلسة ستحدث حالة القضية تلقائياً (مفتوح → جاري) وستُرسل إشعار للمحامي.
          </div>
        </div>
        <Button size="sm" className="mt-3" onClick={handleSave} disabled={saving} rateLimitAware>
          {saving ? "جاري الحفظ..." : "حفظ الجلسة"}
        </Button>
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
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-500" /> أثر كل خطوة</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {impacts.map((imp, i) => (
          <div key={i} className={cn("p-3 rounded-lg text-sm flex items-start gap-2", {
            "bg-blue-50": imp.type === "info",
            "bg-amber-50": imp.type === "warning",
            "bg-red-50": imp.type === "danger",
            "bg-green-50": imp.type === "success",
          })}>
            <span className="text-base">{imp.icon}</span>
            <div>
              <div className={cn("font-medium text-xs", {
                "text-blue-700": imp.type === "info",
                "text-amber-700": imp.type === "warning",
                "text-red-700": imp.type === "danger",
                "text-green-700": imp.type === "success",
              })}>{imp.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{imp.desc}</div>
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
        <Button
          key={t}
          size="sm"
          variant="outline"
          onClick={() => handleTransition(t)}
          className={cn("text-xs gap-1", {
            "border-green-300 text-green-700 hover:bg-green-50": t === "closed" || t === "won",
            "border-red-300 text-red-700 hover:bg-red-50": t === "lost",
            "border-blue-300 text-blue-700 hover:bg-blue-50": t === "in_progress" || t === "judgment",
          })}
        >
          {resolveStatus(t, "legal_case")?.label || t}
        </Button>
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
                <p className="text-xs text-gray-400 mb-1">الحالة</p>
                <PageStatusBadge status={caseData.status} />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">الأولوية</p>
                <PageStatusBadge status={caseData.priority} />
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">نوع القضية</p>
                <span className="text-sm font-medium">{caseData.caseType || "-"}</span>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> المحكمة</p>
                <span className="text-sm">{caseData.court || "-"}</span>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><User className="h-3 w-3" /> الخصم</p>
                <span className="text-sm">{caseData.opposingParty || "-"}</span>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Gavel className="h-3 w-3" /> المحامي</p>
                <span className="text-sm font-medium">{caseData.lawyerName || "-"}</span>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">تاريخ الرفع</p>
                <span className="text-sm">{formatDateAr(caseData.filingDate) || "-"}</span>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">عدد الجلسات</p>
                <span className="text-sm font-bold">{sessions.length}</span>
              </div>
            </div>

            {caseData.description && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-gray-400 mb-1">الوصف</p>
                <p className="text-sm text-gray-600">{caseData.description}</p>
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
            <Button size="sm" onClick={() => setShowAddSession(!showAddSession)}>
              {showAddSession ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />جلسة جديدة</>}
            </Button>
          </div>
          {showAddSession && <AddSessionForm caseId={Number(id)} onSuccess={handleSessionAdded} />}
          {sessions.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-400">
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
                  <Card key={i} className={cn("border", isPast ? "border-gray-200" : "border-amber-200 bg-amber-50/50")}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", isPast ? "bg-blue-100" : "bg-amber-100")}>
                            {isPast ? <CheckCircle2 className="h-4 w-4 text-blue-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{formatDateAr(s.sessionDate)}</span>
                              {!isPast && <Badge className="bg-amber-100 text-amber-700 text-xs">{daysLeft} أيام</Badge>}
                            </div>
                            {s.location && <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{s.location}</p>}
                            {s.judge && <p className="text-xs text-gray-400 mt-0.5">القاضي: {s.judge}</p>}
                            {s.notes && <p className="text-xs text-gray-400 mt-1 bg-gray-50 rounded px-2 py-1">{s.notes}</p>}
                          </div>
                        </div>
                        {s.result && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">{s.result}</Badge>
                        )}
                      </div>
                      {s.nextSessionDate && (
                        <div className="mt-2 pt-2 border-t border-dashed flex items-center gap-1 text-xs text-amber-600">
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

  const riskColors = { low: "bg-gray-50 text-gray-600 border-gray-200", medium: "bg-blue-50 text-blue-700 border-blue-200", high: "bg-orange-50 text-orange-700 border-orange-200", critical: "bg-red-50 text-red-700 border-red-200" };

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
          <CardContent className="p-8 text-center text-gray-400">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">لا توجد مستندات مرتبطة بهذه القضية</p>
            <p className="text-xs mt-1">ارفع مستنداً من صفحة المستندات واربطه بهذه القضية</p>
          </CardContent>
        </Card>
      ) : (
        items.map((d: any) => (
          <Card key={d.id}>
            <CardContent className="p-3 flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{d.title}</p>
                <p className="text-xs text-gray-400">{d.fileName || ""} — {formatDateAr(d.createdAt)}</p>
              </div>
              <PageStatusBadge status={d.status} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
