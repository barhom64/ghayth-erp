import { useState, Fragment } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useSortedData } from "@/hooks/use-sorted-data";
import { useApiQuery, asList } from "@/lib/api";
import { Building, Plus, Eye } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

export default function Properties() {
  const { roleLevel, permissions, scopeQueryString } = useAppContext();
  const canManage = permissions.canManageProperty || roleLevel >= 50;
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
  const { data: stats } = useApiQuery(["properties-stats", scopeQueryString], `/properties/stats?${scopeQueryString}`);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data: unitsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["property-units", String(page), scopeQueryString], `/properties/units?page=${page}&limit=${pageSize}${scopeSuffix}`
  );
  const units = asList(unitsResp);
  const total = unitsResp?.total || units.length;
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(units, filters, {
    searchFields: ["unitNumber", "buildingName"],
    statusField: "",
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/properties/units",
    queryKeys: [["property-units", String(page)], ["properties-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "unitNumber", label: "رقم الوحدة" },
    { key: "buildingName", label: "المبنى" },
    { key: "type", label: "النوع", type: "select" as const, options: [{ value: "apartment", label: "شقة" }, { value: "villa", label: "فيلا" }, { value: "office", label: "مكتب" }, { value: "shop", label: "محل" }] },
    { key: "area", label: "المساحة (م²)", type: "number" as const },
    { key: "monthlyRent", label: "الإيجار", type: "number" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "available", label: "متاحة" }, { value: "rented", label: "مؤجرة" }, { value: "under_maintenance", label: "صيانة" }] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الوحدات العقارية</h1>
          <p className="text-gray-500 text-sm mt-1">إدارة وتتبع الوحدات العقارية</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Link href="/properties/create">
              <Button className="gap-2"><Plus className="h-4 w-4" /> إضافة وحدة</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">إجمالي الوحدات</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.totalUnits || 0}</div></CardContent></Card>
        <Card className="bg-emerald-600 text-white"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">متاحة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.available || 0}</div></CardContent></Card>
        <Card className="bg-blue-600 text-white"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">مؤجرة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.rented || 0}</div></CardContent></Card>
        <Card className="bg-primary text-primary-foreground"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">إجمالي التحصيل</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(stats?.totalCollected || 0)}</div></CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث برقم الوحدة أو المبنى...",
          statuses: [
            { value: "available", label: "متاحة" },
            { value: "rented", label: "مؤجرة" },
            { value: "under_maintenance", label: "تحت الصيانة" },
          ],
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(sortedData || [], [
          { key: "unitNumber", label: "رقم الوحدة" },
          { key: "buildingName", label: "المبنى" },
          { key: "type", label: "النوع" },
          { key: "area", label: "المساحة" },
          { key: "monthlyRent", label: "الإيجار" },
          { key: "status", label: "الحالة" },
        ], "الوحدات")}
        resultCount={sortedData?.length}
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building className="h-5 w-5 text-blue-500" /> الوحدات العقارية</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="unitNumber" label="رقم الوحدة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="buildingName" label="المبنى" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="type" label="النوع" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="area" label="المساحة" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="monthlyRent" label="الإيجار" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
                <TableHead className="text-start">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={7} emptyMessage="لا توجد وحدات" emptyIcon={<Building className="h-6 w-6 text-slate-400" />}>
              {sortedData?.map(u => (
                <Fragment key={u.id}>
                  <TableRow>
                    <TableCell className="font-mono">
                      <Link href={`/properties/${u.id}`} className="hover:underline text-primary font-medium">{u.unitNumber}</Link>
                    </TableCell>
                    <TableCell>{u.buildingName || "—"}</TableCell>
                    <TableCell>{u.type === 'apartment' ? 'شقة' : u.type === 'villa' ? 'فيلا' : u.type === 'office' ? 'مكتب' : u.type === 'shop' ? 'محل' : u.type === 'warehouse' ? 'مستودع' : u.type === 'land' ? 'أرض' : u.type}</TableCell>
                    <TableCell>{u.area ? `${u.area} م²` : "—"}</TableCell>
                    <TableCell className="font-bold">{formatCurrency(u.monthlyRent || 0)}</TableCell>
                    <TableCell><StatusBadge status={u.status} /></TableCell>
                    <TableCell className="text-start">
                      <div className="flex items-center gap-1">
                        <Link href={`/properties/${u.id}`}><Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button></Link>
                        {canManage && (
                          <RowActions
                            canEdit={canManage}
                            onEdit={() => startEdit(u.id, { unitNumber: u.unitNumber || "", buildingName: u.buildingName || "", type: u.type || "apartment", area: u.area || 0, monthlyRent: u.monthlyRent || 0, status: u.status || "available" })}
                            onDelete={() => startDelete(u.id)}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {editingId === u.id && (
                    <TableRow key={`edit-${u.id}`}><TableCell colSpan={7}>
                      <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(u.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                    </TableCell></TableRow>
                  )}
                  {deletingId === u.id && (
                    <TableRow key={`del-${u.id}`}><TableCell colSpan={7}>
                      <InlineDeleteConfirm onConfirm={() => handleDelete(u.id)} onCancel={cancelDelete} isPending={isPending} itemName={u.unitNumber} entityType="property_unit" entityId={u.id} />
                    </TableCell></TableRow>
                  )}
                </Fragment>
              ))}
            </DataTableWrapper>
          </Table>
          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}

