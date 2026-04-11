import { useState, Fragment } from "react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useSortedData } from "@/hooks/use-sorted-data";
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

const VEHICLE_STATUS_OPTIONS = [
  { value: "available", label: "متاحة" },
  { value: "in_use", label: "قيد الاستخدام" },
  { value: "maintenance", label: "في الصيانة" },
];

function VehiclesTab() {
  const { permissions, scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
  const { data: stats } = useApiQuery(["fleet-stats", scopeQueryString], `/fleet/stats${scopeQueryString ? `?${scopeQueryString}` : ""}`);
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
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

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
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "plateNumber", label: "اللوحة" },
              { key: "make", label: "الشركة المصنعة" },
              { key: "model", label: "الموديل" },
              { key: "color", label: "اللون" },
              { key: "currentMileage", label: "المسافة" },
              { key: "driverName", label: "السائق" },
              { key: "status", label: "الحالة" },
            ], "المركبات")}
            resultCount={sortedData?.length}
          />
        </div>
        {canManage && <Link href="/fleet/vehicles/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة مركبة</Button></Link>}
      </div>

      <Card>
        <CardHeader><CardTitle>المركبات</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="plateNumber" label="اللوحة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="make" label="المركبة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="color" label="اللون" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="currentMileage" label="المسافة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="driverName" label="السائق" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
            <TableHead>الاستمارة</TableHead>
            <TableHead className="text-start">الإجراءات</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={8} emptyMessage="لا توجد مركبات" emptyIcon={<Car className="h-6 w-6 text-slate-400" />}>
            {sortedData?.map(v => (
              <Fragment key={v.id}>
                <TableRow>
                  <TableCell className="font-mono">
                    <Link href={`/fleet/${v.id}`} className="hover:underline text-primary font-medium">{v.plateNumber}</Link>
                  </TableCell>
                  <TableCell>{v.make} {v.model} {v.year}</TableCell>
                  <TableCell>{v.color || "-"}</TableCell>
                  <TableCell dir="ltr" className="text-right">{formatNumber(v.currentMileage || 0)} كم</TableCell>
                  <TableCell>{v.driverName || "-"}</TableCell>
                  <TableCell><StatusBadge status={v.status} /></TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell className="text-start">
                    <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewItem(v)}><Eye className="h-4 w-4" /></Button>
                    <RowActions
                      canEdit={canManage}
                      onEdit={() => startEdit(v.id, { plateNumber: v.plateNumber, make: v.make || "", model: v.model || "", color: v.color || "", status: v.status || "available" })}
                      onDelete={() => startDelete(v.id)}
                    />
                    </div>
                  </TableCell>
                </TableRow>
                {editingId === v.id && (
                  <TableRow><TableCell colSpan={7}>
                    <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(v.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                  </TableCell></TableRow>
                )}
                {deletingId === v.id && (
                  <TableRow><TableCell colSpan={7}>
                    <InlineDeleteConfirm onConfirm={() => handleDelete(v.id)} onCancel={cancelDelete} isPending={isPending} itemName={v.plateNumber} entityType="vehicle" entityId={v.id} />
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper></Table>
          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
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
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

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
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "name", label: "الاسم" },
              { key: "phone", label: "الهاتف" },
              { key: "licenseNumber", label: "رقم الرخصة" },
              { key: "rating", label: "التقييم" },
              { key: "totalTrips", label: "الرحلات" },
              { key: "status", label: "الحالة" },
            ], "السائقون")}
            resultCount={sortedData?.length}
          />
        </div>
        <Link href="/fleet/drivers/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة سائق</Button></Link>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table><TableHeader><TableRow>
            <SortableTableHead column="name" label="الاسم" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="phone" label="الهاتف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="licenseNumber" label="رقم الرخصة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="rating" label="التقييم" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="totalTrips" label="الرحلات" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
            <TableHead className="text-start">الإجراءات</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={7} emptyMessage="لا يوجد سائقون" emptyIcon={<Users className="h-6 w-6 text-slate-400" />}>
            {sortedData?.map(d => (
              <Fragment key={d.id}>
                <TableRow>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell dir="ltr" className="text-right">{d.phone || "-"}</TableCell>
                  <TableCell>{d.licenseNumber || "-"}</TableCell>
                  <TableCell>⭐ {d.rating}</TableCell>
                  <TableCell>{d.totalTrips}</TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="text-start">
                    <RowActions
                      canEdit={canManage}
                      onEdit={() => startEdit(d.id, { name: d.name, phone: d.phone || "", licenseNumber: d.licenseNumber || "", status: d.status || "active" })}
                      onDelete={() => startDelete(d.id)}
                    />
                  </TableCell>
                </TableRow>
                {editingId === d.id && (
                  <TableRow><TableCell colSpan={7}>
                    <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(d.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                  </TableCell></TableRow>
                )}
                {deletingId === d.id && (
                  <TableRow><TableCell colSpan={7}>
                    <InlineDeleteConfirm onConfirm={() => handleDelete(d.id)} onCancel={cancelDelete} isPending={isPending} itemName={d.name} entityType="driver" entityId={d.id} />
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper></Table>
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
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

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
        onExportCSV={() => exportToCSV(sortedData || [], [
          { key: "plateNumber", label: "المركبة" },
          { key: "driverName", label: "السائق" },
          { key: "fromLocation", label: "من" },
          { key: "toLocation", label: "إلى" },
          { key: "distance", label: "المسافة" },
          { key: "status", label: "الحالة" },
        ], "الرحلات")}
        resultCount={sortedData?.length}
      />
      <Card>
        <CardHeader><CardTitle>الرحلات</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="plateNumber" label="المركبة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="driverName" label="السائق" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="fromLocation" label="من" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="toLocation" label="إلى" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="distance" label="المسافة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={6} emptyMessage="لا توجد رحلات" emptyIcon={<MapPin className="h-6 w-6 text-slate-400" />}>
            {sortedData?.map(t => (
              <TableRow key={t.id}>
                <TableCell>{t.plateNumber || "-"}</TableCell>
                <TableCell>{t.driverName || "-"}</TableCell>
                <TableCell className="max-w-[150px] truncate">{t.fromLocation || "-"}</TableCell>
                <TableCell className="max-w-[150px] truncate">{t.toLocation || "-"}</TableCell>
                <TableCell dir="ltr" className="text-right">{t.distance ? `${t.distance} كم` : "-"}</TableCell>
                <TableCell><StatusBadge status={t.status} /></TableCell>
              </TableRow>
            ))}
          </DataTableWrapper></Table>
          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
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
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

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
        onExportCSV={() => exportToCSV(sortedData || [], [
          { key: "plateNumber", label: "المركبة" },
          { key: "type", label: "النوع" },
          { key: "description", label: "الوصف" },
          { key: "cost", label: "التكلفة" },
          { key: "serviceDate", label: "التاريخ" },
          { key: "status", label: "الحالة" },
        ], "الصيانة")}
        resultCount={sortedData?.length}
      />
      <Card>
        <CardHeader><CardTitle>سجلات الصيانة</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="plateNumber" label="المركبة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="type" label="النوع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="description" label="الوصف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="cost" label="التكلفة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="serviceDate" label="التاريخ" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={6} emptyMessage="لا توجد سجلات صيانة" emptyIcon={<Wrench className="h-6 w-6 text-slate-400" />}>
            {sortedData?.map(r => (
              <TableRow key={r.id}>
                <TableCell>{r.plateNumber || "-"}</TableCell>
                <TableCell>{r.type || "-"}</TableCell>
                <TableCell className="max-w-[200px] truncate">{r.description || "-"}</TableCell>
                <TableCell>{formatCurrency(r.cost || 0)}</TableCell>
                <TableCell>{formatDateAr(r.serviceDate)}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </DataTableWrapper></Table>
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
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  return (
    <div className="space-y-4">
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمركبة أو المحطة...",
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV(sortedData || [], [
          { key: "plateNumber", label: "المركبة" },
          { key: "fuelDate", label: "التاريخ" },
          { key: "liters", label: "اللترات" },
          { key: "costPerLiter", label: "سعر اللتر" },
          { key: "totalCost", label: "الإجمالي" },
          { key: "stationName", label: "المحطة" },
        ], "الوقود")}
        resultCount={sortedData?.length}
      />
      <Card>
        <CardHeader><CardTitle>سجلات الوقود</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="plateNumber" label="المركبة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="fuelDate" label="التاريخ" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="liters" label="اللترات" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="costPerLiter" label="سعر اللتر" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="totalCost" label="الإجمالي" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="stationName" label="المحطة" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={6} emptyMessage="لا توجد سجلات وقود" emptyIcon={<Fuel className="h-6 w-6 text-slate-400" />}>
            {sortedData?.map(l => (
              <TableRow key={l.id}>
                <TableCell>{l.plateNumber || "-"}</TableCell>
                <TableCell>{formatDateAr(l.fuelDate)}</TableCell>
                <TableCell dir="ltr" className="text-right">{l.liters}</TableCell>
                <TableCell>{formatCurrency(l.costPerLiter)}</TableCell>
                <TableCell className="font-bold">{formatCurrency(l.totalCost || 0)}</TableCell>
                <TableCell>{l.stationName || "-"}</TableCell>
              </TableRow>
            ))}
          </DataTableWrapper></Table>
        </CardContent>
      </Card>
    </div>
  );
}
