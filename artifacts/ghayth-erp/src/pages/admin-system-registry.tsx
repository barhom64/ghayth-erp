import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw, Database, Layers, Shield, Activity, AlertTriangle,
  Zap, BarChart3, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Bell, Printer,
} from "lucide-react";

function FeatureDot({ active, title }: { active: boolean; title: string }) {
  return (
    <span title={title} className={`inline-block w-2 h-2 rounded-full ${active ? "bg-green-500" : "bg-gray-300"}`} />
  );
}

function SeverityCard({ label, count, color }: { label: string; count: number; color: string }) {
  const colorMap: Record<string, string> = {
    red: "bg-red-50 border-red-200 text-red-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
  };
  return (
    <Card className={`border ${colorMap[color] ?? ""}`}>
      <CardContent className="p-3 text-center">
        <p className="text-2xl font-bold">{count}</p>
        <p className="text-xs">{label}</p>
      </CardContent>
    </Card>
  );
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    missing_lifecycle: "بدون دورة حياة",
    missing_approval: "بدون سلسلة اعتماد",
    missing_detail_page: "بدون صفحة تفصيل",
    missing_create_page: "بدون صفحة إنشاء",
    missing_list_page: "بدون صفحة قائمة",
    missing_attachments: "بدون مرفقات",
    missing_events: "بدون أحداث",
    missing_permissions: "بدون صلاحيات",
    missing_notifications: "بدون إشعارات",
    missing_reports: "بدون تقارير",
    missing_print: "بدون طباعة",
    missing_financial_impact: "بدون أثر مالي",
    approval_without_lifecycle: "اعتماد بدون دورة حياة",
    print_without_detail: "طباعة بدون صفحة تفصيل",
  };
  return map[cat] ?? cat;
}

function severityColor(severity: string): string {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-800 text-[10px]",
    high: "bg-amber-100 text-amber-800 text-[10px]",
    medium: "bg-yellow-100 text-yellow-800 text-[10px]",
    low: "bg-blue-100 text-blue-800 text-[10px]",
  };
  return map[severity] ?? "text-[10px]";
}

