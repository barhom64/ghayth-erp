import { useState, Fragment } from "react";
import { getCurrencySymbol, formatCurrency } from "@/lib/formatters";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, AlertTriangle, Scale, DollarSign, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PaginationBar } from "@/components/data-table-wrapper";

const statusMap: Record<string, { label: string; color: string }> = {
  active: { label: "نشط", color: "bg-red-100 text-red-700" },
  open: { label: "مفتوح", color: "bg-yellow-100 text-yellow-700" },
  resolved: { label: "تم الحل", color: "bg-green-100 text-green-700" },
  appealed: { label: "تم الاستئناف", color: "bg-blue-100 text-blue-700" },
  cancelled: { label: "ملغي", color: "bg-gray-100 text-gray-700" },
  escalated: { label: "تصعيد", color: "bg-purple-100 text-purple-700" },
};

const severityMap: Record<string, { label: string; color: string }> = {
  low: { label: "منخفض", color: "bg-green-100 text-green-700" },
  medium: { label: "متوسط", color: "bg-yellow-100 text-yellow-700" },
  high: { label: "مرتفع", color: "bg-orange-100 text-orange-700" },
  critical: { label: "حرج", color: "bg-red-100 text-red-700" },
};

export default function ViolationsPage() {
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data, refetch } = useApiQuery<any>(["violations"], "/hr/violations");
  const { data: stats } = useApiQuery<any>(["violations-stats"], "/hr/violations-stats");
  const items = data?.data || [];

  const filtered = applyFilters(items, filters, { searchFields: ["employeeName"], statusField: "status", dateField: "createdAt" });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);
  const paginatedData = sortedData?.slice((page - 1) * pageSize, page * pageSize);

  const kpis = [
    { label: "إجمالي المخالفات", value: stats?.total ?? items.length, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "مخالفات نشطة", value: stats?.active ?? items.filter((v: any) => v.status === "active").length, icon: Scale, color: "text-yellow-600 bg-yellow-50" },
    { label: "إجمالي الخصومات", value: formatCurrency(stats?.totalDeductions ?? items.reduce((s: number, v: any) => s + Number(v.deduction || 0), 0)), icon: DollarSign, color: "text-orange-600 bg-orange-50" },
    { label: "تم الحل", value: items.filter((v: any) => v.status === "resolved" || v.status === "cancelled").length, icon: Shield, color: "text-green-600 bg-green-50" },
  ];

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/hr/violations",
    queryKeys: [["violations"], ["violations-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "type", label: "نوع المخالفة" },
    { key: "description", label: "الوصف" },
    { key: "severity", label: "الشدة", type: "select" as const, options: Object.entries(severityMap).map(([k, v]) => ({ value: k, label: v.label })) },
    { key: "deduction", label: "الخصم", type: "number" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: Object.entries(statusMap).map(([k, v]) => ({ value: k, label: v.label })) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">المخالفات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">إدارة مخالفات الموظفين والإجراءات التأديبية</p>
        </div>
        <Link href="/hr/violations/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة مخالفة</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم...",
          statuses: Object.entries(statusMap).map(([k, v]) => ({ value: k, label: v.label })),
          showDateRange: true,
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        resultCount={filtered.length}
      />

      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="employeeName" label="الموظف" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="type" label="نوع المخالفة" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="description" label="الوصف" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="severity" label="الشدة" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="deduction" label="الخصم" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
              <th className="p-3 text-start font-medium">إجراءات</th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(paginatedData || []).map((v: any) => (
              <Fragment key={v.id}>
                <tr className="border-b hover:bg-gray-50 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-700 text-xs font-bold">
                        {(v.employeeName || "؟").charAt(0)}
                      </div>
                      <span className="font-medium">{v.employeeName}</span>
                    </div>
                  </td>
                  <td className="p-3">{v.type || "-"}</td>
                  <td className="p-3 text-gray-500 max-w-48 truncate">{v.description || "-"}</td>
                  <td className="p-3"><Badge className={severityMap[v.severity]?.color || ""}>{severityMap[v.severity]?.label || v.severity || "-"}</Badge></td>
                  <td className="p-3 text-red-600 font-medium">{formatCurrency(Number(v.deduction || 0))}</td>
                  <td className="p-3"><StatusBadge status={v.status} /></td>
                  <td className="p-3">
                    <RowActions
                      onEdit={() => startEdit(v.id, { type: v.type || "", description: v.description || "", severity: v.severity || "medium", deduction: v.deduction || 0, status: v.status || "active" })}
                      onDelete={() => startDelete(v.id)}
                    />
                  </td>
                </tr>
                {editingId === v.id && (
                  <tr key={`edit-${v.id}`}><td colSpan={7} className="p-2">
                    <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(v.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                  </td></tr>
                )}
                {deletingId === v.id && (
                  <tr key={`del-${v.id}`}><td colSpan={7} className="p-2">
                    <InlineDeleteConfirm onConfirm={() => handleDelete(v.id)} onCancel={cancelDelete} isPending={isPending} itemName={v.employeeName} entityType="violation" entityId={v.id} />
                  </td></tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">لا توجد مخالفات</td></tr>}
          </TableBody>
        </Table>
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div></div>
    </div>
  );
}
