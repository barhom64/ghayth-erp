import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingDown, Users, DollarSign, BarChart3, PieChart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart as RechartsPie, Pie } from "recharts";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

const REASON_LABELS: Record<string, string> = {
  resignation: "استقالة",
  termination: "فصل",
  end_of_service: "إنهاء خدمة",
  contract_end: "انتهاء عقد",
  retirement: "تقاعد",
  unknown: "غير محدد",
};

const COLORS = ["#6366f1", "#f59e0b", "#ef4444", "#10b981", "#3b82f6", "#ec4899"];

export default function TurnoverReportPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data, isLoading, isError } = useApiQuery<any>(["turnover-report", String(year)], `/hr/turnover-report?year=${year}`);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;


  const monthlyData = (data?.byMonth || []).map((m: any) => ({
    name: MONTHS_AR[m.month - 1],
    count: m.count,
  }));

  const reasonData = (data?.byReason || []).map((r: any, i: number) => ({
    name: REASON_LABELS[r.reason] || r.reason,
    value: r.count,
    color: COLORS[i % COLORS.length],
  }));

  const deptData = (data?.byDepartment || []).sort((a: any, b: any) => b.count - a.count).slice(0, 6);

  return (
    <PageShell
      title="تقرير دوران الموظفين"
      subtitle="تحليل معدل الدوران الوظيفي والتكاليف المرتبطة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "تقرير دوران الموظفين" }]}
      actions={
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[currentYear - 2, currentYear - 1, currentYear].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-status-error mb-1"><Users className="w-4 h-4" /><span className="text-xs text-muted-foreground">المغادرون</span></div>
            <div className="text-2xl font-bold">{data?.totalTerminated || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-status-success mb-1"><Users className="w-4 h-4" /><span className="text-xs text-muted-foreground">الموظفون الحاليون</span></div>
            <div className="text-2xl font-bold">{data?.totalActive || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-primary mb-1"><BarChart3 className="w-4 h-4" /><span className="text-xs text-muted-foreground">معدل الدوران</span></div>
            <div className="text-2xl font-bold">{data?.turnoverRate || 0}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-orange-500 mb-1"><DollarSign className="w-4 h-4" /><span className="text-xs text-muted-foreground">التكلفة التقديرية</span></div>
            <div className="text-lg font-bold">{formatCurrency(data?.totalEstimatedCost || 0)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">المغادرون شهرياً</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData}>
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, "مغادرون"]} />
                <Bar dataKey="count" fill="#6366f1" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">توزيع أسباب المغادرة</CardTitle></CardHeader>
          <CardContent>
            {reasonData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={140} height={140}>
                  <RechartsPie>
                    <Pie data={reasonData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60}>
                      {reasonData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                  </RechartsPie>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {reasonData.map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                        <span>{r.name}</span>
                      </div>
                      <span className="font-medium">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="text-center py-6 text-muted-foreground text-sm">لا توجد بيانات</div>}
          </CardContent>
        </Card>
      </div>

      {deptData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">المغادرون حسب القسم</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deptData.map((d: any, i: number) => {
                const max = deptData[0]?.count || 1;
                const pct = Math.round((d.count / max) * 100);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-24 text-xs text-muted-foreground truncate text-start">{d.dept}</div>
                    <div className="flex-1 bg-surface-subtle rounded-full h-2">
                      <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-medium w-6 text-end">{d.count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {data?.recentTerminations?.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">آخر المغادرين</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={[
                {
                  key: "employeeName",
                  header: "الموظف",
                  sortable: true,
                  render: (v: any) => (
                    <div className="flex items-center gap-2">
                      <AvatarInitial name={v.employeeName} color="red" />
                      <span className="font-medium text-sm">{v.employeeName}</span>
                    </div>
                  ),
                },
                {
                  key: "deptName",
                  header: "القسم",
                  sortable: true,
                  render: (v: any) => <span className="text-sm text-muted-foreground">{v.deptName || "—"}</span>,
                },
                {
                  key: "terminationType",
                  header: "سبب المغادرة",
                  sortable: true,
                  render: (v: any) => (
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      v.terminationType === "termination" ? "border-status-error-surface text-status-error-foreground bg-status-error-surface" :
                      v.terminationType === "resignation" ? "border-status-warning-surface text-status-warning-foreground bg-status-warning-surface" :
                      "border-border",
                    )}>
                      {REASON_LABELS[v.terminationType] || v.terminationType}
                    </Badge>
                  ),
                },
                {
                  key: "terminationDate",
                  header: "تاريخ المغادرة",
                  sortable: true,
                  render: (v: any) => (
                    <span className="text-sm text-muted-foreground">
                      {formatDateAr(v.terminationDate)}
                    </span>
                  ),
                },
              ] as DataTableColumn<any>[]}
              data={data.recentTerminations}
              noToolbar
              emptyMessage="لا يوجد مغادرين"
              pageSize={10}
            />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
