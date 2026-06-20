import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { Plus, Package, Truck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { KpiGrid } from "@/components/shared/kpi-card";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { formatCurrency, formatNumber } from "@/lib/formatters";

interface ManifestRow {
  id: number;
  manifestNumber: string;
  status: string;
  customerName: string | null;
  linkedCustomerName: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  vehiclePlate: string | null;
  driverName: string | null;
  totalWeight: number;
  totalDeclaredValue: number;
  freightRevenue: number;
  freightCost: number;
  linkedTripId: number | null;
  createdAt: string;
}

export default function FleetCargoPage() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
  const { data, isLoading, isError, refetch } = useApiQuery<{ data: ManifestRow[] }>(
    ["cargo-manifests", statusFilter],
    `/cargo/manifests${qs}`,
  );
  const rows = (data?.data || []) as ManifestRow[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  const kpi = {
    total: printRows.length,
    inTransit: rows.filter((r) => r.status === "in_transit").length,
    delivered: rows.filter((r) => r.status === "delivered" || r.status === "closed").length,
    revenue: rows.reduce((s, r) => s + (Number(r.freightRevenue) || 0), 0),
  };

  const columns: DataTableColumn<ManifestRow>[] = [
    {
      key: "manifestNumber",
      header: "رقم البوليصة",
      sortable: true,
      searchable: true,
      render: (m) => <span className="font-mono text-sm">{m.manifestNumber}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (m) => <PageStatusBadge status={m.status} />,
    },
    {
      key: "customer",
      header: "العميل",
      searchable: true,
      sortKey: "customerName",
      render: (m) => m.linkedCustomerName || m.customerName || "—",
    },
    {
      key: "route",
      header: "المسار",
      render: (m) => (
        <span className="text-xs">
          {m.fromLocation || "—"} <span className="text-muted-foreground">→</span> {m.toLocation || "—"}
        </span>
      ),
    },
    {
      key: "vehiclePlate",
      header: "المركبة / السائق",
      render: (m) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs">{m.vehiclePlate || "—"}</span>
          {m.driverName && (
            <span className="text-xs text-muted-foreground">{m.driverName}</span>
          )}
        </div>
      ),
    },
    {
      key: "totalWeight",
      header: "الوزن",
      sortable: true,
      render: (m) => m.totalWeight ? `${formatNumber(Number(m.totalWeight))} كغ` : "—",
    },
    {
      key: "freightRevenue",
      header: "الإيراد",
      sortable: true,
      render: (m) => m.freightRevenue ? formatCurrency(Number(m.freightRevenue)) : "—",
    },
    {
      key: "trip",
      header: "الرحلة",
      render: (m) => m.linkedTripId
        ? <Link href={`/fleet/trips/${m.linkedTripId}`} asChild><a className="text-status-info-foreground underline text-xs" onClick={(e) => e.stopPropagation()}>#{m.linkedTripId}</a></Link>
        : <span className="text-xs text-muted-foreground">غير مربوطة</span>,
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="الشحن والبضائع"
      subtitle="بوالص الشحن البري وإدارة الأصناف"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "نقل البضائع" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_fleet_cargo"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "بوالص نقل البضائع", total: printRows.length },
              items: printRows.map((r: any) => ({
                "رقم البوليصة": r.manifestNumber || r.id,
                "العميل": r.customerName || r.linkedCustomerName || "—",
                "المركبة": r.vehiclePlate || "—",
                "السائق": r.driverName || "—",
                "من": r.fromLocation || "—",
                "إلى": r.toLocation || "—",
                "تاريخ التحميل": r.pickupDate || "—",
                "الوزن (كغم)": r.totalWeight ?? 0,
                "الإيراد": r.freightRevenue ?? 0,
                "الحالة": r.status || "—",
              })),
            })}
          />
          <Link href="/fleet/cargo/create">
            <GuardedButton perm="fleet.cargo:create" size="sm">
              <Plus className="h-4 w-4 me-1" />بوليصة جديدة
            </GuardedButton>
          </Link>
        </div>
      }
    >
      <FleetTabsNav />

      <KpiGrid items={[
        { label: "إجمالي البوالص", value: kpi.total, icon: Package, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "في الطريق", value: kpi.inTransit, icon: Truck, color: "text-status-warning-foreground bg-status-warning-surface" },
        { label: "مسلّمة / مغلقة", value: kpi.delivered, icon: CheckCircle2, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "إجمالي الإيراد", value: formatCurrency(kpi.revenue), icon: AlertTriangle, color: "text-purple-600 bg-purple-50" },
      ]} />

      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="confirmed">مؤكدة</SelectItem>
                <SelectItem value="loading">تحميل</SelectItem>
                <SelectItem value="in_transit">في الطريق</SelectItem>
                <SelectItem value="delivered">مسلّمة</SelectItem>
                <SelectItem value="closed">مغلقة</SelectItem>
                <SelectItem value="cancelled">ملغاة</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
          </div>
          <DataTable
            columns={columns}
            onSortedDataChange={setPrintRows}
            data={rows}
            onRowClick={(m) => navigate(`/fleet/cargo/${m.id}`)}
            searchPlaceholder="ابحث برقم البوليصة، اسم العميل…"
            emptyMessage="لا توجد بوالص شحن في هذه الفئة"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
