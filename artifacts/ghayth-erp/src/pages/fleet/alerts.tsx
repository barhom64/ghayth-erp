import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { AlertTriangle, Bell, AlertOctagon, ShieldAlert, CheckCircle, BellOff } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  PageShell,
  exportToCSV,
} from "@workspace/ui-core";
import { KpiGrid } from "@/components/shared/kpi-card";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageStatusBadge, resolveStatus } from "@workspace/ui-core";

const TYPE_LABELS: Record<string, string> = {
  insurance_expiry: "انتهاء تأمين",
  driver_license_expiry: "انتهاء رخصة سائق",
  registration_expiry: "انتهاء ترخيص",
  oil_change_due: "تغيير زيت",
  tire_replacement_due: "استبدال إطارات",
  inspection_overdue: "فحص دوري متأخر",
  abnormal_fuel: "استهلاك وقود مرتفع",
  high_fuel_consumption: "استهلاك وقود مرتفع",
  excessive_idle_time: "خمول مفرط",
  speed_violation: "تجاوز سرعة",
  frequent_breakdowns: "أعطال متكرّرة",
  low_driver_rating: "تقييم سائق منخفض",
  maintenance: "صيانة",
  fuel: "وقود",
  violation: "مخالفة",
};


export default function FleetAlerts() {
  const [filters, setFilters] = useFilters();
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const pageSize = 20;
  const { data: alertsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["fleet-alerts"],
    "/fleet/alerts",
  );
  const allAlerts = asList(alertsResp);

  const ackMut = useApiMutation<any, { id: number }>(
    (body) => `/fleet/alerts/${body.id}/acknowledge`,
    "POST",
    [["fleet-alerts"]],
    { successMessage: "تمت معاينة التنبيه" },
  );
  const dismissMut = useApiMutation<any, { id: number }>(
    (body) => `/fleet/alerts/${body.id}/dismiss`,
    "POST",
    [["fleet-alerts"]],
    { successMessage: "تم تجاهل التنبيه" },
  );

  const filteredByStatus = statusFilter === "all"
    ? allAlerts
    : allAlerts.filter((a: any) => a.status === statusFilter);

  const uniqueTypes = Array.from(new Set(filteredByStatus.map((a: any) => a.type))) as string[];
  const filtered = applyFilters(filteredByStatus, filters, { searchFields: ["message", "vehicle", "driver"], statusField: "type" });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const columns: DataTableColumn<any>[] = [
    {
      key: "type", header: "النوع", sortable: true,
      render: (a) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          a.type?.includes("expiry") || a.severity === "blocked" || a.severity === "critical" ? "bg-rose-100 text-rose-700" :
          a.type?.includes("fuel") ? "bg-status-warning-surface text-status-warning-foreground" :
          "bg-status-info-surface text-status-info-foreground"
        }`}>{TYPE_LABELS[a.type] || a.type}</span>
      ),
    },
    { key: "subject", header: "المركبة / السائق", sortable: true, render: (a) => a.vehicle || a.driver || "—" },
    { key: "message", header: "الرسالة", sortable: true, className: "max-w-[360px]", render: (a) => a.message || "—" },
    {
      key: "status", header: "الحالة", sortable: true,
      render: (a) => <PageStatusBadge status={a.status} domain="fleet_alert" />,
    },
    {
      key: "actions", header: "إجراء",
      render: (a) => (
        <div className="inline-flex items-center gap-1">
          {a.status === "active" && (
            <GuardedButton perm="fleet.vehicles:update" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" disabled={ackMut.isPending} onClick={() => ackMut.mutate({ id: a.id })}>
              <CheckCircle className="h-3 w-3 ml-1" /> معاينة
            </GuardedButton>
          )}
          {a.status !== "dismissed" && (
            <GuardedButton perm="fleet.vehicles:update" variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground" disabled={dismissMut.isPending} onClick={() => dismissMut.mutate({ id: a.id })}>
              <BellOff className="h-3 w-3 ml-1" /> تجاهل
            </GuardedButton>
          )}
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="تنبيهات الأسطول"
      subtitle="تنبيهات مُشتقّة تلقائيًا من بيانات الأسطول — اعتمدها أو تجاهلها بدل إنشاء سجل صيانة يدويًا."
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "تنبيهات الأسطول" }]}
      loading={isLoading}
      actions={
        <>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">نشطة</SelectItem>
              <SelectItem value="acknowledged">معتمَدة</SelectItem>
              <SelectItem value="all">الكل</SelectItem>
            </SelectContent>
          </Select>
          <PrintButton
            entityType="report_fleet_alerts"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "تنبيهات الأسطول", total: printRows.length },
              items: printRows.map((a: any) => ({
                "النوع": TYPE_LABELS[a.type] || a.type || "—",
                "المركبة": a.vehicle || a.plateNumber || "—",
                "السائق": a.driver || a.driverName || "—",
                "الرسالة": a.message || "—",
                "الشدة": a.severity || "—",
                "التاريخ": a.createdAt || a.alertDate || "—",
                "الحالة": resolveStatus(a.status, "fleet_alert")?.label || a.status || "—",
              })),
            })}
          />
        </>
      }
    >
      <FleetTabsNav />
      <KpiGrid items={[
        { label: "إجمالي التنبيهات", value: allAlerts.length, icon: Bell, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "حرجة", value: allAlerts.filter((a: any) => a.severity === "critical" || a.severity === "blocked").length, icon: AlertOctagon, color: "text-status-error-foreground bg-status-error-surface" },
        { label: "عالية", value: allAlerts.filter((a: any) => a.severity === "high").length, icon: ShieldAlert, color: "text-status-warning-foreground bg-status-warning-surface" },
        { label: "تمت المعاينة", value: allAlerts.filter((a: any) => a.status === "acknowledged").length, icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
      ]} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث في التنبيهات...",
          statuses: uniqueTypes.map((t: string) => ({ value: t, label: TYPE_LABELS[t] || t })),
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "plateNumber", label: "رقم اللوحة" },
              { key: "vehicleName", label: "المركبة" },
              { key: "type", label: "نوع التنبيه" },
              { key: "severity", label: "الخطورة" },
              { key: "message", label: "الرسالة" },
              { key: "dueDate", label: "تاريخ الاستحقاق" },
              { key: "status", label: "الحالة" },
              { key: "createdAt", label: "تاريخ الإنشاء" },
            ],
            "تنبيهات-الأسطول",
          )
        }
        resultCount={filtered.length}
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> التنبيهات</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            onSortedDataChange={setPrintRows}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد تنبيهات في هذه الحالة"
            emptyIcon={<AlertTriangle className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={pageSize}
            rowClassName={(a) => (a.severity === "critical" || a.severity === "blocked") ? "bg-rose-50" : undefined}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
