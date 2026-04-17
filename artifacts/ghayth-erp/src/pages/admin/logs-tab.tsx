import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

const columns: DataTableColumn<any>[] = [
  { key: "userName", header: "المستخدم", searchable: true, render: (r) => r.userName || "-" },
  { key: "action", header: "الإجراء", searchable: true, render: (r) => r.action || "-" },
  { key: "module", header: "الوحدة", searchable: true, render: (r) => r.module || "-" },
  { key: "createdAt", header: "التاريخ", sortable: true, render: (r) => r.createdAt ? formatDateAr(r.createdAt) : "-" },
];

export function LogsTab() {
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["admin-logs"], "/settings/audit-log");
  const items = data?.data || [];
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">سجلات النظام</h3>
      <Card><CardContent className="p-0">
        <DataTable
          columns={columns}
          data={items}
          isLoading={isLoading}
          isError={isError}
          onRetry={refetch}
          emptyMessage="لا توجد سجلات"
          pageSize={20}
        />
      </CardContent></Card>
    </div>
  );
}
