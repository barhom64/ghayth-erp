import { useState } from "react";
import { useLocation } from "wouter";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiQuery } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Brain, TrendingUp, Users, AlertTriangle, BarChart3, Activity, Lightbulb,
  Star, ArrowUpRight, ArrowDownRight, RefreshCw, Clock, Target, DollarSign,
  UserCheck, Zap,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import { formatCurrency } from "@/lib/formatters";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];

const SEGMENT_LABELS: Record<string, string> = {
  vip: "كبار العملاء",
  loyal: "مخلص",
  regular: "منتظم",
  at_risk: "معرض للمغادرة",
  inactive: "خامل",
  new: "جديد",
};

const SEGMENT_COLORS: Record<string, string> = {
  vip: "bg-purple-100 text-purple-800",
  loyal: "bg-status-info-surface text-status-info-foreground",
  regular: "bg-status-success-surface text-status-success-foreground",
  at_risk: "bg-orange-100 text-orange-800",
  inactive: "bg-status-error-surface text-status-error-foreground",
  new: "bg-teal-100 text-teal-800",
};

const CHURN_COLORS: Record<string, string> = {
  low: "text-status-success-foreground",
  medium: "text-status-warning-foreground",
  high: "text-status-error-foreground",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-status-error-surface border-status-error-surface text-status-error-foreground",
  high: "bg-orange-100 border-orange-200 text-orange-800",
  normal: "bg-status-info-surface border-status-info-surface text-status-info-foreground",
  low: "bg-surface-subtle border-border text-status-neutral-foreground",
};

