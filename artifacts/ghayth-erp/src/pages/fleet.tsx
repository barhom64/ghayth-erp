import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
// P4.4 — Fleet sweep: shared header + status chips.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { useApiQuery, asList } from "@/lib/api";
import { Car, Users, MapPin, Wrench, Fuel, Plus, Eye, FileCheck, Link2, ShieldAlert } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { AdvancedFilters, useFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { useAppContext } from "@/contexts/app-context";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";

// Compose a list-endpoint URL out of the AdvancedFilters state. Scope
// (companyIds/branchIds) is auto-injected by useApiQuery → injectScope,
// so we don't splice it here. Mirrors the warehouse.tsx helper introduced
// alongside the same fix; tracked for extraction in issue #652.
function withListFilters(
  base: string,
  f: { search?: string; status?: string; dateFrom?: string; dateTo?: string },
): string {
  const parts: string[] = [];
  if (f.search) parts.push(`search=${encodeURIComponent(f.search)}`);
  if (f.status) parts.push(`status=${encodeURIComponent(f.status)}`);
  if (f.dateFrom) parts.push(`dateFrom=${encodeURIComponent(f.dateFrom)}`);
  if (f.dateTo) parts.push(`dateTo=${encodeURIComponent(f.dateTo)}`);
  if (parts.length === 0) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${parts.join("&")}`;
}

export default function Fleet() {
  const [tab, setTab] = useState("vehicles");
  return (
    <PageShell
      title="إدارة الأسطول"
      subtitle="المركبات والسائقون والرحلات والصيانة والوقود"
      breadcrumbs={[{ label: "الأسطول" }]}
    >
      <FleetTabsNav />
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
    </PageShell>
  );
}

function VehiclesTab() {
  const [, navigate] = useLocation();
  const { permissions } = useAppContext();
  // Scope (companyIds/branchIds) + scope-aware queryKey are injected
  // automatically by useApiQuery → injectScope.
  const { data: stats } = useApiQuery<any>(["fleet-stats"], `/fleet/stats`);
  const [page, setPage] = useState(1);
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [filters, setFilters] = useFilters();
  useEffect(() => { setPage(1); }, [filters.search, filters.status, filters.dateFrom, filters.dateTo]);
  const pageSize = 20;
  const canManage = permissions.canManageFleet;
  const { data: vehiclesResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["fleet-vehicles", String(page), filters.search, filters.status, filters.dateFrom, filters.dateTo],
    withListFilters(`/fleet/vehicles?page=${page}&limit=${pageSize}`, filters),
  );
  const vehicles = asList(vehiclesResp);
  const total = vehiclesResp?.total || vehicles.length;

  const filtered = vehicles;

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
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "available", label: "متاحة" }, { value: "in_use", label: "قيد الاستخدام" }, { value: "maintenance", label: "في الصيانة" }, { value: "out_of_service", label: "خارج الخدمة" }] },
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
    { key: "status", header: "الحالة", sortable: true, render: (v) => <PageStatusBadge status={v.status} domain="vehicle" /> },
    {
      key: "registration",
      header: "الاستمارة",
      render: (v) => (
        <div className="flex flex-col gap-1">
          {v.registrationExpiry ? (() => {
            const daysLeft = Math.ceil((new Date(v.registrationExpiry).getTime() - Date.now()) / 86400000);
            return daysLeft <= 0 ? <Badge variant="destructive" className="text-xs gap-1"><FileCheck className="h-3 w-3" />استمارة منتهية</Badge>
              : daysLeft <= 30 ? <Badge className="text-xs gap-1 bg-status-warning-surface text-status-warning-foreground hover:bg-status-warning-surface"><FileCheck className="h-3 w-3" />استمارة: {daysLeft} يوم</Badge>
              : <Badge variant="outline" className="text-xs gap-1 text-status-success-foreground"><FileCheck className="h-3 w-3" />استمارة سارية</Badge>;
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
            deletePerm="fleet:delete"
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
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-status-warning-foreground">في الصيانة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-status-warning-foreground">{stats?.vehicles?.inMaintenance || 0}</div></CardContent></Card>
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
                { value: "out_of_service", label: "خارج الخدمة" },
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
        {canManage && <Link href="/fleet/vehicles/create"><GuardedButton perm="fleet:create" className="gap-2"><Plus className="h-4 w-4" /> إضافة مركبة</GuardedButton></Link>}
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
            onRowClick={(v) => navigate(`/fleet/${v.id}`)}
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
  const [filters, setFilters] = useFilters();
  const scopePrefix = scopeQueryString ? `${scopeQueryString}&` : "";
  const filterParams = `?${scopePrefix}search=${encodeURIComponent(filters.search || "")}&status=${encodeURIComponent(filters.status || "")}`;
  const { data: driversResp, isLoading, isError, error, refetch } = useApiQuery<any>(["fleet-drivers", filters.search, filters.status, scopeQueryString], `/fleet/drivers${filterParams}`);
  const drivers = asList(driversResp);

  const filtered = drivers;

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/fleet/drivers",
    queryKeys: [["fleet-drivers"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "name", label: "الاسم" },
    { key: "phone", label: "الهاتف" },
    { key: "licenseNumber", label: "رقم الرخصة" },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "available", label: "متاح" }, { value: "on_trip", label: "في رحلة" }, { value: "off_duty", label: "خارج الخدمة" }, { value: "suspended", label: "موقف" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "الاسم", sortable: true, className: "font-medium" },
    { key: "phone", header: "الهاتف", sortable: true, ltr: true, className: "text-right", render: (d) => d.phone || "-" },
    { key: "licenseNumber", header: "رقم الرخصة", sortable: true, render: (d) => d.licenseNumber || "-" },
    { key: "rating", header: "التقييم", sortable: true, render: (d) => <>⭐ {d.rating}</> },
    { key: "totalTrips", header: "الرحلات", sortable: true },
    { key: "status", header: "الحالة", sortable: true, render: (d) => <PageStatusBadge status={d.status} /> },
    {
      key: "actions",
      header: "الإجراءات",
      render: (d) => (
        <div onClick={(e) => e.stopPropagation()}>
          <RowActions
            canEdit={canManage}
            onEdit={() => startEdit(d.id, { name: d.name, phone: d.phone || "", licenseNumber: d.licenseNumber || "", status: d.status || "available" })}
            onDelete={() => startDelete(d.id)}
            deletePerm="fleet:delete"
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
                { value: "available", label: "متاح" },
                { value: "on_trip", label: "في رحلة" },
                { value: "off_duty", label: "خارج الخدمة" },
                { value: "suspended", label: "موقف" },
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
        <Link href="/fleet/drivers/create"><GuardedButton perm="fleet:create" className="gap-2"><Plus className="h-4 w-4" /> إضافة سائق</GuardedButton></Link>
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
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useFilters();
  useEffect(() => { setPage(1); }, [filters.search, filters.status, filters.dateFrom, filters.dateTo]);
  const pageSize = 20;
  const { data: tripsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["fleet-trips", String(page), filters.search, filters.status, filters.dateFrom, filters.dateTo],
    withListFilters(`/fleet/trips?page=${page}&limit=${pageSize}`, filters),
  );
  const trips = asList(tripsResp);
  const total = tripsResp?.total || trips.length;

  const filtered = trips;

  const columns: DataTableColumn<any>[] = [
    { key: "plateNumber", header: "المركبة", sortable: true, render: (t) => t.plateNumber || "-" },
    { key: "driverName", header: "السائق", sortable: true, render: (t) => t.driverName || "-" },
    { key: "fromLocation", header: "من", sortable: true, className: "max-w-[150px] truncate", render: (t) => t.fromLocation || "-" },
    { key: "toLocation", header: "إلى", sortable: true, className: "max-w-[150px] truncate", render: (t) => t.toLocation || "-" },
    { key: "distance", header: "المسافة", sortable: true, ltr: true, className: "text-right", render: (t) => t.distance ? `${t.distance} كم` : "-" },
    { key: "status", header: "الحالة", sortable: true, render: (t) => <PageStatusBadge status={t.status} domain="trip" /> },
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
            onRowClick={(t) => navigate(`/fleet/trips/${t.id}`)}
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
  const [filters, setFilters] = useFilters();
  const { data: maintResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["fleet-maintenance", filters.search, filters.status, filters.dateFrom, filters.dateTo],
    withListFilters(`/fleet/maintenance`, filters),
  );
  const records = asList(maintResp);

  const filtered = records;

  const columns: DataTableColumn<any>[] = [
    { key: "plateNumber", header: "المركبة", sortable: true, render: (r) => r.plateNumber || "-" },
    { key: "type", header: "النوع", sortable: true, render: (r) => r.type || "-" },
    { key: "description", header: "الوصف", sortable: true, className: "max-w-[200px] truncate", render: (r) => r.description || "-" },
    { key: "cost", header: "التكلفة", sortable: true, render: (r) => formatCurrency(r.cost || 0) },
    { key: "serviceDate", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.serviceDate) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <PageStatusBadge status={r.status} /> },
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
  const [filters, setFilters] = useFilters();
  const { data: fuelResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["fleet-fuel", filters.search, filters.status, filters.dateFrom, filters.dateTo],
    withListFilters(`/fleet/fuel-logs`, filters),
  );
  const logs = asList(fuelResp);

  const filtered = logs;

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
