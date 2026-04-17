import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageShell } from "@/components/page-shell";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import {
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  TrendingUp,
  BarChart3,
  Building2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const TYPE_LABELS: Record<string, string> = {
  employee_no_contract: "موظف بدون عقد",
  expired_contract_not_renewed: "عقد منتهي لم يُجدد",
  vehicle_no_insurance: "مركبة بدون تأمين",
  overdue_invoice_no_action: "فاتورة متأخرة بدون تحصيل",
  unsettled_custody: "عهدة لم تُسوَّ",
  stalled_request: "طلب متوقف",
  hearing_no_preparation: "جلسة بدون تحضير",
  employee_no_assignment: "موظف بدون تعيين",
  incomplete_attendance: "حضور ناقص",
  negative_leave_balance: "رصيد إجازات سالب",
};

const DEPARTMENT_LABELS: Record<string, string> = {
  hr: "الموارد البشرية",
  finance: "المالية",
  fleet: "الأسطول",
  legal: "القانونية",
  operations: "العمليات",
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: "حرج", color: "text-red-700", bg: "bg-red-100" },
  high: { label: "عالي", color: "text-orange-700", bg: "bg-orange-100" },
  medium: { label: "متوسط", color: "text-yellow-700", bg: "bg-yellow-100" },
  low: { label: "منخفض", color: "text-blue-700", bg: "bg-blue-100" },
};

export default function ViolationsReportPage() {
  const [filters, setFilters] = useState({ type: "", priority: "", status: "open", department: "" });
  const queryParams = new URLSearchParams();
  if (filters.type) queryParams.set("type", filters.type);
  if (filters.priority) queryParams.set("priority", filters.priority);
  if (filters.status) queryParams.set("status", filters.status);
  if (filters.department) queryParams.set("department", filters.department);

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["violations-report", filters.type, filters.priority, filters.status, filters.department],
    `/admin/violations-report?${queryParams.toString()}`
  );

  const violations = data?.data || [];
  const summary = data?.summary || {};
  const byType = data?.byType || [];
  const byDepartment = data?.byDepartment || [];
  const trend = data?.trend || [];

  const resolveMut = useApiMutation<any, { id: number }>(
    (body) => `/admin/violations/${body.id}/resolve`,
    "PATCH",
    [["violations-report"]],
    { successMessage: "تم الحل" }
  );
  const resolving = resolveMut.isPending ? resolveMut.variables?.id ?? null : null;

  const summaryCards = [
    { label: "مخالفات اليوم", value: Number(summary.total || 0), icon: ShieldAlert, color: "text-gray-700 bg-gray-100" },
    { label: "مفتوحة اليوم", value: Number(summary.open || 0), icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "تم حلها اليوم", value: Number(summary.resolved || 0), icon: CheckCircle2, color: "text-green-600 bg-green-50" },
    { label: "حرجة اليوم", value: Number(summary.critical || 0), icon: TrendingUp, color: "text-red-700 bg-red-100" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "type",
      header: "النوع",
      sortable: true,
      render: (v) => <Badge variant="outline" className="text-xs">{TYPE_LABELS[v.type] || v.type}</Badge>,
    },
    {
      key: "department",
      header: "القسم",
      sortable: true,
      render: (v) => <span className="text-xs text-gray-600">{DEPARTMENT_LABELS[v.department] || v.department || "-"}</span>,
    },
    {
      key: "description",
      header: "الوصف",
      sortable: true,
      className: "max-w-[200px] truncate",
    },
    {
      key: "priority",
      header: "الأولوية",
      sortable: true,
      render: (v) => {
        const pc = PRIORITY_CONFIG[v.priority] || PRIORITY_CONFIG.medium;
        return <Badge className={cn("text-xs", pc.bg, pc.color)}>{pc.label}</Badge>;
      },
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => v.status === "resolved"
        ? <Badge className="bg-green-100 text-green-700 text-xs">تم الحل</Badge>
        : <Badge className="bg-red-100 text-red-700 text-xs">مفتوحة</Badge>,
    },
    {
      key: "auditDate",
      header: "التاريخ",
      sortable: true,
      render: (v) => v.auditDate ? formatDateAr(v.auditDate) : "-",
    },
    {
      key: "action",
      header: "إجراء",
      render: (v) => v.status === "open" ? (
        <Button size="sm" variant="outline" className="text-xs" disabled={resolving === v.id} onClick={() => resolveMut.mutate({ id: v.id })}>
          <CheckCircle2 className="h-3 w-3 me-1" /> تم المعالجة
        </Button>
      ) : null,
    },
  ];

  return (
    <PageShell
      title="تقرير المخالفات"
      subtitle="رصد ومتابعة المخالفات التشغيلية عبر أقسام النظام"
      breadcrumbs={[{ href: "/admin", label: "إدارة النظام" }]}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              تطور المخالفات (آخر 30 يوم)
            </h3>
            {trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip labelFormatter={(v) => `التاريخ: ${v}`} formatter={(v: any) => [`${v} مخالفة`, "العدد"]} />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-sm text-center py-8">لا توجد بيانات</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-orange-500" /> حسب النوع
              </h3>
              {byType.length > 0 ? (
                <div className="space-y-2 max-h-[100px] overflow-y-auto">
                  {byType.map((t: any) => (
                    <div key={t.type} className="flex items-center justify-between p-1.5 rounded border bg-gray-50 text-xs">
                      <span>{TYPE_LABELS[t.type] || t.type}</span>
                      <Badge variant="outline" className="text-[10px]">{t.count}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-xs text-center py-4">لا توجد مخالفات مفتوحة</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-purple-500" /> حسب القسم
              </h3>
              {byDepartment.length > 0 ? (
                <div className="space-y-2">
                  {byDepartment.map((d: any) => (
                    <div key={d.department} className="flex items-center justify-between p-1.5 rounded border bg-gray-50 text-xs">
                      <span>{DEPARTMENT_LABELS[d.department] || d.department}</span>
                      <Badge variant="outline" className="text-[10px]">{d.count}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-xs text-center py-4">لا توجد بيانات</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium block mb-1">النوع</label>
              <select className="w-full border rounded-lg p-2 bg-white text-sm" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
                <option value="">الكل</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">القسم</label>
              <select className="w-full border rounded-lg p-2 bg-white text-sm" value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })}>
                <option value="">الكل</option>
                {Object.entries(DEPARTMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">الأولوية</label>
              <select className="w-full border rounded-lg p-2 bg-white text-sm" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
                <option value="">الكل</option>
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">الحالة</label>
              <select className="w-full border rounded-lg p-2 bg-white text-sm" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="">الكل</option>
                <option value="open">مفتوحة</option>
                <option value="resolved">تم حلها</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={violations}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد مخالفات مطابقة"
            emptyIcon={<ShieldAlert className="h-6 w-6 text-slate-400" />}
            noToolbar
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
