// PR-4 (#2077) — Institutional employee score detail page.
//
// Reads from the two new HR-side routes:
//   - GET  /employees/:id/scoring/history  (full history + rationale)
//   - POST /employees/:id/scoring/recompute (on-demand re-score)
//
// Shows the latest score's composite + 6 dimension bars + the stored
// rationale text per dimension (so HR can answer «لماذا 65؟» directly)
// + raw counters + history list + the «إعادة الحساب الآن» action.
//
// No new engine — the page wraps the existing employeeScoringEngine.
// «يظهر سبب الدرجة بالكامل» (مطلب المراجع) يتحقق هنا عبر عرض الحقول
// `rationale` و `rawCounters` و `weightsUsed` كما خزّنها المحرّك.
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GuardedButton } from "@/components/shared/permission-gate";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Shield, Activity,
  CheckCircle, AlertCircle, UserCheck, GraduationCap, ArrowLeft,
} from "lucide-react";

interface ScoreRow {
  scope: string;
  periodKey: string;
  compositeScore: string;
  trend: number;
  disciplineScore: string;
  activityScore: string;
  productivityScore: string;
  qualityScore: string;
  managerScore: string;
  developmentScore: string;
  rationale: Record<string, string>;
  weightsUsed: Record<string, number>;
  rawCounters: Record<string, number>;
  computedAt: string;
}

interface EmployeeBasics {
  id: number;
  name: string;
  empNumber?: string | null;
  jobTitle?: string | null;
}

const DIMENSIONS: Array<{ key: string; field: keyof ScoreRow; label: string; icon: any; tone: string }> = [
  { key: "discipline",   field: "disciplineScore",   label: "الانضباط",       icon: Shield,        tone: "text-status-error-foreground" },
  { key: "activity",     field: "activityScore",     label: "النشاط",         icon: Activity,      tone: "text-status-info-foreground" },
  { key: "productivity", field: "productivityScore", label: "الإنتاجية",      icon: CheckCircle,   tone: "text-status-success-foreground" },
  { key: "quality",      field: "qualityScore",      label: "الجودة",         icon: AlertCircle,   tone: "text-status-warning-foreground" },
  { key: "manager",      field: "managerScore",      label: "تقييم المدير",   icon: UserCheck,     tone: "text-purple-700" },
  { key: "development",  field: "developmentScore",  label: "التطوير الذاتي", icon: GraduationCap, tone: "text-cyan-700" },
];

