import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { formatDateAr, formatTimeAr, formatCurrency } from "@/lib/formatters";
import { PageStatusBadge } from "@workspace/ui-core";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  Clock, CheckCircle2, XCircle, AlertCircle, Calendar,
  TrendingUp, DollarSign, AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; color: string }> = {
  present: { label: "حاضر", color: "text-status-success-foreground bg-status-success-surface" },
  present_out_of_range: { label: "خارج النطاق", color: "text-orange-600 bg-orange-50" },
  present_off_day: { label: "حضور يوم عطلة", color: "text-purple-600 bg-purple-50" },
  present_holiday: { label: "حضور عطلة رسمية", color: "text-purple-600 bg-purple-50" },
  absent: { label: "غائب", color: "text-status-error-foreground bg-status-error-surface" },
  late: { label: "متأخر", color: "text-orange-600 bg-orange-50" },
  leave: { label: "إجازة", color: "text-status-info-foreground bg-status-info-surface" },
  on_leave: { label: "في إجازة", color: "text-status-info-foreground bg-status-info-surface" },
  holiday: { label: "عطلة", color: "text-purple-600 bg-purple-50" },
  remote: { label: "عن بُعد", color: "text-cyan-600 bg-cyan-50" },
};

const severityConfig: Record<string, { label: string; color: string }> = {
  low: { label: "منخفض", color: "bg-status-warning-surface text-status-warning-foreground" },
  medium: { label: "متوسط", color: "bg-orange-100 text-orange-700" },
  high: { label: "مرتفع", color: "bg-status-error-surface text-status-error-foreground" },
  critical: { label: "حرج", color: "bg-red-200 text-status-error-foreground" },
};

const attendanceColumns: DataTableColumn<any>[] = [
  { key: "date", header: "التاريخ", sortable: true, searchable: true, render: (r) => formatDateAr(r.date) },
  { key: "checkIn", header: "الحضور", render: (r) => formatTimeAr(r.checkIn) || "—" },
  { key: "checkOut", header: "الانصراف", render: (r) => formatTimeAr(r.checkOut) || "—" },
  {
    key: "lateMinutes", header: "التأخير", sortable: true,
    render: (r) => r.lateMinutes > 0
      ? <span className="text-orange-600 font-medium">{r.lateMinutes} د</span>
      : <span className="text-muted-foreground">—</span>,
  },
  {
    key: "overtimeMinutes", header: "وقت إضافي", sortable: true,
    render: (r) => r.overtimeMinutes > 0
      ? <span className="text-emerald-600 font-medium">{r.overtimeMinutes} د</span>
      : <span className="text-muted-foreground">—</span>,
  },
  {
    key: "totalDeductions", header: "خصم", sortable: true,
    render: (r) => {
      const sev = r.violationSeverity && r.violationCount > 0 ? severityConfig[r.violationSeverity] : null;
      return Number(r.totalDeductions) > 0 ? (
        <div className="flex items-center gap-1">
          <span className="text-status-error-foreground font-medium">{formatCurrency(Number(r.totalDeductions))}</span>
          {sev && (
            <Badge className={cn("text-[10px] px-1 py-0", sev.color)}>
              <AlertTriangle className="w-2.5 h-2.5 me-0.5 inline" />{sev.label}
            </Badge>
          )}
        </div>
      ) : <span className="text-muted-foreground">—</span>;
    },
  },
  {
    key: "status", header: "الحالة", searchable: true,
    render: (r) => <PageStatusBadge status={r.status} domain="attendance" />,
  },
];

export default function MyAttendance() {
  const today = new Date();
  const [month, setMonth] = useState(today.toISOString().slice(0, 7));

  const { data, isLoading, isError } = useApiQuery<any>(
    ["my-attendance", month],
    `/my-space/attendance?month=${month}`
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const records: any[] = data?.data ?? [];
  const monthly = data?.monthly;

  const presentDays = monthly?.presentDays ?? records.filter((r: any) => r.status === "present" || r.checkIn).length;
  const absentDays = records.filter((r: any) => r.status === "absent").length;
  const lateDays = monthly?.lateDays ?? records.filter((r: any) => r.lateMinutes > 0).length;
  const totalLateMinutes = monthly?.totalLateMinutes ?? records.reduce((sum: number, r: any) => sum + (Number(r.lateMinutes) || 0), 0);
  const totalDeduction = monthly?.totalDeduction ?? records.reduce((sum: number, r: any) => sum + (Number(r.totalDeductions) || 0), 0);
  const totalOvertimeMinutes = monthly?.overtimeMinutes ?? records.reduce((sum: number, r: any) => sum + (Number(r.overtimeMinutes) || 0), 0);

  return (
    <PageShell title="حضوري وانصرافي" subtitle="سجل الحضور والانصراف الشهري">
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium text-status-neutral-foreground">الشهر:</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "أيام الحضور", value: presentDays, icon: CheckCircle2, color: "text-status-success-foreground bg-status-success-surface" },
          { label: "أيام الغياب", value: absentDays, icon: XCircle, color: "text-status-error-foreground bg-status-error-surface" },
          { label: "أيام التأخير", value: lateDays, icon: AlertCircle, color: "text-orange-600 bg-orange-50" },
          { label: "دقائق التأخير", value: totalLateMinutes, icon: Clock, color: "text-status-info-foreground bg-status-info-surface" },
          { label: "الوقت الإضافي (د)", value: totalOvertimeMinutes, icon: TrendingUp, color: "text-emerald-600 bg-emerald-50" },
          { label: "إجمالي الخصومات", value: formatCurrency(Number(totalDeduction)), icon: DollarSign, color: "text-status-error-foreground bg-status-error-surface" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center mb-2", stat.color)}>
                  <Icon size={20} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DataTable
        columns={attendanceColumns}
        data={records}
        emptyMessage="لا توجد سجلات حضور لهذا الشهر"
        emptyIcon={<Calendar size={36} className="opacity-40" />}
        searchPlaceholder="بحث بالتاريخ أو الحالة..."
        statusOptions={Object.entries(statusConfig).map(([value, { label }]) => ({ value, label }))}
        pageSize={31}
      />
    </PageShell>
  );
}
