import { Link } from "wouter";
import { formatCurrency } from "@/lib/formatters";
import { useApiQuery, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Plus, Fuel, Droplets, DollarSign, CalendarDays } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useAppContext } from "@/contexts/app-context";
import { KpiGrid } from "@/components/shared/kpi-card";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";

export default function FuelPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["fuel", scopeQueryString], `/fleet/fuel-logs${scopeSuffix}`);
  const items = asList(data);

  const columns: DataTableColumn<any>[] = [
    { key: "vehiclePlate", header: "المركبة", sortable: true, searchable: true, render: (f) => <span className="font-medium">{f.vehiclePlate}</span> },
    { key: "liters", header: "اللترات", sortable: true, render: (f) => `${f.liters} لتر` },
    { key: "cost", header: "التكلفة", sortable: true, render: (f) => <span className="font-semibold">{formatCurrency(Number(f.cost))}</span> },
    { key: "odometer", header: "العداد", sortable: true, sortKey: "mileage", render: (f) => <span className="text-gray-500">{f.mileage} كم</span> },
    { key: "date", header: "التاريخ", sortable: true, render: (f) => <span className="text-gray-500">{f.date || "-"}</span> },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="استهلاك الوقود"
      subtitle="سجلات تعبئة وقود المركبات"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "استهلاك الوقود" }]}
      loading={isLoading}
      actions={
        <Link href="/fleet/fuel/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />تسجيل تعبئة</Button>
        </Link>
      }
    >
      <FleetTabsNav />
      <KpiGrid items={[
        { label: "إجمالي السجلات", value: items.length, icon: Fuel, color: "text-blue-600 bg-blue-50" },
        { label: "إجمالي اللترات", value: items.reduce((s: number, f: any) => s + (Number(f.liters) || 0), 0).toLocaleString(), icon: Droplets, color: "text-cyan-600 bg-cyan-50" },
        { label: "إجمالي التكلفة", value: formatCurrency(items.reduce((s: number, f: any) => s + (Number(f.cost) || 0), 0)), icon: DollarSign, color: "text-red-600 bg-red-50" },
        { label: "هذا الشهر", value: items.filter((f: any) => { const d = f.date ? new Date(f.date) : null; const now = new Date(); return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length, icon: CalendarDays, color: "text-green-600 bg-green-50" },
      ]} />

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        searchPlaceholder="بحث بالمركبة..."
        emptyMessage="لا توجد سجلات وقود"
      />
    </PageShell>
  );
}