function TrendIcon({ trend }: { trend: number }) {
  if (trend > 0) return <TrendingUp className="h-4 w-4 text-status-success-foreground" />;
  if (trend < 0) return <TrendingDown className="h-4 w-4 text-status-error-foreground" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function compositeTone(score: number): string {
  if (score >= 85) return "text-status-success-foreground";
  if (score >= 70) return "text-status-info-foreground";
  if (score >= 50) return "text-status-warning-foreground";
  return "text-status-error-foreground";
}

export default function EmployeeScorePage() {
  const [, params] = useRoute<{ id: string }>("/hr/employees/:id/score");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const employeeId = Number(params?.id || 0);
  const [scope, setScope] = useState<"weekly" | "monthly" | "quarterly">("monthly");
  const [recomputing, setRecomputing] = useState(false);

  const empQ = useApiQuery<EmployeeBasics>(["employee", String(employeeId)], `/employees/${employeeId}`);
  const histQ = useApiQuery<{ data: ScoreRow[]; total: number }>(
    ["employee-scoring-history", String(employeeId), scope],
    `/employees/${employeeId}/scoring/history?scope=${scope}&limit=24`,
  );

  if (empQ.isLoading || histQ.isLoading) return <LoadingSpinner />;
  if (empQ.isError) return <ErrorState />;

  const employee = empQ.data;
  const history = histQ.data?.data ?? [];
  const latest = history[0];

  const recompute = async () => {
    setRecomputing(true);
    try {
      await apiFetch(`/employees/${employeeId}/scoring/recompute`, {
        method: "POST",
        body: JSON.stringify({ scopes: [scope] }),
      });
      toast({ title: "تم إعادة حساب الدرجة بنجاح" });
      histQ.refetch();
    } catch (err: any) {
      toast({ title: err?.message || "فشل إعادة الحساب", variant: "destructive" });
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <PageShell
      title={`درجة التقييم — ${employee?.name ?? `#${employeeId}`}`}
      subtitle="درجة مؤسسية محسوبة آليًا من 6 مصادر موضوعية — لا تقييم يدوي."
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/employees", label: "الموظفون" },
        { href: `/employees/${employeeId}`, label: employee?.name ?? `#${employeeId}` },
        { label: "درجة التقييم" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLocation(`/employees/${employeeId}`)}>
            <ArrowLeft className="h-4 w-4 me-1" /> ملف الموظف
          </Button>
          <GuardedButton perm="hr.employees:update" onClick={recompute} disabled={recomputing}>
            <RefreshCw className={`h-4 w-4 me-1 ${recomputing ? "animate-spin" : ""}`} />
            {recomputing ? "جارٍ الحساب..." : "إعادة الحساب الآن"}
          </GuardedButton>
        </div>
      }
    >
      {/* Scope picker — weekly/monthly/quarterly switch the history query. */}
      <div className="flex items-center gap-1 mb-4">
        {(["weekly", "monthly", "quarterly"] as const).map((s) => (
          <Button
            key={s}
            variant={scope === s ? "default" : "outline"}
            size="sm"
            onClick={() => setScope(s)}
          >
            {s === "weekly" ? "أسبوعي" : s === "monthly" ? "شهري" : "ربع سنوي"}
          </Button>
        ))}
      </div>

      {!latest ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p className="mb-3">لا توجد درجة محسوبة لهذا الموظف بعد.</p>
            <p className="text-xs">
              تعمل الكرون أسبوعيًا (الإثنين 3 صباحًا) وشهريًا (1 من كل شهر).
              يمكنك أيضًا الضغط على «إعادة الحساب الآن» لتوليد درجة فورية.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Composite headline. */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">الدرجة المركّبة — {latest.periodKey}</CardTitle>
                <div className="flex items-center gap-3">
                  <TrendIcon trend={latest.trend} />
                  <span className="text-xs text-muted-foreground">
                    آخر حساب: {new Date(latest.computedAt).toLocaleString("ar-SA")}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3">
                <span className={`text-5xl font-bold ${compositeTone(Number(latest.compositeScore))}`}>
                  {Number(latest.compositeScore).toFixed(1)}
                </span>
                <span className="text-2xl text-muted-foreground pb-2">/100</span>
                <Badge variant="outline" className="ms-auto">
                  مدخلات: {Object.keys(latest.rawCounters || {}).length} عدّاد موضوعي
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* 6-dimension breakdown with rationale.
              The rationale text comes verbatim from employee_scores.rationale
              which the engine writes when it computes — same source HR sees
              in /employees/:id 360 view, but here we surface ALL dimensions
              not just the headline. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">تفصيل الأبعاد الستة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {DIMENSIONS.map((d) => {
                  const value = Number(latest[d.field] as string);
                  const weight = Number(latest.weightsUsed?.[d.key] ?? 0);
                  const Icon = d.icon;
                  return (
                    <div key={d.key} className="border rounded-lg p-3" data-testid={`dim-${d.key}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${d.tone}`} />
                          <span className="font-medium">{d.label}</span>
                          <Badge variant="outline" className="text-xs">وزن {(weight * 100).toFixed(0)}%</Badge>
                        </div>
                        <span className={`text-2xl font-bold ${compositeTone(value)}`}>
                          {value.toFixed(0)}<span className="text-sm text-muted-foreground">/100</span>
                        </span>
                      </div>
                      {/* Bar */}
                      <div className="h-2 bg-surface-subtle rounded-full overflow-hidden mb-2">
                        <div
                          className={`h-full rounded-full ${
                            value >= 85 ? "bg-status-success-foreground" :
                            value >= 70 ? "bg-status-info-foreground" :
                            value >= 50 ? "bg-status-warning-foreground" :
                            "bg-status-error-foreground"
                          }`}
                          style={{ width: `${Math.max(2, value)}%` }}
                        />
                      </div>
                      {/* Rationale text — verbatim from the engine. */}
                      {latest.rationale?.[d.key] && (
                        <p className="text-xs text-muted-foreground font-mono" dir="rtl">
                          {latest.rationale[d.key]}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Raw counters — the «من أين جاءت الأرقام؟» panel. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-muted-foreground">العدّادات الخام</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {Object.entries(latest.rawCounters || {}).map(([k, v]) => (
                  <div key={k} className="bg-surface-subtle rounded p-2">
                    <div className="text-muted-foreground">{k}</div>
                    <div className="font-mono font-bold text-base">{Number(v).toLocaleString("ar-SA")}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                هذه القيم هي ما قرأه المحرّك من الجداول الموضوعية (الحضور، المخالفات، المهام،
                التدريب، تقييمات الأداء) — ليست أرقامًا يدوية.
              </p>
            </CardContent>
          </Card>

          {/* History list. */}
          {history.length > 1 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">السجل الزمني ({history.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={`${h.scope}-${h.periodKey}`} className="flex items-center justify-between border-b py-2 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{h.periodKey}</span>
                        <TrendIcon trend={h.trend} />
                      </div>
                      <span className={`font-bold ${compositeTone(Number(h.compositeScore))}`}>
                        {Number(h.compositeScore).toFixed(1)}/100
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PageShell>
  );
}
