import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApiQuery, asList } from "@/lib/api";
import { AlertTriangle, Bell, Plus, AlertOctagon, ShieldAlert, CheckCircle } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { KpiGrid } from "@/components/shared/kpi-card";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";

export default function FleetAlerts() {
  const [filters, setFilters] = useFilters();
  const pageSize = 20;
  const { data: alertsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["fleet-alerts"], "/fleet/alerts"
  );
  const allAlertsRaw = asList(alertsResp);
  // Ensure each row has a numeric id for DataTable (some alerts may not have id).
  const allAlerts = allAlertsRaw.map((a: any, idx: number) => ({ ...a, id: typeof a.id === "number" ? a.id : idx + 1 }));

  const typeLabels: Record<string, string> = {
    insurance_expiry: "انتهاء تأمين",
    registration_expiry: "انتهاء ترخيص",
    oil_change_due: "تغيير زيت",
    tire_replacement_due: "استبدال إطارات",
    inspection_overdue: "فحص دوري متأخر",
    high_fuel_consumption: "استهلاك وقود مرتفع",
    excessive_idle_time: "خمول مفرط",
    maintenance: "صيانة",
    fuel: "وقود",
    violation: "مخالفة",
  };

  const uniqueTypes = [...new Set(allAlerts.map((a: any) => a.type))] as string[];

  const filtered = applyFilters(allAlerts, filters, { searchFields: ["message", "vehicle", "plateNumber"], statusField: "type" });

  const columns: DataTableColumn<any>[] = [
    {
      key: "type",
      header: "النوع",
      sortable: true,
      render: (a) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          a.type?.includes('expiry') || a.type?.includes('overdue') ? 'bg-rose-100 text-rose-700' :
          a.type?.includes('fuel') ? 'bg-amber-100 text-amber-700' :
          'bg-blue-100 text-blue-700'
        }`}>
          {typeLabels[a.type] || a.type}
        </span>
      ),
    },
    {
      key: "vehiclePlate",
      header: "المركبة",
      sortable: true,
      className: "font-mono",
      render: (a) => a.vehicle || a.plateNumber || "-",
    },
    {
      key: "message",
      header: "الرسالة",
      sortable: true,
      className: "max-w-[400px]",
      render: (a) => a.message || "-",
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="تنبيهات الأسطول"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "تنبيهات الأسطول" }]}
      loading={isLoading}
      actions={
        <Link href="/fleet/alerts/create">
          <GuardedButton perm="fleet:create" className="gap-2"><Plus className="h-4 w-4" /> إضافة تنبيه</GuardedButton>
        </Link>
      }
    >
      <FleetTabsNav />
      <KpiGrid items={[
        { label: "إجمالي التنبيهات", value: allAlerts.length, icon: Bell, color: "text-blue-600 bg-blue-50" },
        { label: "حرجة", value: allAlerts.filter((a: any) => a.severity === "critical" || a.type?.includes("overdue")).length, icon: AlertOctagon, color: "text-red-600 bg-red-50" },
        { label: "عالية", value: allAlerts.filter((a: any) => a.severity === "high" || a.type?.includes("expiry")).length, icon: ShieldAlert, color: "text-amber-600 bg-amber-50" },
        { label: "تم الحل", value: allAlerts.filter((a: any) => a.status === "resolved").length, icon: CheckCircle, color: "text-green-600 bg-green-50" },
      ]} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث في التنبيهات...",
          statuses: uniqueTypes.map((t: string) => ({ value: t, label: typeLabels[t] || t })),
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> التنبيهات</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد تنبيهات حالياً"
            emptyIcon={<AlertTriangle className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={pageSize}
            rowClassName={(a) => (a.type?.includes('expiry') || a.type?.includes('overdue')) ? 'bg-rose-50' : undefined}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
