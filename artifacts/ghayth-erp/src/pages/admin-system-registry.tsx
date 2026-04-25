import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RefreshCw, Database, Layers, Shield, Activity, AlertTriangle,
  FileText, Zap, BarChart3,
} from "lucide-react";

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

  const overview = registry?.overview ?? {};
  const domains = registry?.domains ?? [];
  const entityList = entities?.entities ?? [];
  const eventList = actions?.events ?? [];
  const recentActions = actions?.recentActions ?? [];

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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <StatCard label="نطاق" value={overview.domains ?? 0} icon={Layers} />
            <StatCard label="جدول" value={overview.tables ?? 0} icon={Database} />
            <StatCard label="آلة حالة" value={overview.lifecycleMachines ?? 0} icon={Activity} />
            <StatCard label="حدث" value={overview.events ?? 0} icon={Zap} />
            <StatCard label="صلاحية" value={overview.permissions ?? 0} icon={Shield} />
            <StatCard label="دور" value={overview.roles ?? 0} icon={Shield} />
            <StatCard label="مهمة مجدولة" value={overview.cronJobs ?? 0} icon={BarChart3} />
            <StatCard label="نطاق مالي" value={overview.glDomains ?? 0} icon={FileText} />
          </div>

          <Tabs defaultValue="domains" dir="rtl">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="domains">النطاقات</TabsTrigger>
              <TabsTrigger value="entities">الكيانات ({entityList.length})</TabsTrigger>
              <TabsTrigger value="events">الأحداث ({eventList.length})</TabsTrigger>
              <TabsTrigger value="activity">النشاط الأخير</TabsTrigger>
              <TabsTrigger value="gaps">الفجوات</TabsTrigger>
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

            {/* Entities Tab */}
            <TabsContent value="entities" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <DataTable
                    columns={entityColumns}
                    data={entityList}
                    noToolbar
                    pageSize={0}
                    emptyMessage="لا توجد كيانات"
                  />
                </CardContent>
              </Card>
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
