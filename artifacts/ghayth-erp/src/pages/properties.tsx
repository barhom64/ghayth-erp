import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
// P4.5 — Property sweep: shared header + status chips, via @workspace/ui-core.
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  PageStatusBadge,
  AdvancedFilters,
  useFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PropertyTabsNav } from "@/components/shared/property-tabs-nav";
import { Building, Building2, Plus, Eye, Home, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { KpiGrid } from "@/components/shared/kpi-card";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useAppContext } from "@/contexts/app-context";
import { PageStateWrapper } from "@/components/shared/page-state";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

export default function Properties() {
  const [, navigate] = useLocation();
  const { roleLevel, permissions, scopeQueryString } = useAppContext();
  const canManage = permissions.canManageProperty || roleLevel >= 50;
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
  const { data: stats } = useApiQuery<any>(["properties-stats", scopeQueryString], `/properties/stats?${scopeQueryString}`);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [filters, setFilters] = useFilters();
  useEffect(() => { setPage(1); }, [filters.search, filters.status]);
  const filterParams = `&search=${encodeURIComponent(filters.search || "")}&status=${encodeURIComponent(filters.status || "")}`;
  // #2713 (تعميم) — سلة المحذوفات للوحدات.
  const [showDeleted, setShowDeleted] = useState(false);
  const { toast } = useToast();
  const { data: unitsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["property-units", String(page), filters.search, filters.status, scopeQueryString, showDeleted ? "deleted" : "active"], `/properties/units?page=${page}&limit=${pageSize}${scopeSuffix}${filterParams}${showDeleted ? "&deleted=true" : ""}`
  );
  const units = asList(unitsResp);
  const total = unitsResp?.total || units.length;
  const filtered = units;
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const typeLabel = (t: string) => t === 'apartment' ? 'شقة' : t === 'villa' ? 'فيلا' : t === 'office' ? 'مكتب' : t === 'shop' ? 'محل' : t === 'warehouse' ? 'مستودع' : t === 'land' ? 'أرض' : t;

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/properties/units",
    queryKeys: [["property-units", String(page)], ["properties-stats"]],
    onSuccess: () => refetch(),
  });

  async function handleRestoreUnit(id: number) {
    try {
      await apiFetch(`/properties/units/${id}/restore`, { method: "POST" });
      toast({ title: "تم استرجاع الوحدة" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e?.message || "تعذّر الاسترجاع" });
    }
  }

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
    { key: "status", header: "الحالة", sortable: true, render: (u) => <PageStatusBadge status={u.status} /> },
    {
      key: "actions",
      header: "الإجراءات",
      render: (u) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {showDeleted ? (
            canManage && <Button variant="outline" size="sm" onClick={() => handleRestoreUnit(u.id)}>استرجاع</Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" title="عرض"><Link href={`/properties/${u.id}`}><Eye className="h-4 w-4" /></Link></Button>
              {canManage && (
                <RowActions
                  canEdit={canManage}
                  onEdit={() => startEdit(u.id, { unitNumber: u.unitNumber || "", buildingName: u.buildingName || "", type: u.type || "apartment", area: u.area || 0, monthlyRent: u.monthlyRent || 0, status: u.status || "available" })}
                  onDelete={() => startDelete(u.id)}
                  deletePerm="properties:delete"
                />
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  if (isError) return (
    <PageStateWrapper isLoading={false} error={error} onRetry={() => refetch()}>
      <div />
    </PageStateWrapper>
  );

  return (
    <PageShell
      title="الوحدات العقارية"
      subtitle="إدارة وتتبع الوحدات العقارية"
      breadcrumbs={[{ label: "العقارات" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_property_units"
            entityId="list"
            size="icon"
            label="طباعة قائمة الوحدات العقارية"
            payload={() => ({
              entity: {
                title: "قائمة الوحدات العقارية",
                total: printRows.length,
                totalUnits: stats?.totalUnits ?? 0,
                rented: stats?.rented ?? 0,
                available: stats?.available ?? 0,
              },
              items: printRows.map((u: any) => ({
                "رقم الوحدة": u.unitNumber || "—",
                "المبنى": u.buildingName || "—",
                "النوع": typeLabel(u.type),
                "المساحة": u.area ? `${u.area} م²` : "—",
                "الإيجار": Number(u.monthlyRent || 0),
                "الحالة": u.status || "—",
              })),
            })}
          />
          {canManage ? (
            <Link href="/properties/create">
              <GuardedButton perm="properties:create" className="gap-2"><Plus className="h-4 w-4" /> إضافة وحدة</GuardedButton>
            </Link>
          ) : null}
        </div>
      }
    >
      <PropertyTabsNav />
      <KpiGrid items={[
        { label: "إجمالي العقارات", value: stats?.totalUnits || 0, icon: Building2, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "وحدات شاغرة", value: stats?.available || 0, icon: Home, color: "text-emerald-600 bg-emerald-50" },
        { label: "وحدات مؤجرة", value: stats?.rented || 0, icon: Building, color: "text-indigo-600 bg-indigo-50" },
        { label: "نسبة الإشغال", value: stats?.totalUnits ? `${Math.round(((stats?.rented || 0) / stats.totalUnits) * 100)}%` : "0%", icon: DollarSign, color: "text-purple-600 bg-purple-50" },
      ]} />

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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Building className="h-5 w-5 text-status-info" /> {showDeleted ? "الوحدات المحذوفة" : "الوحدات العقارية"}</CardTitle>
          <Button variant={showDeleted ? "default" : "outline"} size="sm" onClick={() => { setShowDeleted((v) => !v); setPage(1); }}>
            {showDeleted ? "الوحدات النشطة" : "سلة المحذوفات"}
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            onSortedDataChange={setPrintRows}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            onRowClick={(u) => navigate(`/properties/${u.id}`)}
            emptyMessage="لا توجد وحدات"
            emptyIcon={<Building className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={pageSize}
            total={total}
            page={page}
            onPageChange={setPage}
            renderRowExtras={(u) => {
              if (editingId === u.id) {
                return <InlineEditForm fields={editFields} initialValues={editForm} onSave={(values) => handleSave(u.id, values)} onCancel={cancelEdit} isPending={isPending} />;
              }
              if (deletingId === u.id) {
                return <InlineDeleteConfirm onConfirm={() => handleDelete(u.id)} onCancel={cancelDelete} isPending={isPending} itemName={u.unitNumber} entityType="property-unit" entityId={u.id} />;
              }
              return null;
            }}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
