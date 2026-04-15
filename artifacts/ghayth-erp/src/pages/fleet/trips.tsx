import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PageShell } from "@/components/page-shell";

export default function TripsPage() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["trips"], "/fleet/trips");
  const items: any[] = data?.data || [];
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, {
    searchFields: ["driverName", "vehiclePlate", "origin", "destination"],
    statusField: "status",
    dateField: "tripDate",
  });

  const columns: DataTableColumn<any>[] = [
    { key: "driverName", header: "السائق", sortable: true, render: (t) => <span className="font-medium">{t.driverName}</span> },
    { key: "vehiclePlate", header: "المركبة", sortable: true, render: (t) => t.vehiclePlate || "-" },
    { key: "origin", header: "من / إلى", sortable: true, render: (t) => <span className="text-gray-500">{t.origin} → {t.destination}</span> },
    { key: "distance", header: "المسافة", sortable: true, render: (t) => `${t.distance} كم` },
    { key: "status", header: "الحالة", sortable: true, render: (t) => <StatusBadge status={t.status} /> },
  ];

  return (
    <PageShell
      title="الرحلات"
      subtitle="جدول رحلات الأسطول ومتابعتها"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "الرحلات" }]}
      loading={isLoading}
      actions={
        <Link href="/fleet/trips/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />رحلة جديدة</Button>
        </Link>
      }
    >
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالسائق أو المركبة أو الوجهة...",
          statuses: [
            { value: "planned", label: "مخطط" },
            { value: "in_progress", label: "جاري" },
            { value: "completed", label: "مكتمل" },
            { value: "cancelled", label: "ملغي" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered?.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد رحلات"
        noToolbar
        onRowClick={(t) => navigate(`/fleet/trips/${t.id}`)}
      />
    </PageShell>
  );
}
