import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { APPROVAL_ROLES } from "@/lib/hr-type-maps";

const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "pending",   label: "معلق"  },
  { value: "approved",  label: "موافق" },
  { value: "rejected",  label: "مرفوض" },
  { value: "escalated", label: "تصعيد" },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:   { label: "معلق",  color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  approved:  { label: "موافق", color: "bg-green-100 text-green-700 border-green-300"   },
  rejected:  { label: "مرفوض", color: "bg-red-100 text-red-700 border-red-300"         },
  escalated: { label: "تصعيد", color: "bg-purple-100 text-purple-700 border-purple-300" },
};


export default function ApprovalChainsPage() {
  const [filters, setFilters] = useFilters();
  const { data } = useApiQuery<any>(["approval-chains"], "/hr/approval-chains");
  const items = data?.data || [];

  const filtered = applyFilters(items, filters, {
    searchFields: ["employeeName", "leaveTypeName"],
    statusField: "status",
    dateField: "createdAt",
  });

  const kpis = [
    { label: "إجمالي المراحل", value: items.length, icon: GitBranch, color: "text-blue-600 bg-blue-50" },
    { label: "معلقة", value: items.filter((i: any) => i.status === "pending").length, icon: Clock, color: "text-amber-600 bg-amber-50" },
    { label: "مكتملة", value: items.filter((i: any) => i.status === "approved").length, icon: CheckCircle, color: "text-green-600 bg-green-50" },
    { label: "تصعيد", value: items.filter((i: any) => i.status === "escalated").length, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "requestId",
      header: "الطلب",
      sortable: true,
      render: (v) => (
        <div>
          <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
            #{v.requestId}
          </span>
          <span className="block text-xs text-gray-400 mt-1">
            {v.leaveTypeName} — {v.days} أيام
          </span>
        </div>
      ),
    },
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
      key: "stage",
      header: "المرحلة",
      sortable: true,
      render: (v) => (
        <Badge variant="outline" className="text-xs">المرحلة {v.stage}</Badge>
      ),
    },
    {
      key: "requiredRole",
      header: "الدور المطلوب",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-gray-600">{APPROVAL_ROLES[v.requiredRole] || v.requiredRole}</span>
      ),
    },
    {
      key: "decision",
      header: "القرار",
      render: (v) => (
        <span className="text-sm text-gray-600">{v.decision || "-"}</span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => {
        const st = STATUS_MAP[v.status] || STATUS_MAP.pending;
        return (
          <Badge variant="outline" className={cn("text-xs", st.color)}>
            {st.label}
          </Badge>
        );
      },
    },
  ];

  return (
    <PageShell
      title="سلاسل الموافقات"
      subtitle="إعداد مسارات الاعتماد ومراحل الموافقة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
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

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو نوع الإجازة...",
          statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          showDateRange: false,
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
        emptyMessage="لا توجد سلاسل موافقات"
        pageSize={20}
      />
    </PageShell>
  );
}
