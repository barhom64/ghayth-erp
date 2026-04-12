import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
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
  const { data: stats } = useApiQuery<any>(["properties-stats", scopeQueryString], `/properties/stats?${scopeQueryString}`);
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

  const columns: DataTableColumn<any>[] = [
    {
      key: "unitNumber",
      header: "رقم الوحدة",
      sortable: true,
      className: "font-mono",
      render: (u) => <Link href={`/properties/${u.id}`} className="hover:underline text-primary font-medium">{u.unitNumber}</Link>,
    },
    { key: "buildingName", header: "المبنى", sortable: true, render: (u) => u.buildingName || "—" },
    {
      key: "type",
      header: "النوع",
      sortable: true,
      render: (u) => u.type === 'apartment' ? 'شقة' : u.type === 'villa' ? 'فيلا' : u.type === 'office' ? 'مكتب' : u.type === 'shop' ? 'محل' : u.type === 'warehouse' ? 'مستودع' : u.type === 'land' ? 'أرض' : u.type,
    },
    { key: "area", header: "المساحة", sortable: true, render: (u) => u.area ? `${u.area} م²` : "—" },
    { key: "monthlyRent", header: "الإيجار", sortable: true, className: "font-bold", render: (u) => formatCurrency(u.monthlyRent || 0) },
    { key: "status", header: "الحالة", sortable: true, render: (u) => <StatusBadge status={u.status} /> },
    {
      key: "actions",
      header: "الإجراءات",
      render: (u) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Link href={`/properties/${u.id}`}><Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button></Link>
          {canManage && (
            <RowActions
              canEdit={canManage}
              onEdit={() => startEdit(u.id, { unitNumber: u.unitNumber || "", buildingName: u.buildingName || "", type: u.type || "apartment", area: u.area || 0, monthlyRent: u.monthlyRent || 0, status: u.status || "available" })}
              onDelete={() => startDelete(u.id)}
            />
          )}
        </div>
      ),
    },
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
        onExportCSV={() => exportToCSV(filtered || [], [
          { key: "unitNumber", label: "رقم الوحدة" },
          { key: "buildingName", label: "المبنى" },
          { key: "type", label: "النوع" },
          { key: "area", label: "المساحة" },
          { key: "monthlyRent", label: "الإيجار" },
          { key: "status", label: "الحالة" },
        ], "الوحدات")}
        resultCount={filtered?.length}
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building className="h-5 w-5 text-blue-500" /> الوحدات العقارية</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد وحدات"
            emptyIcon={<Building className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={pageSize}
            total={total}
            page={page}
            onPageChange={setPage}
            renderRowExtras={(u) => {
              if (editingId === u.id) {
                return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(u.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              }
              if (deletingId === u.id) {
                return <InlineDeleteConfirm onConfirm={() => handleDelete(u.id)} onCancel={cancelDelete} isPending={isPending} itemName={u.unitNumber} entityType="property_unit" entityId={u.id} />;
              }
              return null;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
