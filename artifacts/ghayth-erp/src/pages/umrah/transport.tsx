import { useApiQuery, asList } from "@/lib/api";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Truck } from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

interface TransportEntry {
  id: number;
  tripDate?: string;
  fromLocation?: string;
  toLocation?: string;
  capacity?: number;
  pilgrimCount?: number;
  cost?: number;
  status?: string;
  notes?: string;
}

const columns: DataTableColumn<TransportEntry>[] = [
  { key: "tripDate", header: "تاريخ الرحلة", sortable: true, render: (r) => formatDateAr(r.tripDate) },
  { key: "fromLocation", header: "من", searchable: true },
  { key: "toLocation", header: "إلى", searchable: true },
  { key: "capacity", header: "السعة" },
  { key: "pilgrimCount", header: "عدد المعتمرين" },
  { key: "cost", header: "التكلفة", render: (r) => r.cost ? formatCurrency(Number(r.cost)) : "-" },
  {
    key: "status", header: "الحالة", render: (r) => {
      const v = r.status;
      const colors: Record<string, string> = { scheduled: "bg-blue-100 text-blue-800", completed: "bg-green-100 text-green-800", cancelled: "bg-red-100 text-red-800", in_transit: "bg-yellow-100 text-yellow-800" };
      return <Badge className={colors[v || ""] || "bg-gray-100 text-gray-800"}>{v === "scheduled" ? "مجدولة" : v === "completed" ? "مكتملة" : v === "cancelled" ? "ملغاة" : v === "in_transit" ? "في الطريق" : v || "-"}</Badge>;
    }
  },
  { key: "notes", header: "ملاحظات", render: (r) => <span className="line-clamp-1">{r.notes || "-"}</span> },
];

export default function UmrahTransport() {
  const { data, isLoading, isError, error } = useApiQuery<any>(["umrah-transport"], "/umrah/transport");
  const rows = asList(data?.data || data);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6" /> النقل والمواصلات</h1>
        <p className="text-muted-foreground mt-1">إدارة رحلات نقل المعتمرين والمواصلات</p>
      </div>
      <DataTable columns={columns} data={rows} isLoading={isLoading} isError={isError} error={error} />
    </div>
  );
}
