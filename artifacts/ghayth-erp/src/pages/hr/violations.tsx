import { formatCurrency } from "@/lib/formatters";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import {
  Plus, AlertTriangle, Scale, DollarSign, Shield,
  Clock, Ban, Gavel, ScrollText, MapPin, PenLine, DoorOpen, FileText, Radar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { VIOLATION_STATUS } from "@/lib/hr-type-maps";

const STATUS_OPTIONS = Object.entries(VIOLATION_STATUS).map(([value, { label }]) => ({ value, label }));

const INCIDENT_LABELS: Record<string, { label: string; Icon: typeof Clock; color: string }> = {
  late:             { label: "تأخر",         Icon: Clock,      color: "text-amber-600 bg-amber-50"   },
  early_leave:      { label: "مغادرة مبكرة", Icon: DoorOpen,   color: "text-orange-600 bg-orange-50" },
  absence:          { label: "غياب",         Icon: Ban,        color: "text-red-600 bg-red-50"       },
  behavior:         { label: "سلوك",         Icon: Gavel,      color: "text-purple-600 bg-purple-50" },
  organization:     { label: "تنظيم",        Icon: ScrollText, color: "text-blue-600 bg-blue-50"     },
  gps_out_of_range: { label: "خروج GPS",     Icon: MapPin,     color: "text-emerald-600 bg-emerald-50" },
  custom:           { label: "مخصّص",        Icon: PenLine,    color: "text-slate-600 bg-slate-50"   },
};

export default function ViolationsPage() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const { data } = useApiQuery<{ data: any[]; total: number }>(
    ["discipline-memos"],
    "/hr/discipline/memos",
  );
  const items = data?.data || [];

  const filtered = applyFilters(items, filters, {
    searchFields: ["employeeName", "memoNumber"],
    statusField: "status",
    dateField: "createdAt",
  });

  // KPIs
  const totalDeductions = items.reduce(
    (s: number, v: any) => s + Number(v.appliedDeductionAmount || 0) + Number(v.appliedExtraDeduction || 0),
    0,
  );
  const approvedCount = items.filter((v: any) => v.status === "approved").length;
  const pendingCount = items.filter((v: any) =>
    v.status?.startsWith("pending") || v.status === "draft",
  ).length;
  const terminationCount = items.filter((v: any) => v.terminationDecided).length;

  const kpis = [
    { label: "إجمالي المحاضر", value: items.length, icon: FileText, color: "text-blue-600 bg-blue-50" },
    { label: "بانتظار الإجراء", value: pendingCount, icon: AlertTriangle, color: "text-amber-600 bg-amber-50" },
    { label: "إجمالي الخصومات", value: formatCurrency(totalDeductions), icon: DollarSign, color: "text-red-600 bg-red-50" },
    { label: "منفّذ", value: approvedCount, icon: Shield, color: "text-green-600 bg-green-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "memoNumber",
      header: "رقم المحضر",
      sortable: true,
      render: (v) => (
        <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
          {v.memoNumber || `#${v.id}`}
        </span>
      ),
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.employeeName} color="red" />
          <div>
            <span className="font-medium text-sm block">{v.employeeName}</span>
            {v.empNumber && (
              <span className="text-xs text-gray-400">#{v.empNumber}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "incidentType",
      header: "نوع الواقعة",
      sortable: true,
      render: (v) => {
        const inc = INCIDENT_LABELS[v.incidentType];
        if (!inc) return <span className="text-gray-400">{v.incidentType || "-"}</span>;
        return (
          <div className="flex items-center gap-1.5">
            <div className={cn("w-6 h-6 rounded flex items-center justify-center", inc.color.split(" ")[1])}>
              <inc.Icon className={cn("h-3.5 w-3.5", inc.color.split(" ")[0])} />
            </div>
            <span className="text-sm">{inc.label}</span>
          </div>
        );
      },
    },
    {
      key: "incidentDate",
      header: "تاريخ الواقعة",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-gray-600">
          {v.incidentDate
            ? new Date(v.incidentDate).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })
            : "-"}
        </span>
      ),
    },
    {
      key: "occurrenceCount",
      header: "التكرار",
      sortable: true,
      render: (v) => {
        const count = v.occurrenceCount || 0;
        return (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              count >= 4 ? "border-red-300 text-red-700 bg-red-50" :
              count >= 3 ? "border-orange-300 text-orange-700 bg-orange-50" :
              count >= 2 ? "border-amber-300 text-amber-700 bg-amber-50" :
              "border-gray-200",
            )}
          >
            المرة {count}
          </Badge>
        );
      },
    },
    {
      key: "appliedPenaltyLabel",
      header: "الجزاء",
      sortable: true,
      render: (v) => {
        if (v.terminationDecided) {
          return (
            <Badge className="bg-red-600 text-white text-xs">
              فصل
            </Badge>
          );
        }
        return (
          <span className="text-sm">
            {v.appliedPenaltyLabel || "-"}
          </span>
        );
      },
    },
    {
      key: "appliedDeductionAmount",
      header: "الخصم",
      sortable: true,
      render: (v) => {
        const total = Number(v.appliedDeductionAmount || 0) + Number(v.appliedExtraDeduction || 0);
        if (!total) return <span className="text-gray-400">-</span>;
        return (
          <span className="text-sm font-semibold text-red-600">
            {formatCurrency(total)}
          </span>
        );
      },
    },
    {
      key: "regTitle",
      header: "المادة",
      sortable: true,
      render: (v) => {
        if (!v.regArticle) return <span className="text-gray-400">-</span>;
        return (
          <span className="text-xs text-gray-600">
            مادة {v.regArticle}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => <PageStatusBadge status={v.status} />,
    },
  ];

  return (
    <PageShell
      title="المخالفات والجزاءات"
      subtitle="محاضر الاستفسار والإجراءات التأديبية"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/hr/violations/auto-detection">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Radar className="h-4 w-4" />
              الرصد التلقائي
            </Button>
          </Link>
          <Link href="/hr/violations/create">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              تسجيل مخالفة
            </Button>
          </Link>
        </div>
      }
    >
      {/* KPI cards */}
      <KpiGrid items={kpis} />

      {/* Termination alert */}
      {terminationCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            يوجد <strong>{terminationCount}</strong> محضر يتضمن قرار فصل — يرجى المراجعة
          </span>
        </div>
      )}

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو رقم المحضر...",
          statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
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
        emptyMessage="لا توجد محاضر مخالفات — سجّل مخالفة جديدة للبدء"
        pageSize={20}
        onRowClick={(item) => navigate(`/hr/discipline/memos/${item.id}`)}
      />
    </PageShell>
  );
}
