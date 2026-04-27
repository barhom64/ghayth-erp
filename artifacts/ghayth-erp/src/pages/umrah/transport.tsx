import { useApiQuery, asList } from "@/lib/api";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/page-shell";
import { useLocation } from "wouter";
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
  vehiclePlate?: string;
  driverName?: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  scheduled: { label: "مجدولة", color: "bg-blue-100 text-blue-800" },
  in_progress: { label: "في الطريق", color: "bg-yellow-100 text-yellow-800" },
  completed: { label: "مكتملة", color: "bg-green-100 text-green-800" },
  cancelled: { label: "ملغاة", color: "bg-red-100 text-red-800" },
};

const columns: DataTableColumn<TransportEntry>[] = [
  { key: "tripDate", header: "تاريخ الرحلة", sortable: true, render: (r) => formatDateAr(r.tripDate) },
  { key: "fromLocation", header: "من", searchable: true },
  { key: "toLocation", header: "إلى", searchable: true },
  { key: "vehiclePlate", header: "المركبة", render: (r) => r.vehiclePlate || "-" },
  { key: "driverName", header: "السائق", render: (r) => r.driverName || "-" },
  { key: "capacity", header: "السعة" },
  { key: "pilgrimCount", header: "المعتمرين" },
  { key: "cost", header: "التكلفة", render: (r) => r.cost ? formatCurrency(Number(r.cost)) : "-" },
  {
    key: "status", header: "الحالة", sortable: true, render: (r) => {
      const s = STATUS_MAP[r.status || ""] || { label: r.status || "-", color: "bg-gray-100 text-gray-800" };
      return <Badge className={s.color}>{s.label}</Badge>;
    }
  },
];

export default function UmrahTransport() {
  const { data, isLoading, isError } = useApiQuery<any>(["umrah-transport"], "/umrah/transport");
  const rows = asList(data?.data || data);
  const [, navigate] = useLocation();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <PageShell
      title="النقل والمواصلات"
      subtitle="إدارة رحلات نقل المعتمرين والمواصلات"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "النقل والمواصلات" }]}
    >
      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(r) => navigate(`/umrah/transport/${r.id}`)}
        emptyMessage="لا توجد رحلات نقل مسجلة"
      />
    </PageShell>
  );
}
