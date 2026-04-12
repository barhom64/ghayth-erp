import { Link } from "wouter";
import { formatCurrency } from "@/lib/formatters";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

export default function FleetMaintenancePage() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["fleet-maintenance"], "/fleet/maintenance");
  const items: any[] = data?.data || [];

  const columns: DataTableColumn<any>[] = [
    { key: "vehiclePlate", header: "المركبة", sortable: true, searchable: true, render: (m) => <span className="font-medium">{m.vehiclePlate}</span> },
    { key: "type", header: "النوع", sortable: true, searchable: true, render: (m) => m.type || "-" },
    { key: "cost", header: "التكلفة", sortable: true, render: (m) => <span className="font-semibold">{formatCurrency(Number(m.cost))}</span> },
    { key: "workshop", header: "الورشة", sortable: true, searchable: true, render: (m) => <span className="text-gray-500">{m.workshop || "-"}</span> },
    { key: "date", header: "التاريخ", sortable: true, render: (m) => <span className="text-gray-500">{m.date || "-"}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">صيانة المركبات</h1>
        <Link href="/fleet/maintenance/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة صيانة</Button>
        </Link>
      </div>
      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        searchPlaceholder="بحث بالمركبة أو النوع أو الورشة..."
        emptyMessage="لا توجد سجلات صيانة"
      />
    </div>
  );
}
