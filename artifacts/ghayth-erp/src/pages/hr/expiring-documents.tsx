import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, FileText, Clock, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

const DOC_LABELS: Record<string, string> = {
  work_permit: "تصريح عمل",
  iqama: "إقامة",
  passport: "جواز سفر",
  contract: "عقد عمل",
};

const DOC_COLORS: Record<string, string> = {
  work_permit: "border-blue-300 text-blue-700 bg-blue-50",
  iqama: "border-purple-300 text-purple-700 bg-purple-50",
  passport: "border-green-300 text-green-700 bg-green-50",
  contract: "border-orange-300 text-orange-700 bg-orange-50",
};

const DOC_STATUS_OPTIONS = Object.entries(DOC_LABELS).map(([value, label]) => ({ value, label }));

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
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
            {(v.employeeName || "؟").charAt(0)}
          </div>
          <span className="font-medium text-sm">{v.employeeName}</span>
        </div>
      ),
    },
    {
      key: "docType",
      header: "نوع الوثيقة",
      sortable: true,
      render: (v) => (
        <Badge variant="outline" className={cn("text-xs", DOC_COLORS[v.docType] || "")}>
          {DOC_LABELS[v.docType] || v.docLabel || v.docType}
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