function severityLabel(severity: string): string {
  const map: Record<string, string> = { critical: "حرج", high: "عالي", medium: "متوسط", low: "منخفض" };
  return map[severity] ?? severity;
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: any }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className="w-8 h-8 text-primary opacity-60" />
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminSystemRegistry() {
  const { data: registry, isLoading: regLoading, error: regError, refetch: refetchReg } =
    useApiQuery<any>(["system-registry"], "/admin/system-registry");

  const { data: entities, isLoading: entLoading } =
    useApiQuery<any>(["system-registry-entities"], "/admin/system-registry/entities");

  const { data: actions, isLoading: actLoading } =
    useApiQuery<any>(["system-registry-actions"], "/admin/system-registry/actions");

  const { data: missing, isLoading: missLoading } =
    useApiQuery<any>(["system-registry-missing"], "/admin/system-registry/missing");

  const { data: coverage, isLoading: covLoading } =
    useApiQuery<any>(["system-registry-coverage"], "/admin/system-registry/coverage");

  const { data: notifRegistry, isLoading: notifLoading } =
    useApiQuery<any>(["system-registry-notifications"], "/admin/system-registry/notifications");

  const { data: reportRegistry, isLoading: reportLoading } =
    useApiQuery<any>(["system-registry-reports"], "/admin/system-registry/reports");

  const { data: printRegistry, isLoading: printLoading } =
    useApiQuery<any>(["system-registry-print"], "/admin/system-registry/print-templates");

  const overview = registry?.overview ?? {};
  const domains = registry?.domains ?? [];
  const entityList = entities?.entities ?? [];
  const eventList = actions?.events ?? [];
  const recentActions = actions?.recentActions ?? [];
  const coverageGaps = coverage?.gaps ?? [];
  const coverageSummary = coverage?.summary ?? {};
  const coverageBySeverity = coverage?.bySeverity ?? {};
  const coverageByCategory = coverage?.byCategory ?? {};

  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);

  const filteredEntities = domainFilter === "all"
    ? entityList
    : entityList.filter((e: any) => e.domain === domainFilter);

  const filteredGaps = domainFilter === "all"
    ? coverageGaps
    : coverageGaps.filter((g: any) => g.domain === domainFilter);

  const isLoading = regLoading;
  const error = regError;

  const entityColumns: DataTableColumn<any>[] = [
    { key: "table", header: "الجدول", searchable: true, render: (r: any) => <span className="font-mono text-xs">{r.table}</span> },
    { key: "domainLabel", header: "النطاق", render: (r: any) => <Badge variant="outline" className="text-[10px]">{r.domainLabel}</Badge> },
    { key: "hasLifecycle", header: "آلة حالة", align: "center", render: (r: any) => r.hasLifecycle ? (
      <Badge className="bg-green-100 text-green-800 text-[10px]">
        {r.lifecycle?.states?.length || "?"} حالة
      </Badge>
    ) : (
      <span className="text-gray-400">—</span>
    )},
  ];

  const eventColumns: DataTableColumn<any>[] = [
    { key: "action", header: "الحدث", searchable: true, render: (r: any) => <span className="font-mono text-[11px]">{r.action}</span> },
    { key: "domain", header: "النطاق", render: (r: any) => <Badge variant="outline" className="text-[10px]">{r.domain}</Badge> },
    { key: "label", header: "الوصف", searchable: true },
    { key: "critical", header: "حرج", align: "center", render: (r: any) => r.critical ? (
      <Badge className="bg-red-100 text-red-800 text-[10px]">حرج</Badge>
    ) : (
      <span className="text-gray-400">—</span>
    )},
  ];

  const activityColumns: DataTableColumn<any>[] = [
    { key: "action", header: "الإجراء", searchable: true, render: (r: any) => <span className="font-mono text-xs">{r.action}</span> },
    { key: "entity", header: "الكيان", render: (r: any) => <span className="font-mono text-xs">{r.entity}</span> },
    { key: "count", header: "التكرار", align: "center", sortable: true, render: (r: any) => <span className="font-bold">{r.count}</span> },
  ];

  return (
    <PageShell
      title="المرجعية المركزية الشاملة"
      subtitle="فهرس شامل لكل النطاقات والكيانات والإجراءات والصلاحيات والأحداث في النظام"
      loading={isLoading}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetchReg()}>
          <RefreshCw className="h-4 w-4 me-1" />تحديث
        </Button>
      }
    >
      <PageStateWrapper isLoading={isLoading && !registry} error={error} onRetry={refetchReg}>
        <div className="space-y-6">
          {/* Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <StatCard label="نطاق" value={overview.domains ?? 0} icon={Layers} />
            <StatCard label="كيان مسجّل" value={overview.registeredEntities ?? entityList.length} icon={Database} />
            <StatCard label="آلة حالة" value={overview.lifecycleMachines ?? 0} icon={Activity} />
            <StatCard label="حدث" value={overview.events ?? 0} icon={Zap} />
            <StatCard label="صلاحية" value={overview.permissions ?? 0} icon={Shield} />
          </div>

          {coverageSummary.total > 0 && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center text-sm">
                  <div>
                    <p className="text-2xl font-bold text-blue-700">
                      {coverageSummary.withLifecycle}/{coverageSummary.total}
                    </p>
                    <p className="text-xs text-gray-600">دورة حياة</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-700">
                      {coverageSummary.withApproval}/{coverageSummary.total}
                    </p>
                    <p className="text-xs text-gray-600">سلسلة اعتماد</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-purple-700">
                      {coverageSummary.withAttachments}/{coverageSummary.total}
                    </p>
                    <p className="text-xs text-gray-600">مرفقات</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-700">
                      {coverageSummary.withFinancial}/{coverageSummary.total}
                    </p>
                    <p className="text-xs text-gray-600">أثر مالي</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-700">
                      {coverageSummary.withPrint}/{coverageSummary.total}
                    </p>
                    <p className="text-xs text-gray-600">طباعة</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-3">
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="جميع النطاقات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع النطاقات</SelectItem>
                {domains.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs defaultValue="entities" dir="rtl">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="entities">الكيانات ({filteredEntities.length})</TabsTrigger>
              <TabsTrigger value="coverage">
                التغطية
                {coverageBySeverity.critical > 0 && (
                  <Badge className="bg-red-100 text-red-800 text-[10px] ms-1">{coverageBySeverity.critical}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="domains">النطاقات</TabsTrigger>
              <TabsTrigger value="events">الأحداث ({eventList.length})</TabsTrigger>
              <TabsTrigger value="activity">النشاط الأخير</TabsTrigger>
              <TabsTrigger value="notifications">
                <Bell className="w-3.5 h-3.5 me-1" />الإشعارات ({notifRegistry?.totalTypes ?? 0})
              </TabsTrigger>
              <TabsTrigger value="reports">
                <BarChart3 className="w-3.5 h-3.5 me-1" />التقارير ({reportRegistry?.totalReports ?? 0})
              </TabsTrigger>
              <TabsTrigger value="print">
                <Printer className="w-3.5 h-3.5 me-1" />الطباعة ({printRegistry?.total ?? 0})
              </TabsTrigger>
              <TabsTrigger value="gaps">الفجوات (قديم)</TabsTrigger>
            </TabsList>

            {/* Domains Tab */}
            <TabsContent value="domains" className="space-y-4 mt-4">
              {domains.map((d: any) => (
                <Card key={d.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Layers className="w-5 h-5 text-primary" />
                      {d.label}
                      <Badge variant="outline" className="font-mono text-xs">{d.id}</Badge>
                      {d.glIntegration && <Badge className="bg-green-100 text-green-800 text-[10px]">GL</Badge>}
                      <Badge variant="outline" className="text-[10px]">{d.tables?.length || 0} جدول</Badge>
                      <Badge variant="outline" className="text-[10px]">{d.permissions?.length || 0} صلاحية</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {(d.tables || []).map((t: string) => (
                        <Badge key={t} variant="outline" className="font-mono text-[10px]">{t}</Badge>
                      ))}
                    </div>
                    {d.engines?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {d.engines.map((e: string) => (
                          <Badge key={e} className="bg-blue-100 text-blue-800 text-[10px]">{e}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* Entities Tab — full operational profiles */}
            <TabsContent value="entities" className="mt-4 space-y-2">
              {entLoading ? (
                <p className="text-gray-400 text-sm p-4">جاري التحميل...</p>
              ) : filteredEntities.length === 0 ? (
                <p className="text-gray-400 text-sm p-4">لا توجد كيانات</p>
              ) : (
                filteredEntities.map((e: any) => {
                  const isExpanded = expandedEntity === e.id;
                  return (
                    <Card key={e.id} className="overflow-hidden">
                      <button
                        className="w-full text-right p-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedEntity(isExpanded ? null : e.id)}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
                        <span className="font-semibold text-sm">{e.label}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">{e.table}</Badge>
                        <Badge className="text-[10px] bg-gray-100 text-gray-700">{e.type === "document" ? "مستند" : e.type === "transaction" ? "معاملة" : e.type === "master" ? "بيان رئيسي" : e.type === "request" ? "طلب" : "إعداد"}</Badge>
                        <div className="flex gap-1 ms-auto">
                          <FeatureDot active={!!e.lifecycle} title="دورة حياة" />
                          <FeatureDot active={!!e.approval} title="اعتماد" />
                          <FeatureDot active={!!e.attachments} title="مرفقات" />
                          <FeatureDot active={!!e.financialImpact} title="أثر مالي" />
                          <FeatureDot active={!!e.print} title="طباعة" />
                        </div>
                      </button>
                      {isExpanded && (
                        <CardContent className="border-t bg-muted/10 p-4 text-sm space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div><span className="text-gray-500">المالك:</span> <span className="font-medium">{e.owner || "—"}</span></div>
                            <div><span className="text-gray-500">المنشأ:</span> <span className="font-medium">{e.origin || "—"}</span></div>
                            <div><span className="text-gray-500">النطاق:</span> <Badge variant="outline" className="text-[10px]">{e.domain}</Badge></div>
                            <div><span className="text-gray-500">النوع:</span> <span className="font-medium">{e.type}</span></div>
                          </div>
                          {e.routes && (
                            <div>
                              <p className="text-gray-500 text-xs mb-1">المسارات:</p>
                              <div className="flex flex-wrap gap-1">
                                {e.routes.list && <Badge variant="outline" className="font-mono text-[10px]">{e.routes.list}</Badge>}
                                {e.routes.create && <Badge variant="outline" className="font-mono text-[10px]">{e.routes.create}</Badge>}
                                {e.routes.detail && <Badge variant="outline" className="font-mono text-[10px]">{e.routes.detail}</Badge>}
                              </div>
                            </div>
                          )}
                          {e.lifecycle && (
                            <div>
                              <p className="text-gray-500 text-xs mb-1">دورة الحياة:</p>
                              <div className="flex flex-wrap gap-1">
                                {e.lifecycle.states.map((s: string) => (
                                  <Badge key={s} className={s === e.lifecycle.initialState ? "bg-blue-100 text-blue-800 text-[10px]" : "bg-gray-100 text-gray-700 text-[10px]"}>
                                    {s}{s === e.lifecycle.initialState ? " (ابتدائي)" : ""}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {e.approval && (
                            <div>
                              <p className="text-gray-500 text-xs mb-1">سلسلة الاعتماد:</p>
                              <div className="flex gap-1 items-center">
                                {e.approval.approverRoles.map((c: string, i: number) => (
                                  <span key={c} className="flex items-center gap-1">
                                    <Badge className="bg-green-100 text-green-800 text-[10px]">{c}</Badge>
                                    {i < e.approval.approverRoles.length - 1 && <span className="text-gray-400">←</span>}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {e.events && e.events.length > 0 && (
                            <div>
                              <p className="text-gray-500 text-xs mb-1">الأحداث ({e.events.length}):</p>
                              <div className="flex flex-wrap gap-1">
                                {e.events.map((ev: string) => (
                                  <Badge key={ev} variant="outline" className="font-mono text-[10px]">{ev}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {e.permissions && e.permissions.length > 0 && (
                            <div>
                              <p className="text-gray-500 text-xs mb-1">الصلاحيات:</p>
                              <div className="flex flex-wrap gap-1">
                                {e.permissions.map((p: string) => (
                                  <Badge key={p} variant="outline" className="font-mono text-[10px]">{p}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  );
                })
              )}
            </TabsContent>

            {/* Coverage Tab — gap analysis */}
            <TabsContent value="coverage" className="mt-4 space-y-4">
              {covLoading ? (
                <p className="text-gray-400 text-sm p-4">جاري تحليل التغطية...</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <SeverityCard label="حرج" count={coverageBySeverity.critical ?? 0} color="red" />
                    <SeverityCard label="عالي" count={coverageBySeverity.high ?? 0} color="amber" />
                    <SeverityCard label="متوسط" count={coverageBySeverity.medium ?? 0} color="yellow" />
                    <SeverityCard label="منخفض" count={coverageBySeverity.low ?? 0} color="blue" />
                  </div>

                  {Object.keys(coverageByCategory).length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">الفجوات حسب التصنيف</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {Object.entries(coverageByCategory).map(([cat, count]) => (
                          <div key={cat} className="flex items-center gap-3">
                            <span className="text-xs text-gray-600 w-40 shrink-0">{categoryLabel(cat)}</span>
                            <Progress value={Math.min(100, ((count as number) / Math.max(1, filteredGaps.length)) * 100)} className="h-2 flex-1" />
                            <span className="text-xs font-bold w-8 text-left">{count as number}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        تفاصيل الفجوات ({filteredGaps.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              <th className="p-2 text-right">الكيان</th>
                              <th className="p-2 text-right">النطاق</th>
                              <th className="p-2 text-right">التصنيف</th>
                              <th className="p-2 text-right">الوصف</th>
                              <th className="p-2 text-center">الخطورة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredGaps.map((g: any, i: number) => (
                              <tr key={i} className="border-t">
                                <td className="p-2 font-medium text-xs">{g.entityLabel}</td>
                                <td className="p-2"><Badge variant="outline" className="text-[10px]">{g.domain}</Badge></td>
                                <td className="p-2 text-xs text-gray-600">{categoryLabel(g.category)}</td>
                                <td className="p-2 text-xs">{g.description}</td>
                                <td className="p-2 text-center">
                                  <Badge className={severityColor(g.severity)}>{severityLabel(g.severity)}</Badge>
                                </td>
                              </tr>
                            ))}
                            {filteredGaps.length === 0 && (
                              <tr><td colSpan={5} className="p-4 text-center text-green-600">لا توجد فجوات — تغطية كاملة</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Events Tab */}
            <TabsContent value="events" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">توزيع الأحداث بحسب النطاق</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(overview.eventsByDomain ?? {}).map(([domain, count]) => (
                      <Badge key={domain} variant="outline" className="text-xs">
                        {domain}: {count as number}
                      </Badge>
                    ))}
                  </div>
                  <DataTable
                    columns={eventColumns}
                    data={eventList.slice(0, 100)}
                    noToolbar
                    pageSize={0}
                    emptyMessage="لا توجد أحداث"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">أكثر الإجراءات تكراراً</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={activityColumns}
                    data={recentActions}
                    noToolbar
                    pageSize={0}
                    emptyMessage="لا توجد بيانات"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="mt-4 space-y-4">
              {notifLoading ? <div className="text-center text-sm text-gray-500 py-8">جاري التحميل...</div> : <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="نوع إشعار" value={notifRegistry?.totalTypes ?? 0} icon={Bell} />
                <StatCard label="كيان مغطى" value={notifRegistry?.entitiesWithNotifications ?? 0} icon={CheckCircle2} />
                <StatCard label="بلا إشعار" value={(notifRegistry?.totalEntities ?? 0) - (notifRegistry?.entitiesWithNotifications ?? 0)} icon={XCircle} />
              </div>
              {Object.entries(notifRegistry?.byDomain ?? {}).map(([domain, entries]: [string, any]) => (
                <Card key={domain}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Bell className="w-4 h-4 text-blue-500" />
                      {domain} ({entries.length} كيان)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {entries.map((e: any) => (
                      <div key={e.entityId} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                        <span className="text-sm font-medium min-w-[120px]">{e.entityLabel}</span>
                        <div className="flex flex-wrap gap-1">
                          {e.notifications.map((n: string) => (
                            <Badge key={n} variant="outline" className="text-[10px]">{n}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
              </>}
            </TabsContent>

            {/* Reports Tab */}
            <TabsContent value="reports" className="mt-4 space-y-4">
              {reportLoading ? <div className="text-center text-sm text-gray-500 py-8">جاري التحميل...</div> : <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="تقرير" value={reportRegistry?.totalReports ?? 0} icon={BarChart3} />
                <StatCard label="كيان مغطى" value={reportRegistry?.entitiesWithReports ?? 0} icon={CheckCircle2} />
              </div>
              {Object.entries(reportRegistry?.byDomain ?? {}).map(([domain, entries]: [string, any]) => (
                <Card key={domain}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-indigo-500" />
                      {domain} ({entries.length} كيان)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {entries.map((e: any) => (
                      <div key={e.entityId} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg">
                        <span className="text-sm font-medium min-w-[120px]">{e.entityLabel}</span>
                        <div className="flex flex-wrap gap-1">
                          {e.reports.map((r: string) => (
                            <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
              </>}
            </TabsContent>

            {/* Print Templates Tab */}
            <TabsContent value="print" className="mt-4 space-y-4">
              {printLoading ? <div className="text-center text-sm text-gray-500 py-8">جاري التحميل...</div> : <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="قالب طباعة" value={printRegistry?.total ?? 0} icon={Printer} />
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Printer className="w-4 h-4 text-gray-500" />
                    قوالب الطباعة المسجلة
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(printRegistry?.templates ?? []).map((t: any) => (
                      <div key={t.entityId} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-sm">
                        <Badge variant="outline" className="text-[10px]">{t.domain}</Badge>
                        <span className="font-medium">{t.entityLabel}</span>
                        <span className="font-mono text-xs text-gray-500">{t.templateKey}</span>
                        {t.detailRoute && <span className="text-xs text-gray-400 ms-auto">{t.detailRoute}</span>}
                      </div>
                    ))}
                    {(printRegistry?.templates ?? []).length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">لا توجد قوالب طباعة مسجلة</p>
                    )}
                  </div>
                </CardContent>
              </Card>
              </>}
            </TabsContent>

            {/* Gaps Tab */}
            <TabsContent value="gaps" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    جداول بدون أحداث مسجلة ({missing?.tablesWithoutEvents?.count ?? "..."})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {missLoading ? (
                    <p className="text-gray-400 text-sm">جاري التحميل...</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(missing?.tablesWithoutEvents?.items ?? []).map((t: any) => (
                        <Badge key={t.table} variant="outline" className="font-mono text-[10px]">
                          {t.domain}/{t.table}
                        </Badge>
                      ))}
                      {(missing?.tablesWithoutEvents?.count ?? 0) === 0 && (
                        <p className="text-green-600 text-sm">لا توجد فجوات — كل الجداول مغطاة</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    نطاقات بدون آلة حالة ({missing?.domainsWithoutLifecycle?.count ?? "..."})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {missLoading ? (
                    <p className="text-gray-400 text-sm">جاري التحميل...</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(missing?.domainsWithoutLifecycle?.items ?? []).map((d: any) => (
                        <Badge key={d.id} variant="outline">{d.label} ({d.id})</Badge>
                      ))}
                      {(missing?.domainsWithoutLifecycle?.count ?? 0) === 0 && (
                        <p className="text-green-600 text-sm">كل النطاقات لديها آلة حالة</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    إشعارات بدون actionUrl ({missing?.orphanNotifications?.count ?? "..."})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {missLoading ? (
                    <p className="text-gray-400 text-sm">جاري التحميل...</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(missing?.orphanNotifications?.items ?? []).map((n: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{n.type}</Badge>
                      ))}
                      {(missing?.orphanNotifications?.count ?? 0) === 0 && (
                        <p className="text-green-600 text-sm">كل الإشعارات لديها مسار صفحة</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}
