import { useApiQuery } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";

const logColumns: DataTableColumn<any>[] = [
  {
    key: "userName",
    header: "المستخدم",
    sortable: true,
    searchable: true,
    render: (l) => <span className="font-medium">{l.userName || "-"}</span>,
  },
  {
    key: "action",
    header: "الإجراء",
    sortable: true,
    searchable: true,
  },
  {
    key: "module",
    header: "الوحدة",
    sortable: true,
    searchable: true,
    className: "text-muted-foreground",
  },
  {
    key: "createdAt",
    header: "التاريخ",
    sortable: true,
    className: "text-xs text-muted-foreground",
    render: (l) => (
      <span className="text-xs text-muted-foreground">
        {l.createdAt ? formatDateAr(l.createdAt) : "-"}
      </span>
    ),
  },
];

export function LogsTab() {
  const { data, isLoading, isError } = useApiQuery<any>(["admin-logs"], "/settings/audit-log");

  const items = data?.data || [];
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">سجلات النظام</h3>
      <DataTable
        columns={logColumns}
        data={items}
        isLoading={isLoading}
        isError={isError}
       
        searchPlaceholder="بحث في السجلات..."
        emptyMessage="لا توجد سجلات"
        pageSize={20}
      />
    </div>
  );
}
