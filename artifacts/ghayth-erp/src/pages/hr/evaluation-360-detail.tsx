import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, Target, Users, Shield, BarChart3, TrendingUp,
  CheckCircle, Clock, Star, AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";

function ScoreCircle({ score, label, color = "blue" }: { score: number | null; label: string; color?: string }) {
  const colorMap: Record<string, string> = {
    blue: "stroke-blue-500",
    green: "stroke-green-500",
    orange: "stroke-orange-500",
    purple: "stroke-purple-500",
  };
  const textMap: Record<string, string> = {
    blue: "text-blue-600",
    green: "text-green-600",
    orange: "text-orange-600",
    purple: "text-purple-600",
  };
  const r = 30;
  const circ = 2 * Math.PI * r;
  const pct = score != null ? Math.min(100, Math.max(0, score)) : 0;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-20 h-20">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          <circle
            cx="36" cy="36" r={r} fill="none" strokeWidth="6"
            className={score != null ? colorMap[color] : "stroke-gray-200"}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {score != null
            ? <span className={cn("text-lg font-bold", textMap[color])}>{score}%</span>
            : <span className="text-gray-400 text-sm">-</span>
          }
        </div>
      </div>
      <p className="text-xs text-gray-500 text-center">{label}</p>
    </div>
  );
}

function KpiBar({ label, score, icon: Icon }: { label: string; score: number; icon: any }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
  const textColor = score >= 80 ? "text-green-600" : score >= 60 ? "text-yellow-600" : "text-red-600";
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-gray-400 shrink-0" />
      <span className="text-sm w-36 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${score}%` }} />
      </div>
      <span className={cn("text-sm font-bold w-10 text-end", textColor)}>{score}%</span>
    </div>
  );
}

// SVG Radar / Spider chart — no extra dependencies required
function RadarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const cx = 130; const cy = 130; const r = 100;
  const N = data.length;
  const toXY = (angle: number, radius: number) => ({
    x: cx + radius * Math.sin(angle),
    y: cy - radius * Math.cos(angle),
  });
  const axes = data.map((_, i) => ({ angle: (2 * Math.PI * i) / N }));
  const gridLevels = [20, 40, 60, 80, 100];

  const polyPoints = data.map((d, i) => {
    const pt = toXY(axes[i]!.angle, (d.value / 100) * r);
    return `${pt.x},${pt.y}`;
  }).join(" ");

  return (
    <svg width="260" height="260" className="mx-auto">
      {/* Grid circles */}
      {gridLevels.map((lvl) => {
        const pts = axes.map(({ angle }) => {
          const pt = toXY(angle, (lvl / 100) * r);
          return `${pt.x},${pt.y}`;
        }).join(" ");
        return <polygon key={lvl} points={pts} fill="none" stroke="#e5e7eb" strokeWidth="1" />;
      })}
      {/* Axis lines */}
      {axes.map(({ angle }, i) => {
        const end = toXY(angle, r);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#d1d5db" strokeWidth="1" />;
      })}
      {/* Data polygon */}
      <polygon points={polyPoints} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth="2" />
      {/* Data points */}
      {data.map((d, i) => {
        const pt = toXY(axes[i]!.angle, (d.value / 100) * r);
        return <circle key={i} cx={pt.x} cy={pt.y} r="4" fill="#3b82f6" />;
      })}
      {/* Labels */}
      {data.map((d, i) => {
        const pt = toXY(axes[i]!.angle, r + 18);
        return (
          <text key={i} x={pt.x} y={pt.y} textAnchor="middle" dominantBaseline="middle"
            fontSize="10" fill="#6b7280" style={{ fontFamily: "system-ui" }}>
            {d.label}
          </text>
        );
      })}
      {/* Center score labels at 80% ring */}
      {data.map((d, i) => {
        const pt = toXY(axes[i]!.angle, (d.value / 100) * r - 10);
        if (d.value < 10) return null;
        return (
          <text key={`val-${i}`} x={pt.x} y={pt.y} textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fontWeight="bold" fill="#1d4ed8">
            {d.value}%
          </text>
        );
      })}
    </svg>
  );
}

