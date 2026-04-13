import { useApiQuery } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Car } from "lucide-react";
import { formatNumber } from "@/lib/formatters";

export function FleetTCOTab() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-fleet-tco"], "/bi/reports/fleet-tco");
  const rows = (data?.data || []) as any[];

  const columns: DataTableColumn<any>[] = [
    { key: "plateNumber", header: "رقم اللوحة", sortable: true, searchable: true, className: "font-medium", render: (r) => r.plateNumber },
    { key: "make", header: "النوع", sortable: true, searchable: true, render: (r) => `${r.make} ${r.model}` },
    { key: "year", header: "السنة", sortable: true, render: (r) => r.year || "-" },
    { key: "purchasePrice", header: "سعر الشراء", sortable: true, render: (r) => formatNumber(r.purchasePrice) },
    { key: "maintenanceCost", header: "تكلفة الصيانة", sortable: true, className: "text-orange-600", render: (r) => formatNumber(r.maintenanceCost) },
    { key: "fuelCost", header: "تكلفة الوقود", sortable: true, className: "text-amber-600", render: (r) => formatNumber(r.fuelCost) },
    { key: "insuranceCost", header: "التأمين", sortable: true, render: (r) => formatNumber(r.insuranceCost) },
    { key: "depreciation", header: "الإهلاك", sortable: true, render: (r) => formatNumber(r.depreciation) },
    { key: "tco", header: "التكلفة الإجمالية", sortable: true, className: "font-bold text-blue-600", render: (r) => formatNumber(r.tco) },
    { key: "costPerKm", header: "تكلفة/كم", sortable: true, className: "text-sm", render: (r) => r.costPerKm > 0 ? `${r.costPerKm} ر/كم` : "-" },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">تكلفة الأسطول الإجمالية</h2>
      <DataTable<any>
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        rowKey={(r) => r.vehicleId}
        searchPlaceholder="بحث بلوحة أو نوع المركبة..."
        emptyMessage="لا توجد مركبات"
        emptyIcon={<Car className="h-6 w-6 text-slate-400" />}
      />
    </div>
  );
}
