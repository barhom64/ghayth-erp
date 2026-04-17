import { useApiQuery, asList } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Truck } from "lucide-react";
import { PageShell } from "@/components/page-shell";

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
  { key: "tripDate", header: "تاريخ الرحلة", sortable: true, render: (r) => r.tripDate ? new Date(r.tripDate).toLocaleDateString("ar-SA") : "-" },
  { key: "fromLocation", header: "من", searchable: true },
  { key: "toLocation", header: "إلى", searchable: true },
  { key: "capacity", header: "السعة" },
  { key: "pilgrimCount", header: "عدد المعتمرين" },
  { key: "cost", header: "التكلفة", render: (r) => r.cost ? `${Number(r.cost).toLocaleString("ar-SA")} ر.س` : "-" },
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

  return (
    <PageShell
      title="النقل والمواصلات"
      subtitle="إدارة رحلات نقل المعتمرين والمواصلات"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "النقل والمواصلات" }]}
      loading={isLoading}
    >
      <DataTable columns={columns} data={rows} isLoading={isLoading} isError={isError} error={error} />
    </PageShell>
  );
}