export default function Evaluation360DetailPage() {
  const [, params] = useRoute("/hr/evaluation-360/:id");
  const cycleId = params?.id ?? "";
  const [tab, setTab] = useState<"system" | "peers" | "upward" | "summary">("summary");

  const { data, isLoading } = useApiQuery<any>(
    ["evaluation-cycle-detail", cycleId],
    `/hr/evaluation-cycles/${cycleId}`
  );

  if (isLoading) return <div className="p-8 text-center text-gray-400">جارٍ التحميل...</div>;
  if (!data?.cycle) return <div className="p-8 text-center text-gray-400">دورة التقييم غير موجودة</div>;

  const { cycle, systemEval, peerEvals = [], summary, upwardSummary } = data;
  const managerEvals = peerEvals.filter((p: any) => p.evaluatorRole === 'manager');
  const peerOnlyEvals = peerEvals.filter((p: any) => p.evaluatorRole === 'peer');

  const tabs = [
    { id: "summary", label: "ملخص 360°", icon: BarChart3 },
    { id: "system", label: "التقرير الآلي", icon: Target },
    { id: "peers", label: "تقييم المدير والزملاء", icon: Users },
    { id: "upward", label: "التقييم العكسي", icon: Shield },
  ];

  return (
    <PageShell
      title={`تقييم 360° — ${cycle.employeeName}`}
      subtitle={`${cycle.period} · ${cycle.jobTitle}`}
      loading={isLoading}
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/evaluation-360", label: "تقييم 360" },
      ]}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/hr/evaluation-360/${cycleId}/peer`}>
            <Button variant="outline" size="sm"><Users className="w-4 h-4 me-1" />إضافة تقييم مدير/زميل</Button>
          </Link>
          <Link href={`/hr/evaluation-360/${cycleId}/upward`}>
            <Button variant="outline" size="sm"><Shield className="w-4 h-4 me-1" />تقييم عكسي سري</Button>
          </Link>
          <Link href="/hr/evaluation-360">
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4 me-1" />
              العودة
            </Button>
          </Link>
        </div>
      }
    >
      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all",
              tab === t.id ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* Summary Tab */}
      {tab === "summary" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col items-center">
                <ScoreCircle score={summary?.systemScore ?? null} label="تقييم النظام" color="blue" />
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col items-center">
                <ScoreCircle score={summary?.managerScore ?? null} label="تقييم المدير" color="orange" />
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col items-center">
                <ScoreCircle score={summary?.peerScore ?? null} label="تقييم الزملاء" color="green" />
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col items-center">
                <ScoreCircle score={summary?.finalScore ?? null} label="الدرجة النهائية 360°" color="purple" />
              </CardContent>
            </Card>
          </div>

          {summary?.finalScore != null && (
            <Card className="border-0 shadow-sm bg-gradient-to-r from-purple-50 to-blue-50">
              <CardContent className="p-6 text-center">
                <p className="text-sm text-gray-500 mb-2">الدرجة النهائية الموزونة (360°)</p>
                <p className="text-5xl font-black text-purple-600">{summary.finalScore}%</p>
                <p className="text-sm text-gray-400 mt-2">
                  {summary.finalScore >= 85 ? "أداء ممتاز" :
                   summary.finalScore >= 70 ? "أداء جيد جداً" :
                   summary.finalScore >= 55 ? "أداء جيد" :
                   "يحتاج إلى تطوير"}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Upward summary */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-500" />
                التقييم العكسي السري للمدير
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!upwardSummary?.locked && upwardSummary?.avgScore != null ? (
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold text-purple-600">{upwardSummary.avgScore}%</div>
                  <div>
                    <p className="text-sm text-gray-500">متوسط {upwardSummary.count} تقييم سري</p>
                    <p className="text-xs text-gray-400">الهوية مجهولة — النتائج مجمّعة فقط</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-gray-500">
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                  <div>
                    <p className="text-sm">يتطلب عدد كافٍ من التقييمات لعرض النتائج</p>
                    <p className="text-xs text-gray-400">الحد الأدنى 3 تقييمات لضمان السرية</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* System Report Tab */}
      {tab === "system" && (
        <div className="space-y-4">
          {!systemEval ? (
            <Card><CardContent className="p-8 text-center text-gray-400">لم يتم توليد التقرير الآلي بعد</CardContent></Card>
          ) : (
            <>
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-500" />
                    مؤشرات الأداء الآلية
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <KpiBar label="نسبة الحضور والانضباط" score={systemEval.attendanceScore ?? 0} icon={CheckCircle} />
                  <KpiBar label="إنجاز المهام" score={systemEval.taskCompletionScore ?? 0} icon={Target} />
                  <KpiBar label="الالتزام بالمواعيد" score={systemEval.onTimeScore ?? 0} icon={Clock} />
                  <KpiBar label="رضا العملاء وجودة الدعم" score={systemEval.clientSatScore ?? 0} icon={Star} />
                  <KpiBar label="جودة التوثيق" score={systemEval.docQualityScore ?? 0} icon={BarChart3} />
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-blue-50">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="text-5xl font-black text-blue-600">{systemEval.overallScore}%</div>
                  <div>
                    <p className="font-semibold text-blue-800">الدرجة الآلية الإجمالية</p>
                    <p className="text-sm text-blue-600">محسوبة من بيانات النظام الفعلية</p>
                  </div>
                </CardContent>
              </Card>

              {/* Radar / Spider chart for KPI dimensions */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                    مخطط العنكبوت — مقارنة الأبعاد
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RadarChart
                    data={[
                      { label: "الحضور", value: systemEval.attendanceScore ?? 0, color: "blue" },
                      { label: "المهام", value: systemEval.taskCompletionScore ?? 0, color: "green" },
                      { label: "المواعيد", value: systemEval.onTimeScore ?? 0, color: "orange" },
                      { label: "رضا العملاء", value: systemEval.clientSatScore ?? 0, color: "purple" },
                      { label: "التوثيق", value: systemEval.docQualityScore ?? 0, color: "red" },
                    ]}
                  />
                </CardContent>
              </Card>

              {systemEval.metrics && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">البيانات التفصيلية</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      {[
                        { key: "attendance_rate", label: "نسبة الحضور", suffix: "%" },
                        { key: "present_days", label: "أيام الحضور", suffix: " يوم" },
                        { key: "late_days", label: "أيام التأخير", suffix: " يوم" },
                        { key: "task_completion_rate", label: "إنجاز المهام", suffix: "%" },
                        { key: "on_time_rate", label: "الالتزام بالمواعيد", suffix: "%" },
                        { key: "sla_adherence", label: "الالتزام بمستوى الخدمة", suffix: "%" },
                        { key: "client_satisfaction", label: "رضا العملاء", suffix: "/5" },
                        { key: "reopen_rate", label: "معدل إعادة الفتح", suffix: "%" },
                        { key: "support_response_rate", label: "معدل الاستجابة للدعم", suffix: "%" },
                      ].map(({ key, label, suffix }) => {
                        const val = systemEval.metrics[key];
                        if (val == null) return null;
                        return (
                          <div key={key} className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-500">{label}</p>
                            <p className="text-lg font-bold">{Number(val).toFixed(key === 'client_satisfaction' ? 1 : 0)}{suffix}</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Peers Tab */}
      {tab === "peers" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Link href={`/hr/evaluation-360/${cycleId}/peer`}>
              <Button size="sm"><Users className="w-4 h-4 me-1" />إضافة تقييم</Button>
            </Link>
          </div>

          {peerEvals.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-gray-400">لا يوجد تقييمات من المدير أو الزملاء حتى الآن</CardContent></Card>
          ) : (
            <>
              {managerEvals.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 text-orange-600">تقييمات المدير</h3>
                  <div className="space-y-3">
                    {managerEvals.map((pe: any) => (
                      <Card key={pe.id} className="border-0 shadow-sm border-r-4 border-r-orange-400">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="font-semibold">{pe.evaluatorName}</span>
                              <span className="text-xs text-gray-400 ms-2">{pe.evaluatorTitle}</span>
                            </div>
                            <span className={cn("text-2xl font-black", pe.overallScore >= 80 ? "text-green-600" : pe.overallScore >= 60 ? "text-yellow-600" : "text-red-600")}>
                              {pe.overallScore}%
                            </span>
                          </div>
                          {pe.comments && <p className="text-sm text-gray-600 bg-gray-50 rounded p-2">{pe.comments}</p>}
                          {pe.scores && (
                            <div className="grid grid-cols-3 gap-2 mt-2">
                              {Object.entries(pe.scores as Record<string, number>).map(([k, v]) => (
                                <div key={k} className="text-center bg-orange-50 rounded p-2">
                                  <p className="text-xs text-gray-400">{k}</p>
                                  <p className="font-bold">{v}%</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {peerOnlyEvals.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 text-green-600">تقييمات الزملاء</h3>
                  <div className="space-y-3">
                    {peerOnlyEvals.map((pe: any) => (
                      <Card key={pe.id} className="border-0 shadow-sm border-r-4 border-r-green-400">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="font-semibold">{pe.evaluatorName}</span>
                              <span className="text-xs text-gray-400 ms-2">{pe.evaluatorTitle}</span>
                            </div>
                            <span className={cn("text-2xl font-black", pe.overallScore >= 80 ? "text-green-600" : pe.overallScore >= 60 ? "text-yellow-600" : "text-red-600")}>
                              {pe.overallScore}%
                            </span>
                          </div>
                          {pe.comments && <p className="text-sm text-gray-600 bg-gray-50 rounded p-2">{pe.comments}</p>}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Upward Tab */}
      {tab === "upward" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Link href={`/hr/evaluation-360/${cycleId}/upward`}>
              <Button size="sm" variant="outline"><Shield className="w-4 h-4 me-1" />إرسال تقييم عكسي سري</Button>
            </Link>
          </div>

          <Card className="border-0 shadow-sm bg-purple-50 border border-purple-200">
            <CardContent className="p-4 flex items-start gap-3">
              <Shield className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
              <div className="text-sm text-purple-700">
                <p className="font-semibold mb-1">ضمان السرية التامة</p>
                <p>التقييمات العكسية مجهولة المصدر تماماً — لا يُحفظ اسم المقيِّم في النظام. النتائج تُعرض فقط كمتوسط مجمّع عند وجود 3 تقييمات أو أكثر، وذلك لحماية المقيِّمين.</p>
              </div>
            </CardContent>
          </Card>

          {!upwardSummary?.locked && upwardSummary?.avgScore != null ? (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">ملخص التقييمات العكسية</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <p className="text-5xl font-black text-purple-600 mb-2">{upwardSummary.avgScore}%</p>
                  <p className="text-gray-500">متوسط {upwardSummary.count} تقييم سري</p>
                  <p className="text-xs text-gray-400 mt-1">النتائج مجمّعة — الهويات غير مكشوفة</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-8 text-center">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-yellow-500" />
                <p className="font-medium">النتائج محجوبة حتى الآن</p>
                <p className="text-sm text-gray-400 mt-1">
                  يتطلب عدد كافٍ من التقييمات لعرض النتائج
                </p>
                <p className="text-xs text-gray-400 mt-1">الحد الأدنى: 3 تقييمات لضمان السرية</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PageShell>
  );
}