function KPIGauge({ label, value, suffix = "%", color = "blue" }: { label: string; value: number; suffix?: string; color?: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-status-info-foreground",
    green: "text-status-success-foreground",
    amber: "text-status-warning-foreground",
    red: "text-status-error-foreground",
    purple: "text-purple-600",
  };
  return (
    <div className="text-center p-4 rounded-lg bg-surface-subtle border">
      <div className={`text-3xl font-bold ${colorMap[color] ?? "text-status-info-foreground"}`}>{value}{suffix}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export default function Insights() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [recalculating, setRecalculating] = useState(false);

  const { data: summary, isLoading: loadingSummary, refetch: refetchSummary } = useApiQuery<any>(
    ["insights-summary"],
    "/intelligence/insights-summary"
  );

  const { data: recsData, isLoading: loadingRecs } = useApiQuery<any>(
    ["recommendations"],
    "/intelligence/recommendations"
  );

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await apiFetch("/intelligence/clients/analytics/recalculate");
      await refetchSummary();
      toast({ title: "تم تحديث التحليل", description: "تم إعادة حساب تحليل العملاء بنجاح" });
    } catch {
      toast({ title: "خطأ", description: "فشل التحديث", variant: "destructive" });
    } finally {
      setRecalculating(false);
    }
  };

  if (loadingSummary) return <LoadingSpinner />;
  if (!summary && !loadingSummary) return <ErrorState />;

  const overview = summary?.overview ?? {};
  const usageStats = summary?.usageStats ?? {};
  const clientAnalytics = summary?.clientAnalytics ?? {};
  const companyKpis = summary?.companyKpis ?? {};
  const recommendations = summary?.recommendations ?? [];
  const seasonalPatterns = summary?.seasonalPatterns ?? [];
  const recs = recsData?.data ?? recommendations;

  const segmentData = Object.entries(clientAnalytics.segmentBreakdown ?? {}).map(([key, value]) => ({
    name: SEGMENT_LABELS[key] ?? key,
    value: Number(value),
    key,
  }));

  const churnData = Object.entries(clientAnalytics.churnRiskBreakdown ?? {}).map(([key, value]) => ({
    name: key === "high" ? "مرتفع" : key === "medium" ? "متوسط" : "منخفض",
    value: Number(value),
    key,
  }));

  const peakHoursData = (usageStats.peakHours ?? []).map((h: any) => ({
    hour: `${h.hour}:00`,
    count: h.count,
  }));

  const moduleData = (usageStats.moduleUsage ?? []).slice(0, 10).map((m: any) => ({
    name: m.module,
    count: m.count,
  }));

  const dailyActivityData = (usageStats.dailyActivity ?? []).map((d: any) => ({
    date: d.date?.slice(5),
    count: d.count,
  }));

  return (
    <PageShell
      title="رؤى ذكية"
      actions={
        <GuardedButton perm="bi:export" variant="outline" size="sm" onClick={handleRecalculate} disabled={recalculating}>
          <RefreshCw className={`h-4 w-4 me-2 ${recalculating ? "animate-spin" : ""}`} />
          تحديث التحليل
        </GuardedButton>
      }
    >
      {/* Overview KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Users className="h-3 w-3" /> الموظفون النشطون</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{overview.totalEmployees ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><UserCheck className="h-3 w-3" /> إجمالي العملاء</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{overview.totalClients ?? 0}</div></CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><DollarSign className="h-3 w-3" /> إيراد الشهر</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(overview.monthRevenue)}</div>
            {overview.revenueChange !== undefined && (
              <div className={`text-xs flex items-center gap-1 mt-1 ${overview.revenueChange >= 0 ? "text-green-200" : "text-red-300"}`}>
                {overview.revenueChange >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(overview.revenueChange)}% مقارنة بالشهر السابق
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1"><Lightbulb className="h-3 w-3" /> توصيات ذكية</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-purple-600">{recs.length}</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="usage">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="usage" className="flex items-center gap-1"><Activity className="h-3 w-3" /> أنماط الاستخدام</TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-1"><Users className="h-3 w-3" /> تحليل العملاء</TabsTrigger>
          <TabsTrigger value="kpis" className="flex items-center gap-1"><Target className="h-3 w-3" /> مؤشرات الأداء</TabsTrigger>
          <TabsTrigger value="recommendations" className="flex items-center gap-1"><Lightbulb className="h-3 w-3" /> التوصيات</TabsTrigger>
        </TabsList>

        {/* Usage Patterns Tab */}
        <TabsContent value="usage" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> أوقات الذروة (ساعات العمل)</CardTitle></CardHeader>
              <CardContent>
                {peakHoursData.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8 text-sm">لا توجد بيانات كافية بعد</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={peakHoursData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" name="النشاط" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> الوحدات الأكثر استخداماً</CardTitle></CardHeader>
              <CardContent>
                {moduleData.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8 text-sm">لا توجد بيانات كافية بعد</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={moduleData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#10b981" name="الطلبات" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {dailyActivityData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> النشاط اليومي (آخر 30 يوم)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={dailyActivityData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} name="عمليات" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {(usageStats.topUsers ?? []).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">أكثر المستخدمين نشاطاً</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(usageStats.topUsers ?? []).map((u: any, idx: number) => (
                    <div key={u.userId} className="flex items-center justify-between p-2 rounded bg-surface-subtle">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">{idx + 1}</div>
                        <span className="text-sm font-medium">{u.name ?? `مستخدم ${u.userId}`}</span>
                      </div>
                      <Badge variant="secondary">{u.count} عملية</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Client Analytics Tab */}
        <TabsContent value="clients" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> تصنيف العملاء (الحداثة والتكرار والقيمة)</CardTitle></CardHeader>
              <CardContent>
                {segmentData.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground text-sm">لا توجد بيانات — اضغط "تحديث التحليل" لحسابها</p>
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={segmentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                          {segmentData.map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-2 mt-2 justify-center">
                      {segmentData.map((s, i) => (
                        <span key={s.key} className={`text-xs px-2 py-1 rounded-full ${SEGMENT_COLORS[s.key] ?? "bg-surface-subtle text-status-neutral-foreground"}`}>
                          {s.name}: {s.value}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> خطر فقدان العملاء</CardTitle></CardHeader>
              <CardContent>
                {churnData.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground text-sm">لا توجد بيانات — اضغط "تحديث التحليل"</p>
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={churnData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                          {churnData.map((d, i) => (
                            <Cell key={i} fill={d.key === "high" ? "#ef4444" : d.key === "medium" ? "#f59e0b" : "#10b981"} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {(clientAnalytics.topClients ?? []).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Star className="h-4 w-4 text-status-warning" /> أفضل العملاء (بناءً على الحداثة والتكرار والقيمة)</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(clientAnalytics.topClients ?? []).slice(0, 8).map((c: any, idx: number) => (
                    <div key={c.clientId} className="flex items-center justify-between p-2 rounded bg-surface-subtle border">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-5">{idx + 1}</span>
                        <span className="text-sm font-medium">{c.clientName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${SEGMENT_COLORS[c.segment] ?? "bg-surface-subtle text-status-neutral-foreground"}`}>
                          {SEGMENT_LABELS[c.segment] ?? c.segment}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>قيمة: {formatCurrency(c.monetaryValue)}</span>
                        <span>تكرار: {c.frequencyCount}</span>
                        <span className={`font-bold ${CHURN_COLORS[c.churnRisk] ?? ""}`}>خطر: {c.churnRisk === "high" ? "مرتفع" : c.churnRisk === "medium" ? "متوسط" : "منخفض"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(clientAnalytics.atRiskClients ?? []).length > 0 && (
            <Card className="border-status-error-surface bg-status-error-surface">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2 text-status-error-foreground"><AlertTriangle className="h-4 w-4" /> عملاء معرضون للفقدان</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(clientAnalytics.atRiskClients ?? []).map((c: any) => (
                    <div key={c.clientId} className="flex items-center justify-between p-2 rounded bg-white border border-status-error-surface">
                      <span className="text-sm font-medium">{c.clientName}</span>
                      <div className="text-xs flex gap-3">
                        <span className="text-muted-foreground">{c.recencyDays} يوم بدون تعامل</span>
                        <span className="text-status-error-foreground font-bold">خطر {Math.round(c.churnScore)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {seasonalPatterns.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">الأنماط الموسمية (متوسط الإيرادات الشهرية)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={seasonalPatterns}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="monthName" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Bar dataKey="avgRevenue" name="متوسط الإيراد" radius={[3, 3, 0, 0]}>
                      {seasonalPatterns.map((s: any, i: number) => (
                        <Cell key={i} fill={s.trend === "peak" ? "#10b981" : s.trend === "low" ? "#ef4444" : "#3b82f6"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* KPIs Tab */}
        <TabsContent value="kpis" className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" /> مؤشرات أداء المؤسسة (آخر 30 يوم)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <KPIGauge label="معدل إتمام المهام" value={companyKpis.taskCompletionRate ?? 0} color="blue" />
                <KPIGauge label="معدل استجابة الدعم" value={companyKpis.supportResponseRate ?? 0} color="green" />
                <KPIGauge label="معدل تحصيل الفواتير" value={companyKpis.invoiceCollectionRate ?? 0} color="purple" />
                <KPIGauge label="كفاءة الموافقات" value={companyKpis.approvalEfficiency ?? 0} color="amber" />
                <KPIGauge label="رضا العملاء (من 5)" value={companyKpis.avgClientSatisfaction ?? 0} suffix="/5" color="green" />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">مقارنة مؤشرات الأداء</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[
                    { name: "إتمام المهام", value: companyKpis.taskCompletionRate ?? 0 },
                    { name: "استجابة الدعم", value: companyKpis.supportResponseRate ?? 0 },
                    { name: "تحصيل الفواتير", value: companyKpis.invoiceCollectionRate ?? 0 },
                    { name: "كفاءة الموافقات", value: companyKpis.approvalEfficiency ?? 0 },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Bar dataKey="value" name="المعدل" radius={[3, 3, 0, 0]}>
                      {[0, 1, 2, 3].map((i) => (
                        <Cell key={i} fill={COLORS[i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">تفاصيل المؤشرات</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: "معدل إتمام المهام", value: companyKpis.taskCompletionRate ?? 0, icon: <Zap className="h-4 w-4 text-status-info" /> },
                    { label: "معدل استجابة الدعم الفني", value: companyKpis.supportResponseRate ?? 0, icon: <Activity className="h-4 w-4 text-status-success" /> },
                    { label: "معدل تحصيل الفواتير", value: companyKpis.invoiceCollectionRate ?? 0, icon: <DollarSign className="h-4 w-4 text-purple-500" /> },
                    { label: "كفاءة سلسلة الموافقات", value: companyKpis.approvalEfficiency ?? 0, icon: <UserCheck className="h-4 w-4 text-status-warning" /> },
                  ].map((kpi, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">{kpi.icon} {kpi.label}</div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${Math.min(100, kpi.value)}%`,
                              backgroundColor: COLORS[i],
                            }}
                          />
                        </div>
                        <span className="text-sm font-bold w-10 text-right">{kpi.value}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-4">
          {loadingRecs ? (
            <Skeleton className="h-60 w-full" />
          ) : recs.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center">
                <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">لا توجد توصيات حالياً — استمر في استخدام النظام لتوليد توصيات مخصصة</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {recs.map((rec: any) => (
                <Card key={rec.id} className={`border ${PRIORITY_COLORS[rec.priority] ?? "border-border"}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Lightbulb className="h-4 w-4 text-status-warning flex-shrink-0" />
                          <span className="font-medium text-sm">{rec.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {rec.priority === "urgent" ? "عاجل" : rec.priority === "high" ? "مهم" : rec.priority === "low" ? "اختياري" : "عادي"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{rec.description}</p>
                      </div>
                      {rec.actionLink && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-shrink-0"
                          onClick={() => navigate(rec.actionLink)}
                        >
                          {rec.action}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
