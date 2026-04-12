import { useState } from "react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useApiQuery, asList } from "@/lib/api";
import { Car, Users, MapPin, Wrench, Fuel, Plus, Eye, FileCheck, Link2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { useAppContext } from "@/contexts/app-context";

export default function Fleet() {
  const [tab, setTab] = useState("vehicles");
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">إدارة الأسطول</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="vehicles" className="gap-2"><Car className="h-4 w-4" /> المركبات</TabsTrigger>
          <TabsTrigger value="drivers" className="gap-2"><Users className="h-4 w-4" /> السائقون</TabsTrigger>
          <TabsTrigger value="trips" className="gap-2"><MapPin className="h-4 w-4" /> الرحلات</TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-2"><Wrench className="h-4 w-4" /> الصيانة</TabsTrigger>
          <TabsTrigger value="fuel" className="gap-2"><Fuel className="h-4 w-4" /> الوقود</TabsTrigger>
        </TabsList>
        <TabsContent value="vehicles" className="mt-6"><VehiclesTab /></TabsContent>
        <TabsContent value="drivers" className="mt-6"><DriversTab /></TabsContent>
        <TabsContent value="trips" className="mt-6"><TripsTab /></TabsContent>
        <TabsContent value="maintenance" className="mt-6"><MaintenanceTab /></TabsContent>
        <TabsContent value="fuel" className="mt-6"><FuelTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function VehiclesTab() {
  const { permissions, scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
  const { data: stats } = useApiQuery<any>(["fleet-stats", scopeQueryString], `/fleet/stats${scopeQueryString ? `?${scopeQueryString}` : ""}`);
  const [page, setPage] = useState(1);
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [filters, setFilters] = useFilters();
  const pageSize = 20;
  const canManage = permissions.canManageFleet;
  const { data: vehiclesResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["fleet-vehicles", String(page), scopeQueryString], `/fleet/vehicles?page=${page}&limit=${pageSize}${scopeSuffix}`
  );
  const vehicles = asList(vehiclesResp);
  const total = vehiclesResp?.total || vehicles.length;

  const filtered = applyFilters(vehicles, filters, {
    searchFields: ["plateNumber", "make", "model", "driverName"],
    statusField: "",
    dateField: "",
  });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/fleet/vehicles",
    queryKeys: [["fleet-vehicles", String(page)], ["fleet-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "plateNumber", label: "اللوحة" },
    { key: "make", label: "الشركة المصنعة" },
    { key: "model", label: "الموديل" },
    { key: "color", label: "اللون" },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "available", label: "متاحة" }, { value: "in_use", label: "قيد الاستخدام" }, { value: "maintenance", label: "في الصيانة" }] },
  ];

  const previewFields: PreviewField[] = [
    { label: "رقم اللوحة", key: "plateNumber" },
    { label: "الشركة المصنعة", key: "make" },
    { label: "الموديل", key: "model" },
    { label: "السنة", key: "year" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "plateNumber",
      header: "اللوحة",
      sortable: true,
      className: "font-mono",
      render: (v) => <Link href={`/fleet/${v.id}`} className="hover:underline text-primary font-medium">{v.plateNumber}</Link>,
    },
    {
      key: "make",
      header: "المركبة",
      sortable: true,
      render: (v) => `${v.make} ${v.model} ${v.year}`,
    },
    { key: "color", header: "اللون", sortable: true, render: (v) => v.color || "-" },
    {
      key: "currentMileage",
      header: "المسافة",
      sortable: true,
      ltr: true,
      className: "text-right",
      render: (v) => `${formatNumber(v.currentMileage || 0)} كم`,
    },
    { key: "driverName", header: "السائق", sortable: true, render: (v) => v.driverName || "-" },
    { key: "status", header: "الحالة", sortable: true, render: (v) => <StatusBadge status={v.status} /> },
    {
      key: "registration",
      header: "الاستمارة",
      render: (v) => (
        <div className="flex flex-col gap-1">
          {v.registrationExpiry ? (() => {
            const daysLeft = Math.ceil((new Date(v.registrationExpiry).getTime() - Date.now()) / 86400000);
            return daysLeft <= 0 ? <Badge variant="destructive" className="text-xs gap-1"><FileCheck className="h-3 w-3" />استمارة منتهية</Badge>
              : daysLeft <= 30 ? <Badge className="text-xs gap-1 bg-amber-100 text-amber-700 hover:bg-amber-100"><FileCheck className="h-3 w-3" />استمارة: {daysLeft} يوم</Badge>
              : <Badge variant="outline" className="text-xs gap-1 text-green-700"><FileCheck className="h-3 w-3" />استمارة سارية</Badge>;
          })() : <span className="text-xs text-muted-foreground">—</span>}
          {v.insuranceExpiry ? (() => {
            const daysLeft = Math.ceil((new Date(v.insuranceExpiry).getTime() - Date.now()) / 86400000);
            return daysLeft <= 0 ? <Badge variant="destructive" className="text-xs gap-1"><ShieldAlert className="h-3 w-3" />تأمين منتهٍ</Badge>
              : daysLeft <= 30 ? <Badge className="text-xs gap-1 bg-orange-100 text-orange-700 hover:bg-orange-100"><ShieldAlert className="h-3 w-3" />تأمين: {daysLeft} يوم</Badge>
              : null;
          })() : null}
          {v.govLinkCount > 0 && <Badge variant="secondary" className="text-xs gap-1"><Link2 className="h-3 w-3" />مرتبط ({v.govLinkCount})</Badge>}
        </div>
      ),
    },
    {
      key: "actions",
      header: "الإجراءات",
      render: (v) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => setPreviewItem(v)}><Eye className="h-4 w-4" /></Button>
          <RowActions
            canEdit={canManage}
            onEdit={() => startEdit(v.id, { plateNumber: v.plateNumber, make: v.make || "", model: v.model || "", color: v.color || "", status: v.status || "available" })}
            onDelete={() => startDelete(v.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">إجمالي المركبات</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.vehicles?.total || 0}</div></CardContent></Card>
        <Card className="bg-emerald-600 text-white"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">متاحة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.vehicles?.available || 0}</div></CardContent></Card>
        <Card className="bg-blue-600 text-white"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">قيد الاستخدام</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.vehicles?.inUse || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-amber-600">في الصيانة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{stats?.vehicles?.inMaintenance || 0}</div></CardContent></Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث باللوحة أو المركبة...",
              statuses: [
                { value: "available", label: "متاحة" },
                { value: "in_use", label: "قيد الاستخدام" },
                { value: "maintenance", label: "في الصيانة" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered || [], [
              { key: "plateNumber", label: "اللوحة" },
              { key: "make", label: "الشركة المصنعة" },
              { key: "model", label: "الموديل" },
              { key: "color", label: "اللون" },
              { key: "currentMileage", label: "المسافة" },
              { key: "driverName", label: "السائق" },
              { key: "status", label: "الحالة" },
            ], "المركبات")}
            resultCount={filtered?.length}
          />
        </div>
        {canManage && <Link href="/fleet/vehicles/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة مركبة</Button></Link>}
      </div>

      <Card>
        <CardHeader><CardTitle>المركبات</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد مركبات"
            emptyIcon={<Car className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={pageSize}
            total={total}
            page={page}
            onPageChange={setPage}
            renderRowExtras={(v) => {
              if (editingId === v.id) {
                return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(v.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              }
              if (deletingId === v.id) {
                return <InlineDeleteConfirm onConfirm={() => handleDelete(v.id)} onCancel={cancelDelete} isPending={isPending} itemName={v.plateNumber} entityType="vehicle" entityId={v.id} />;
              }
              return null;
            }}
          />
        </CardContent>
      </Card>
      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة المركبة" data={previewItem} fields={previewFields} />
    </div>
  );
}

function DriversTab() {
  const { permissions, scopeQueryString } = useAppContext();
  const canManage = permissions.canManageFleet;
  const { data: driversResp, isLoading, isError, error, refetch } = useApiQuery<any>(["fleet-drivers", scopeQueryString], `/fleet/drivers${scopeQueryString ? `?${scopeQueryString}` : ""}`);
  const drivers = asList(driversResp);
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(drivers, filters, {
    searchFields: ["name", "phone", "licenseNumber"],
    statusField: "",
  });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/fleet/drivers",
    queryKeys: [["fleet-drivers"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "name", label: "الاسم" },
    { key: "phone", label: "الهاتف" },
    { key: "licenseNumber", label: "رقم الرخصة" },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "غير نشط" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "الاسم", sortable: true, className: "font-medium" },
    { key: "phone", header: "الهاتف", sortable: true, ltr: true, className: "text-right", render: (d) => d.phone || "-" },
    { key: "licenseNumber", header: "رقم الرخصة", sortable: true, render: (d) => d.licenseNumber || "-" },
    { key: "rating", header: "التقييم", sortable: true, render: (d) => <>⭐ {d.rating}</> },
    { key: "totalTrips", header: "الرحلات", sortable: true },
    { key: "status", header: "الحالة", sortable: true, render: (d) => <StatusBadge status={d.status} /> },
    {
      key: "actions",
      header: "الإجراءات",
      render: (d) => (
        <div onClick={(e) => e.stopPropagation()}>
          <RowActions
            canEdit={canManage}
            onEdit={() => startEdit(d.id, { name: d.name, phone: d.phone || "", licenseNumber: d.licenseNumber || "", status: d.status || "active" })}
            onDelete={() => startDelete(d.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالاسم أو الهاتف أو الرخصة...",
              statuses: [
                { value: "active", label: "نشط" },
                { value: "inactive", label: "غير نشط" },
              ],
              showDateRange: false,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered || [], [
              { key: "name", label: "الاسم" },
              { key: "phone", label: "الهاتف" },
              { key: "licenseNumber", label: "رقم الرخصة" },
              { key: "rating", label: "التقييم" },
              { key: "totalTrips", label: "الرحلات" },
              { key: "status", label: "الحالة" },
            ], "السائقون")}
            resultCount={filtered?.length}
          />
        </div>
        <Link href="/fleet/drivers/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة سائق</Button></Link>
      </div>
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا يوجد سائقون"
            emptyIcon={<Users className="h-6 w-6 text-slate-400" />}
            noToolbar
            renderRowExtras={(d) => {
              if (editingId === d.id) {
                return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(d.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              }
              if (deletingId === d.id) {
                return <InlineDeleteConfirm onConfirm={() => handleDelete(d.id)} onCancel={cancelDelete} isPending={isPending} itemName={d.name} entityType="driver" entityId={d.id} />;
              }
              return null;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function TripsTab() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useFilters();
  const pageSize = 20;
  const { data: tripsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["fleet-trips", String(page)], `/fleet/trips?page=${page}&limit=${pageSize}`
  );
  const trips = asList(tripsResp);
  const total = tripsResp?.total || trips.length;

  const filtered = applyFilters(trips, filters, {
    searchFields: ["plateNumber", "driverName"],
    statusField: "",
    dateField: "",
  });

  const columns: DataTableColumn<any>[] = [
    { key: "plateNumber", header: "المركبة", sortable: true, render: (t) => t.plateNumber || "-" },
    { key: "driverName", header: "السائق", sortable: true, render: (t) => t.driverName || "-" },
    { key: "fromLocation", header: "من", sortable: true, className: "max-w-[150px] truncate", render: (t) => t.fromLocation || "-" },
    { key: "toLocation", header: "إلى", sortable: true, className: "max-w-[150px] truncate", render: (t) => t.toLocation || "-" },
    { key: "distance", header: "المسافة", sortable: true, ltr: true, className: "text-right", render: (t) => t.distance ? `${t.distance} كم` : "-" },
    { key: "status", header: "الحالة", sortable: true, render: (t) => <StatusBadge status={t.status} /> },
  ];

  return (
    <div className="space-y-4">
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمركبة أو السائق...",
          statuses: [
            { value: "scheduled", label: "مجدولة" },
            { value: "in_progress", label: "جارية" },
            { value: "completed", label: "مكتملة" },
            { value: "cancelled", label: "ملغاة" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(filtered || [], [
          { key: "plateNumber", label: "المركبة" },
          { key: "driverName", label: "السائق" },
          { key: "fromLocation", label: "من" },
          { key: "toLocation", label: "إلى" },
          { key: "distance", label: "المسافة" },
          { key: "status", label: "الحالة" },
        ], "الرحلات")}
        resultCount={filtered?.length}
      />
      <Card>
        <CardHeader><CardTitle>الرحلات</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد رحلات"
            emptyIcon={<MapPin className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={pageSize}
            total={total}
            page={page}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function MaintenanceTab() {
  const { data: maintResp, isLoading, isError, error, refetch } = useApiQuery<any>(["fleet-maintenance"], "/fleet/maintenance");
  const records = asList(maintResp);
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(records, filters, {
    searchFields: ["plateNumber", "description"],
    statusField: "",
    dateField: "",
  });

  const columns: DataTableColumn<any>[] = [
    { key: "plateNumber", header: "المركبة", sortable: true, render: (r) => r.plateNumber || "-" },
    { key: "type", header: "النوع", sortable: true, render: (r) => r.type || "-" },
    { key: "description", header: "الوصف", sortable: true, className: "max-w-[200px] truncate", render: (r) => r.description || "-" },
    { key: "cost", header: "التكلفة", sortable: true, render: (r) => formatCurrency(r.cost || 0) },
    { key: "serviceDate", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.serviceDate) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-4">
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمركبة أو الوصف...",
          statuses: [
            { value: "pending", label: "معلقة" },
            { value: "in_progress", label: "جارية" },
            { value: "completed", label: "مكتملة" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(filtered || [], [
          { key: "plateNumber", label: "المركبة" },
          { key: "type", label: "النوع" },
          { key: "description", label: "الوصف" },
          { key: "cost", label: "التكلفة" },
          { key: "serviceDate", label: "التاريخ" },
          { key: "status", label: "الحالة" },
        ], "الصيانة")}
        resultCount={filtered?.length}
      />
      <Card>
        <CardHeader><CardTitle>سجلات الصيانة</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد سجلات صيانة"
            emptyIcon={<Wrench className="h-6 w-6 text-slate-400" />}
            noToolbar
          />
        </CardContent>
      </Card>
    </div>
  );
}

function FuelTab() {
  const { data: fuelResp, isLoading, isError, error, refetch } = useApiQuery<any>(["fleet-fuel"], "/fleet/fuel-logs");
  const logs = asList(fuelResp);
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(logs, filters, {
    searchFields: ["plateNumber", "stationName"],
    dateField: "",
  });

  const columns: DataTableColumn<any>[] = [
    { key: "plateNumber", header: "المركبة", sortable: true, render: (l) => l.plateNumber || "-" },
    { key: "fuelDate", header: "التاريخ", sortable: true, render: (l) => formatDateAr(l.fuelDate) },
    { key: "liters", header: "اللترات", sortable: true, ltr: true, className: "text-right", render: (l) => l.liters },
    { key: "costPerLiter", header: "سعر اللتر", sortable: true, render: (l) => formatCurrency(l.costPerLiter) },
    { key: "totalCost", header: "الإجمالي", sortable: true, className: "font-bold", render: (l) => formatCurrency(l.totalCost || 0) },
    { key: "stationName", header: "المحطة", sortable: true, render: (l) => l.stationName || "-" },
  ];

  return (
    <div className="space-y-4">
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمركبة أو المحطة...",
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(filtered || [], [
          { key: "plateNumber", label: "المركبة" },
          { key: "fuelDate", label: "التاريخ" },
          { key: "liters", label: "اللترات" },
          { key: "costPerLiter", label: "سعر اللتر" },
          { key: "totalCost", label: "الإجمالي" },
          { key: "stationName", label: "المحطة" },
        ], "الوقود")}
        resultCount={filtered?.length}
      />
      <Card>
        <CardHeader><CardTitle>سجلات الوقود</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد سجلات وقود"
            emptyIcon={<Fuel className="h-6 w-6 text-slate-400" />}
            noToolbar
          />
        </CardContent>
      </Card>
    </div>
  );
}
