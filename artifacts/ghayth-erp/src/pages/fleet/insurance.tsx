import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useApiQuery, asList } from "@/lib/api";
import { Shield, Plus, FileText, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { KpiGrid } from "@/components/shared/kpi-card";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";

export default function InsurancePage() {
  const { data: insuranceResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["fleet-insurance"], "/fleet/insurance"
  );
  const items = asList(insuranceResp);
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(items, filters, { searchFields: ["plateNumber", "provider", "policyNumber"] });

  const columns: DataTableColumn<any>[] = [
    { key: "vehiclePlate", header: "المركبة", sortable: true, className: "font-mono", render: (i) => i.plateNumber || "-" },
    { key: "type", header: "النوع", sortable: true, render: (i) => i.type === 'comprehensive' ? 'شامل' : i.type === 'third_party' ? 'طرف ثالث' : i.type || "-" },
    { key: "provider", header: "شركة التأمين", sortable: true, className: "font-medium", render: (i) => i.provider || "-" },
    { key: "policyNumber", header: "رقم الوثيقة", sortable: true, className: "text-muted-foreground", render: (i) => i.policyNumber || "-" },
    { key: "startDate", header: "من", sortable: true, render: (i) => formatDateAr(i.startDate) },
    { key: "endDate", header: "إلى", sortable: true, render: (i) => formatDateAr(i.endDate) },
    { key: "premium", header: "القسط", sortable: true, className: "font-bold", render: (i) => formatCurrency(i.premium || 0) },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="التأمين"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "التأمين" }]}
      loading={isLoading}
      actions={
        <Link href="/fleet/insurance/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> إضافة تأمين</Button>
        </Link>
      }
    >
      <FleetTabsNav />
      <KpiGrid items={(() => {
        const now = new Date();
        const soon = new Date();
        soon.setDate(soon.getDate() + 30);
        const active = items.filter((i: any) => i.endDate && new Date(i.endDate) >= now).length;
        const expired = items.filter((i: any) => i.endDate && new Date(i.endDate) < now).length;
        const expiringSoon = items.filter((i: any) => { const end = i.endDate ? new Date(i.endDate) : null; return end && end >= now && end <= soon; }).length;
        return [
          { label: "إجمالي الوثائق", value: items.length, icon: FileText, color: "text-blue-600 bg-blue-50" },
          { label: "سارية", value: active, icon: CheckCircle, color: "text-green-600 bg-green-50" },
          { label: "منتهية", value: expired, icon: XCircle, color: "text-red-600 bg-red-50" },
          { label: "تنتهي قريباً", value: expiringSoon, icon: AlertTriangle, color: "text-amber-600 bg-amber-50" },
        ];
      })()} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمركبة أو شركة التأمين أو رقم الوثيقة...",
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد وثائق تأمين"
        emptyIcon={<Shield className="h-6 w-6 text-slate-400" />}
        emptyAction={{ label: "إضافة تأمين", onClick: () => { window.location.href = "/fleet/insurance/create"; } }}
        noToolbar
      />
    </PageShell>
  );
}
