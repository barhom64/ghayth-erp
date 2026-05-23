import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, FileText, Clock, Shield, Car, Building2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { PageShell } from "@workspace/ui-core";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { DOCUMENT_TYPES, DOCUMENT_COLORS } from "@/lib/hr-type-maps";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const DOC_STATUS_OPTIONS = Object.entries(DOCUMENT_TYPES).map(([value, label]) => ({ value, label }));

function getSeverityBadge(daysLeft: number) {
  if (daysLeft <= 0) return { label: "منتهي", color: "bg-status-error-surface text-status-error-foreground border-status-error-surface" };
  if (daysLeft <= 14) return { label: `${daysLeft} يوم`, color: "bg-status-error-surface text-status-error-foreground border-status-error-surface" };
  if (daysLeft <= 30) return { label: `${daysLeft} يوم`, color: "bg-orange-100 text-orange-700 border-orange-300" };
  if (daysLeft <= 60) return { label: `${daysLeft} يوم`, color: "bg-status-warning-surface text-status-warning-foreground border-yellow-300" };
  return { label: `${daysLeft} يوم`, color: "bg-surface-subtle text-muted-foreground border-border" };
}

export default function ExpiringDocumentsPage() {
  const [, navigate] = useLocation();
  const [days, setDays] = useState("90");
  const [filters, setFilters] = useFilters();

  const { data, isLoading, isError } = useApiQuery<any>(
    ["expiring-documents", days],
    `/hr/expiring-documents?days=${days}`,
  );
  const allDocs = asList(data?.data || data);

  const filtered = applyFilters(allDocs, filters, {
    searchFields: ["employeeName", "entityName"],
    statusField: "docType",
    dateField: "expiryDate",
  });

  const criticalCount = allDocs.filter((d: any) => Number(d.daysLeft) <= 14).length;
  const expiredCount = allDocs.filter((d: any) => Number(d.daysLeft) <= 0).length;

  const kpis = [
    { label: "إجمالي الوثائق", value: allDocs.length, icon: FileText, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "منتهية", value: expiredCount, icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
    { label: "حرجة (≤14 يوم)", value: criticalCount, icon: Clock, color: "text-orange-600 bg-orange-50" },
    { label: "قريبة الانتهاء", value: allDocs.length - expiredCount - criticalCount, icon: Shield, color: "text-status-warning-foreground bg-status-warning-surface" },
  ];

  const ENTITY_ICONS: Record<string, { Icon: typeof User; color: string; label: string }> = {
    employee: { Icon: User, color: "text-status-info-foreground bg-status-info-surface", label: "موظف" },
    driver: { Icon: User, color: "text-cyan-600 bg-cyan-50", label: "سائق" },
    vehicle: { Icon: Car, color: "text-teal-600 bg-teal-50", label: "مركبة" },
    company: { Icon: Building2, color: "text-rose-600 bg-rose-50", label: "منشأة" },
  };

  const columns: DataTableColumn<any>[] = [
    {
      key: "entityName",
      header: "الجهة",
      sortable: true,
      render: (v) => {
        const name = v.entityName || v.employeeName || "-";
        const ent = ENTITY_ICONS[v.entityType || "employee"];
        return (
          <div className="flex items-center gap-2">
            <div className={cn("w-7 h-7 rounded-full flex items-center justify-center", ent?.color.split(" ")[1])}>
              {ent ? <ent.Icon className={cn("h-3.5 w-3.5", ent.color.split(" ")[0])} /> : <AvatarInitial name={name} color="blue" />}
            </div>
            <div>
              <span className="font-medium text-sm block">{name}</span>
              <span className="text-xs text-muted-foreground">{ent?.label}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: "docType",
      header: "نوع الوثيقة",
      sortable: true,
      render: (v) => (
        <Badge variant="outline" className={cn("text-xs", DOCUMENT_COLORS[v.docType] || "")}>
          {DOCUMENT_TYPES[v.docType] || v.docLabel || v.docType}
        </Badge>
      ),
    },
    {
      key: "expiryDate",
      header: "تاريخ الانتهاء",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-muted-foreground">
          {formatDateAr(v.expiryDate)}
        </span>
      ),
    },
    {
      key: "daysLeft",
      header: "المتبقي",
      sortable: true,
      render: (v) => {
        const daysLeft = Number(v.daysLeft);
        const severity = getSeverityBadge(daysLeft);
        return (
          <Badge variant="outline" className={cn("text-xs", severity.color)}>
            {severity.label}
          </Badge>
        );
      },
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="متابعة الوثائق المنتهية"
      subtitle="تتبع وثائق الموظفين والمركبات والمنشأة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      loading={isLoading}
      actions={
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="14">14 يوم</SelectItem>
            <SelectItem value="30">30 يوم</SelectItem>
            <SelectItem value="60">60 يوم</SelectItem>
            <SelectItem value="90">90 يوم</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      {/* KPI cards */}
      <KpiGrid items={kpis} />

      {/* Expired alert */}
      {expiredCount > 0 && (
        <div className="p-3 bg-status-error-surface border border-status-error-surface rounded-lg text-sm text-status-error-foreground flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          تحذير: {expiredCount} وثيقة منتهية الصلاحية — يجب التجديد فوراً
        </div>
      )}

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو المركبة...",
          statuses: DOC_STATUS_OPTIONS,
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد وثائق منتهية في هذه الفترة"
        pageSize={20}
        onRowClick={(row) => navigate(`/employees/${row.employeeId}`)}
      />
    </PageShell>
  );
}
