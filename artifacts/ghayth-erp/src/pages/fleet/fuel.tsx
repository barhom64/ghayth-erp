import { Link } from "wouter";
import { formatCurrency } from "@/lib/formatters";
import { useApiQuery, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useAppContext } from "@/contexts/app-context";

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">استهلاك الوقود</h1>
          <p className="text-sm text-muted-foreground mt-0.5">سجلات تعبئة وقود المركبات</p>
        </div>
        <Link href="/fleet/fuel/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />تسجيل تعبئة</Button>
        </Link>
      </div>

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
    </div>
  );
}
