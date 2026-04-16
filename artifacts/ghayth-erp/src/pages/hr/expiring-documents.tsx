import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, FileText, Clock, Shield } from "lucide-react";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { DOCUMENT_TYPES, DOCUMENT_COLORS } from "@/lib/hr-type-maps";

const DOC_STATUS_OPTIONS = Object.entries(DOCUMENT_TYPES).map(([value, label]) => ({ value, label }));

function getSeverityBadge(daysLeft: number) {
  if (daysLeft <= 0) return { label: "منتهي", color: "bg-red-100 text-red-700 border-red-300" };
  if (daysLeft <= 14) return { label: `${daysLeft} يوم`, color: "bg-red-100 text-red-700 border-red-300" };
  if (daysLeft <= 30) return { label: `${daysLeft} يوم`, color: "bg-orange-100 text-orange-700 border-orange-300" };
  if (daysLeft <= 60) return { label: `${daysLeft} يوم`, color: "bg-yellow-100 text-yellow-700 border-yellow-300" };
  return { label: `${daysLeft} يوم`, color: "bg-gray-100 text-gray-600 border-gray-200" };
}

export default function ExpiringDocumentsPage() {
  const [days, setDays] = useState("90");
  const [filters, setFilters] = useFilters();

  const { data, isLoading } = useApiQuery<any>(
    ["expiring-documents", days],
    `/hr/expiring-documents?days=${days}`,
  );
  const allDocs = asList(data?.data || data);

  const filtered = applyFilters(allDocs, filters, {
    searchFields: ["employeeName"],
    statusField: "docType",
    dateField: "expiryDate",
  });

  const criticalCount = allDocs.filter((d: any) => Number(d.daysLeft) <= 14).length;
  const expiredCount = allDocs.filter((d: any) => Number(d.daysLeft) <= 0).length;

  const kpis = [
    { label: "إجمالي الوثائق", value: allDocs.length, icon: FileText, color: "text-blue-600 bg-blue-50" },
    { label: "منتهية", value: expiredCount, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "حرجة (≤14 يوم)", value: criticalCount, icon: Clock, color: "text-orange-600 bg-orange-50" },
    { label: "قريبة الانتهاء", value: allDocs.length - expiredCount - criticalCount, icon: Shield, color: "text-amber-600 bg-amber-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.employeeName} color="blue" />
          <span className="font-medium text-sm">{v.employeeName}</span>
        </div>
      ),
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
        <span className="text-sm text-gray-600">
          {v.expiryDate
            ? new Date(v.expiryDate).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })
            : "-"}
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

  return (
    <PageShell
      title="متابعة الوثائق المنتهية"
      subtitle="تتبع تصاريح العمل، الإقامات، جوازات السفر والعقود"
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
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          تحذير: {expiredCount} وثيقة منتهية الصلاحية — يجب التجديد فوراً
        </div>
      )}

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم...",
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
      />
    </PageShell>
  );
}
