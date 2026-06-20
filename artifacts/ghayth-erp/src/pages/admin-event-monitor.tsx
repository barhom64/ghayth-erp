import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateAr } from "@/lib/formatters";
import { useState } from "react";
import {
  Activity, Zap, Filter,
} from "lucide-react";
import { RefreshAction } from "@/components/page-actions";
import { PrintButton } from "@/components/shared/print-button";

export default function AdminEventMonitor() {
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["event-catalog"], "/admin/governance/event-catalog"
  );
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [selectedEventName, setSelectedEventName] = useState<string | null>(null);
  // GET /events/catalog/:name — single-event detail (schema, recent
  // payloads, fired-by count). Opens when the user clicks an event
  // row in the catalog table.
  const eventDetailQ = useApiQuery<any>(
    ["events-catalog-detail", selectedEventName ?? ""],
    selectedEventName ? `/events/catalog/${encodeURIComponent(selectedEventName)}` : null,
    { enabled: selectedEventName !== null },
  );

  const total = data?.total ?? 0;
  const byDomain = data?.byDomain ?? {};
  const catalog = data?.catalog ?? [];
  const recentEvents = data?.recentEvents ?? [];

  const domainKeys = Object.keys(byDomain).sort();
  const filteredCatalog = domainFilter === "all"
    ? catalog
    : catalog.filter((e: any) => e.domain === domainFilter);

  const recentEventColumns: DataTableColumn<any>[] = [
    { key: "action", header: "الحدث", searchable: true, render: (r: any) => <span className="font-mono text-xs">{r.action}</span> },
    { key: "entity", header: "الكيان", render: (r: any) => <span className="text-xs">{r.entity || "—"}</span> },
    { key: "createdAt", header: "التاريخ", render: (r: any) => <span className="text-xs">{formatDateAr(r.createdAt)}</span> },
  ];

  const catalogColumns: DataTableColumn<any>[] = [
    { key: "action", header: "الحدث", searchable: true, render: (r: any) => <span className="font-mono text-xs">{r.action}</span> },
    { key: "domain", header: "النطاق", render: (r: any) => <Badge variant="outline" className="text-[10px]">{r.domain}</Badge> },
    { key: "label", header: "الوصف", searchable: true },
    { key: "critical", header: "حرج", render: (r: any) => r.critical ? <Badge className="bg-status-error-surface text-status-error-foreground">حرج</Badge> : null },
  ];

  return (
    <PageShell
      title="كتالوج الأحداث"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "كتالوج الأحداث" },
      ]}
      subtitle="جميع الأحداث المسجلة في النظام وآخر الأحداث الفعلية"
      loading={isLoading}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_event_catalog"
            entityId="list"
            size="icon"
            label="طباعة كتالوج الأحداث"
            payload={() => ({
              entity: {
                title: domainFilter === "all" ? "كتالوج أحداث النظام" : `كتالوج أحداث النطاق — ${domainFilter}`,
                total,
                domainCount: domainKeys.length,
                criticalCount: catalog.filter((e: any) => e.critical).length,
                recentEventsCount: recentEvents.length,
                filter: domainFilter,
              },
              items: filteredCatalog.map((r: any) => ({
                "الحدث": r.action,
                "النطاق": r.domain || "—",
                "الوصف": r.label || "—",
                "حرج": r.critical ? "نعم" : "لا",
              })),
            })}
          />
          <RefreshAction onRefresh={() => refetch()} />
        </div>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{total}</p>
                <p className="text-xs text-muted-foreground">حدث مسجل</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{domainKeys.length}</p>
                <p className="text-xs text-muted-foreground">نطاق</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{catalog.filter((e: any) => e.critical).length}</p>
                <p className="text-xs text-muted-foreground">حدث حرج</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{recentEvents.length}</p>
                <p className="text-xs text-muted-foreground">أحداث أخيرة</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4" />
                توزيع الأحداث حسب النطاق
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {domainKeys.map((domain) => (
                  <Badge
                    key={domain}
                    variant={domainFilter === domain ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setDomainFilter(domainFilter === domain ? "all" : domain)}
                  >
                    {domain}: {byDomain[domain]}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {recentEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-status-warning" />
                  آخر 20 حدث فعلي
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable
                  columns={recentEventColumns}
                  data={recentEvents}
                  noToolbar
                  pageSize={0}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="w-4 h-4" />
                كتالوج الأحداث
                {domainFilter !== "all" && <Badge>{domainFilter}</Badge>}
                <span className="text-muted-foreground font-normal">({filteredCatalog.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={catalogColumns}
                data={filteredCatalog}
                noToolbar
                pageSize={0}
                emptyMessage="لا توجد أحداث"
                onRowClick={(r: any) => setSelectedEventName(r.action ?? r.name ?? null)}
              />
            </CardContent>
          </Card>

          {selectedEventName && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  تفاصيل الحدث <span className="font-mono text-xs">{selectedEventName}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {eventDetailQ.isLoading ? (
                  <p className="text-xs text-muted-foreground">جاري التحميل...</p>
                ) : eventDetailQ.data ? (
                  <pre className="text-xs bg-surface-subtle p-2 rounded max-h-48 overflow-y-auto">
                    {JSON.stringify(eventDetailQ.data, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">لا توجد بيانات</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}
