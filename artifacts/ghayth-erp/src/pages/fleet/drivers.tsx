import { Fragment, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Eye, Users, UserCheck, UserX, Car, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useSortedData } from "@/hooks/use-sorted-data";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";

export default function DriversPage() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["drivers"], "/fleet/drivers");
  const items = data?.data || [];
  const [previewDriver, setPreviewDriver] = useState<any>(null);
  const [search, setSearch] = useState("");

  const filtered = items.filter((d: any) => {
    if (!search) return true;
    return d.name?.includes(search) || d.phone?.includes(search) || d.licenseNumber?.includes(search);
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);
  const driverFields: PreviewField[] = [
    { label: "الاسم", key: "name" },
    { label: "الهاتف", key: "phone" },
    { label: "رقم الرخصة", key: "licenseNumber" },
    { label: "نوع الرخصة", key: "licenseType", type: "badge" },
    { label: "انتهاء الرخصة", key: "licenseExpiry", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/fleet/drivers",
    queryKeys: [["drivers"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "name", label: "الاسم" },
    { key: "phone", label: "الهاتف" },
    { key: "licenseNumber", label: "الرخصة" },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "غير نشط" }] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">السائقين</h1>
        <Link href="/fleet/drivers/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة سائق</Button>
        </Link>
      </div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {[
          { label: "إجمالي السائقين", value: items.length, icon: Users, color: "text-blue-600 bg-blue-50" },
          { label: "نشطين", value: items.filter((d: any) => d.status === "active").length, icon: UserCheck, color: "text-green-600 bg-green-50" },
          { label: "غير نشطين", value: items.filter((d: any) => d.status !== "active").length, icon: UserX, color: "text-red-600 bg-red-50" },
          { label: "المركبات المسندة", value: items.filter((d: any) => d.vehicleId).length, icon: Car, color: "text-purple-600 bg-purple-50" },
        ].map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input className="ps-9" placeholder="بحث بالاسم أو الهاتف أو الرخصة..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="name" label="الاسم" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="phone" label="الهاتف" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="licenseType" label="الرخصة" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="licenseExpiry" label="انتهاء الرخصة" sortState={sortState} onSort={handleSort} />
              <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
              <TableHead className="text-start">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <DataTableWrapper
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={() => refetch()}
            data={filtered}
            colCount={6}
            emptyMessage="لا يوجد سائقين"
            emptyIcon={<Users className="h-6 w-6 text-slate-400" />}
          >
            {(sortedData || []).map((d: any) => (
              <Fragment key={d.id}>
                <TableRow>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-gray-500">{d.phone || "-"}</TableCell>
                  <TableCell>{d.licenseNumber || "-"}</TableCell>
                  <TableCell className="text-gray-500">{d.licenseExpiry || "-"}</TableCell>
                  <TableCell><Badge className={d.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>{d.status === "active" ? "نشط" : "غير نشط"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setPreviewDriver(d)}><Eye className="h-4 w-4" /></Button>
                      <RowActions
                        onEdit={() => startEdit(d.id, { name: d.name, phone: d.phone || "", licenseNumber: d.licenseNumber || "", status: d.status || "active" })}
                        onDelete={() => startDelete(d.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
                {editingId === d.id && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(d.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                    </TableCell>
                  </TableRow>
                )}
                {deletingId === d.id && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <InlineDeleteConfirm onConfirm={() => handleDelete(d.id)} onCancel={cancelDelete} isPending={isPending} itemName={d.name} entityType="driver" entityId={d.id} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper>
        </Table>
      </div>
      <QuickPreviewDialog open={!!previewDriver} onOpenChange={() => setPreviewDriver(null)} title="تفاصيل السائق" data={previewDriver} fields={driverFields} />
    </div>
  );
}
