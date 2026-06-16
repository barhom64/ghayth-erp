import { Link, useLocation } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { PropertyTabsNav } from "@/components/shared/property-tabs-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { KpiGrid } from "@/components/shared/kpi-card";
import { ErrorState } from "@/components/shared/loading-error-states";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Building2, Home, Plus, Eye, Pencil, TrendingUp, CheckCircle } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatCurrency } from "@/lib/formatters";
import { useAppContext } from "@/contexts/app-context";
import { cn } from "@/lib/utils";

const TYPE_MAP: Record<string, string> = {
  residential: "سكني",
  commercial: "تجاري",
  mixed: "مختلط",
};

const TYPE_OPTIONS = [
  { value: "residential", label: "سكني" },
  { value: "commercial", label: "تجاري" },
  { value: "mixed", label: "مختلط" },
];

export default function PropertiesBuildings() {
  const [, navigate] = useLocation();
  const { scopeQueryString, permissions, roleLevel } = useAppContext();
  const canManage = permissions.canManageProperty || roleLevel >= 50;
  const [filters, setFilters] = useFilters();

  const { data: buildingsResp, isLoading, isError } = useApiQuery<any>(
    ["property-buildings", scopeQueryString],
    `/properties/buildings?${scopeQueryString || ""}`
  );
  const buildings = asList(buildingsResp);

  const filtered = applyFilters(buildings, filters, {
    searchFields: ["name", "address", "city"],
    statusField: "type",
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  if (isError) return <ErrorState />;

  const totalUnits = buildings.reduce((sum: number, b: any) => sum + (b.totalUnits || 0), 0);
  const totalRented = buildings.reduce((sum: number, b: any) => sum + (b.rentedUnits || 0), 0);
  const totalAvailable = buildings.reduce((sum: number, b: any) => sum + (b.availableUnits || 0), 0);
  const totalRevenue = buildings.reduce((sum: number, b: any) => sum + (Number(b.totalRevenue) || 0), 0);

  const kpis = [
    {
      label: "إجمالي المباني",
      value: buildings.length,
      icon: Building2,
      color: "text-status-info-foreground bg-status-info-surface",
    },
    {
      label: "إجمالي الوحدات",
      value: totalUnits,
      icon: Home,
      color: "text-purple-600 bg-purple-50",
    },
    {
      label: "الوحدات المؤجرة",
      value: totalRented,
      icon: CheckCircle,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "إجمالي الإيرادات",
      value: formatCurrency(totalRevenue),
      icon: TrendingUp,
      color: "text-status-success-foreground bg-status-success-surface",
    },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "اسم المبنى",
      sortable: true,
      render: (b) => (
        <div className="min-w-0">
          <span className="font-medium text-sm block truncate">{b.name}</span>
          {b.address && (
            <span className="text-xs text-muted-foreground truncate block">
              {b.address}{b.city ? ` — ${b.city}` : ""}
            </span>
          )}
          {b.deedNumber && (
            <span className="text-[10px] text-muted-foreground">صك: {b.deedNumber}</span>
          )}
        </div>
      ),
    },
    {
      key: "type",
      header: "النوع",
      sortable: true,
      render: (b) => (
        <Badge variant="outline" className="text-xs">
          {TYPE_MAP[b.type] || b.type}
        </Badge>
      ),
    },
    {
      key: "totalUnits",
      header: "إجمالي الوحدات",
      sortable: true,
      align: "center",
      render: (b) => (
        <span className="text-sm font-semibold">{b.totalUnits || 0}</span>
      ),
    },
    {
      key: "rentedUnits",
      header: "مؤجرة",
      sortable: true,
      align: "center",
      render: (b) => (
        <span className="text-sm font-semibold text-status-info-foreground">{b.rentedUnits || 0}</span>
      ),
    },
    {
      key: "availableUnits",
      header: "شاغرة",
      sortable: true,
      align: "center",
      render: (b) => (
        <span className="text-sm font-semibold text-emerald-600">{b.availableUnits || 0}</span>
      ),
    },
    {
      key: "occupancy",
      header: "نسبة الإشغال",
      sortable: true,
      render: (b) => {
        const occupancy = b.totalUnits > 0 ? Math.round((b.rentedUnits / b.totalUnits) * 100) : 0;
        return (
          <div className="min-w-[80px]">
            <span className={cn(
              "text-sm font-bold",
              occupancy >= 80 ? "text-emerald-600" : occupancy >= 50 ? "text-status-warning-foreground" : "text-status-error"
            )}>
              {occupancy}%
            </span>
            <div className="h-1.5 bg-surface-subtle rounded-full overflow-hidden mt-1">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  occupancy >= 80 ? "bg-emerald-500" : occupancy >= 50 ? "bg-status-warning-surface0" : "bg-red-400"
                )}
                style={{ width: `${occupancy}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: "totalRevenue",
      header: "الإيرادات",
      sortable: true,
      render: (b) => (
        <span className={cn("text-sm font-semibold", b.totalRevenue > 0 ? "text-emerald-600" : "text-muted-foreground")}>
          {b.totalRevenue > 0 ? formatCurrency(b.totalRevenue) : "-"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (b) => (
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs"><Link href={`/properties/buildings/${b.id}`}>
              <Eye className="h-3 w-3" /> عرض
            </Link></Button>
          {canManage && (
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" title="تعديل"><Link href={`/properties/buildings/${b.id}`}>
                <Pencil className="h-3 w-3" />
              </Link></Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="المباني والمجمعات"
      subtitle={`${buildings.length} مبنى مسجل`}
      breadcrumbs={[{ href: "/properties", label: "إدارة الأملاك" }]}
      loading={isLoading}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_properties_buildings"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "قائمة المباني", total: printRows.length },
              items: printRows.map((b: any) => ({
                "الاسم": b.name || "—",
                "النوع": b.type || "—",
                "المدينة": b.city || "—",
                "العنوان": b.address || "—",
                "عدد الوحدات": b.unitsCount ?? b.totalUnits ?? "—",
              })),
            })}
          />
          {canManage ? (
            <Link href="/properties/buildings/create">
              <GuardedButton perm="property:create" size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> إضافة مبنى
              </GuardedButton>
            </Link>
          ) : null}
        </div>
      }
    >
      <PropertyTabsNav />
      <KpiGrid items={kpis} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو العنوان أو المدينة...",
          statuses: TYPE_OPTIONS,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "name", label: "اسم المبنى" },
              { key: "type", label: "النوع" },
              { key: "address", label: "العنوان" },
              { key: "city", label: "المدينة" },
              { key: "ownerName", label: "المالك" },
              { key: "totalUnits", label: "إجمالي الوحدات" },
              { key: "occupiedUnits", label: "المؤجرة" },
              { key: "availableUnits", label: "المتاحة" },
              { key: "monthlyRevenue", label: "الإيراد الشهري" },
            ],
            "قائمة-المباني",
          )
        }
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد مباني مسجلة"
        pageSize={20}
        onRowClick={(item) => navigate(`/properties/buildings/${item.id}`)}
      />
    </PageShell>
  );
}
