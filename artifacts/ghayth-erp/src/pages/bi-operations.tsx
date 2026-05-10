import { useState, useRef, useCallback } from "react";
import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/formatters";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import {
  AlertTriangle, TrendingUp, Users, Clock, CheckCircle2, XCircle,
  Activity, Timer, Printer, Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BiTabsNav } from "@/components/shared/bi-tabs-nav";

function useChartExport() {
  const { toast } = useToast();
  return useCallback(async (element: HTMLElement | null, filename = "chart.png") => {
    if (!element) return;
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(element, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const a = document.createElement("a");
      a.download = filename;
      a.href = dataUrl;
      a.click();
      toast({ title: "تم التصدير", description: `تم حفظ الرسم البياني كـ ${filename}` });
    } catch {
      toast({ title: "فشل التصدير", variant: "destructive" });
    }
  }, [toast]);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-gray-100 text-xs" dir="rtl">
      <p className="font-semibold mb-1.5 text-gray-700">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1.5 py-0.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
          {p.name}: {formatNumber(Number(p.value))}
        </p>
      ))}
    </div>
  );
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"];

function SlaDelaysTab({ from, to, departmentId }: { from: string; to: string; departmentId: string }) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (departmentId) params.set("departmentId", departmentId);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-sla-delays", from, to, departmentId], `/bi/operations/sla-delays${qs}`);
  const rows = data?.data || [];
  const chartRef = useRef<HTMLDivElement>(null);
  const exportChart = useChartExport();

  const slaColumns: DataTableColumn<any>[] = [
    { key: "department", header: "القسم", sortable: true, searchable: true, render: (r: any) => <span className="font-medium">{r.department}</span> },
    { key: "total", header: "الإجمالي", sortable: true, render: (r: any) => formatNumber(Number(r.total)) },
    { key: "delayed", header: "المتأخر", sortable: true, render: (r: any) => <span className="text-red-600 font-bold">{formatNumber(Number(r.delayed))}</span> },
    { key: "delayPct", header: "نسبة التأخر", sortable: true, render: (r: any) => (
      <Badge variant={Number(r.delayPct) > 20 ? "destructive" : "secondary"}>
        {r.delayPct}%
      </Badge>
    ) },
  ];

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-orange-500" /> تأخر الطلبات حسب القسم</CardTitle>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => exportChart(chartRef.current, "sla-delays.png")}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد بيانات</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div ref={chartRef} style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis dataKey="department" type="category" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="total" name="الإجمالي" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="delayed" name="المتأخر" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <DataTable
                columns={slaColumns}
                data={rows}
                isLoading={isLoading}
                isError={isError}
                error={error}
                onRetry={refetch}
                rowKey={(r: any, i: number) => r.department ?? i}
                pageSize={0}
                noToolbar
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RejectionRateTab({ from, to }: { from: string; to: string }) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-rejection-rate", from, to], `/bi/operations/rejection-rate${qs}`);
  const rows = data?.data || [];

  const rejectionColumns: DataTableColumn<any>[] = [
    { key: "type", header: "النوع", sortable: true, searchable: true, render: (r: any) => <span className="font-medium">{r.type}</span> },
    { key: "total", header: "الإجمالي", sortable: true, render: (r: any) => formatNumber(Number(r.total)) },
    { key: "rejected", header: "المرفوض", sortable: true, render: (r: any) => <span className="text-red-600">{formatNumber(Number(r.rejected))}</span> },
    { key: "rejectionPct", header: "نسبة الرفض", sortable: true, render: (r: any) => (
      <Badge variant={Number(r.rejectionPct) > 15 ? "destructive" : "secondary"}>{r.rejectionPct}%</Badge>
    ) },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><XCircle className="w-5 h-5 text-red-500" /> نسبة الرفض والإرجاع حسب النوع</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">لا توجد بيانات</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rows} dataKey="rejected" nameKey="type" cx="50%" cy="50%" innerRadius={55} outerRadius={85} label={({ type, rejectionPct }: any) => `${type} (${rejectionPct}%)`} labelLine>
                    {rows.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <DataTable
              columns={rejectionColumns}
              data={rows}
              isLoading={isLoading}
              isError={isError}
              error={error}
              onRetry={refetch}
              rowKey={(r: any, i: number) => r.type ?? i}
              pageSize={0}
              noToolbar
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BottleneckTab({ from, to, departmentId }: { from: string; to: string; departmentId: string }) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (departmentId) params.set("departmentId", departmentId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-bottleneck", from, to, departmentId], `/bi/operations/bottleneck${qs}`);
  const departmentDelay = data?.departmentDelay || [];
  const approvalBottleneck = data?.approvalBottleneck || [];

  const departmentDelayColumns: DataTableColumn<any>[] = [
    { key: "department", header: "القسم", sortable: true, searchable: true, render: (r: any) => <span className="font-medium">{r.department}</span> },
    { key: "avgHours", header: "متوسط الساعات", sortable: true, render: (r: any) => `${r.avgHours} ساعة` },
    { key: "overdueCount", header: "المتأخر", sortable: true, render: (r: any) => <span className="text-red-600 font-bold">{formatNumber(Number(r.overdueCount))}</span> },
  ];

  const approvalBottleneckColumns: DataTableColumn<any>[] = [
    { key: "department", header: "القسم", sortable: true, searchable: true, render: (r: any) => <span className="font-medium">{r.department}</span> },
    { key: "pendingApprovals", header: "الموافقات المعلقة", sortable: true, render: (r: any) => <span className="text-amber-600 font-bold">{formatNumber(Number(r.pendingApprovals))}</span> },
    { key: "avgWaitHours", header: "متوسط وقت الانتظار", sortable: true, render: (r: any) => `${r.avgWaitHours} ساعة` },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Timer className="w-5 h-5 text-amber-500" /> أكثر الأقسام تأخراً</CardTitle></CardHeader>
        <CardContent>
          {departmentDelay.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد بيانات</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={departmentDelay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="avgHours" name="متوسط الساعات" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="overdueCount" name="المتأخر" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <DataTable
                columns={departmentDelayColumns}
                data={departmentDelay}
                isLoading={isLoading}
                isError={isError}
                error={error}
                onRetry={refetch}
                rowKey={(r: any, i: number) => r.department ?? i}
                pageSize={0}
                noToolbar
              />
            </div>
          )}
        </CardContent>
      </Card>

      {approvalBottleneck.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="w-5 h-5 text-blue-500" /> اختناقات الموافقات</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={approvalBottleneckColumns}
              data={approvalBottleneck}
              isLoading={isLoading}
              isError={isError}
              error={error}
              onRetry={refetch}
              rowKey={(r: any, i: number) => r.department ?? i}
              pageSize={0}
              noToolbar
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProductivityTab({ from, to, departmentId }: { from: string; to: string; departmentId: string }) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (departmentId) params.set("departmentId", departmentId);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-productivity", from, to, departmentId], `/bi/operations/employee-productivity${qs}`);
  const rows = data?.data || [];

  const productivityColumns: DataTableColumn<any>[] = [
    { key: "name", header: "الموظف", sortable: true, searchable: true, render: (r: any) => <span className="font-medium">{r.name}</span> },
    { key: "department", header: "القسم", sortable: true, searchable: true, render: (r: any) => <span className="text-muted-foreground">{r.department}</span> },
    { key: "completedTasks", header: "مكتملة", sortable: true, render: (r: any) => <span className="text-green-600 font-bold">{formatNumber(Number(r.completedTasks))}</span> },
    { key: "totalTasks", header: "الإجمالي", sortable: true, render: (r: any) => formatNumber(Number(r.totalTasks)) },
    { key: "completionRate", header: "نسبة الإنجاز", sortable: true, render: (r: any) => (
      <Badge variant={Number(r.completionRate) >= 80 ? "default" : Number(r.completionRate) >= 50 ? "secondary" : "destructive"}>
        {r.completionRate}%
      </Badge>
    ) },
    { key: "workedHours", header: "ساعات العمل", sortable: true, render: (r: any) => Number(r.workedHours) > 0 ? `${r.workedHours} س` : "—" },
    { key: "productivityRate", header: "الإنتاجية", sortable: true, render: (r: any) => (
      <Badge variant={Number(r.productivityRate) > 0 ? "default" : "secondary"}>
        {Number(r.productivityRate) > 0 ? `${r.productivityRate} مهمة/ساعة` : "—"}
      </Badge>
    ) },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="w-5 h-5 text-blue-500" /> إنتاجية الموظفين</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">لا توجد بيانات</p>
        ) : (
          <div className="space-y-4">
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="completedTasks" name="مهام مكتملة" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="totalTasks" name="إجمالي المهام" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <DataTable
              columns={productivityColumns}
              data={rows}
              isLoading={isLoading}
              isError={isError}
              error={error}
              onRetry={refetch}
              rowKey={(r: any, i: number) => r.name ?? i}
              noToolbar
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompletionTimeTab({ from, to, departmentId }: { from: string; to: string; departmentId: string }) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (departmentId) params.set("departmentId", departmentId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["bi-avg-completion", from, to, departmentId], `/bi/operations/avg-completion-time${qs}`);
  const rows = data?.data || [];

  const completionColumns: DataTableColumn<any>[] = [
    { key: "type", header: "نوع الطلب", sortable: true, searchable: true, render: (r: any) => <span className="font-medium">{r.type}</span> },
    { key: "avgHours", header: "متوسط الإنجاز (ساعة)", sortable: true, render: (r: any) => `${r.avgHours} ساعة` },
    { key: "total", header: "العدد", sortable: true, render: (r: any) => formatNumber(Number(r.total)) },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="w-5 h-5 text-purple-500" /> متوسط وقت إنجاز كل نوع طلب</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">لا توجد بيانات</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="type" type="category" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="avgHours" name="متوسط الساعات" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <DataTable
              columns={completionColumns}
              data={rows}
              isLoading={isLoading}
              isError={isError}
              error={error}
              onRetry={refetch}
              rowKey={(r: any, i: number) => r.type ?? i}
              pageSize={0}
              noToolbar
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendTab({ from, to, departmentId }: { from: string; to: string; departmentId: string }) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (departmentId) params.set("departmentId", departmentId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const { data, isError } = useApiQuery<any>(["bi-trend", from, to, departmentId], `/bi/operations/trend${qs}`);
  if (isError) return <ErrorState />;
  const rows = data?.data || [];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-500" /> اتجاه الأداء الأسبوعي</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">لا توجد بيانات</p>
        ) : (
          <div style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="total" name="الإجمالي" stroke="#94a3b8" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="completed" name="المكتمل" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="overdue" name="المتأخر" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApprovalTimeliness({ from, to, departmentId }: { from: string; to: string; departmentId: string }) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (departmentId) params.set("departmentId", departmentId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const { data, isError } = useApiQuery<any>(["bi-approval-timeliness", from, to, departmentId], `/bi/operations/approval-timeliness${qs}`);
  if (isError) return <ErrorState />;
  if (!data) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{formatNumber(Number(data.total))}</div>
          <p className="text-xs text-muted-foreground mt-1">إجمالي الطلبات</p>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-green-600">{formatNumber(Number(data.approved))}</div>
          <p className="text-xs text-muted-foreground mt-1">تم اعتمادها</p>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-amber-600">{formatNumber(Number(data.pending))}</div>
          <p className="text-xs text-muted-foreground mt-1">قيد الانتظار</p>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-purple-600">{data.avgApprovalHours || 0} ساعة</div>
          <p className="text-xs text-muted-foreground mt-1">متوسط وقت الاعتماد</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function BiOperationsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  return (
    <PageShell
      title="تحليل الأداء التشغيلي"
      subtitle="تحليل شامل للاختناقات والإنتاجية وأداء العمليات"
      actions={
        <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden gap-2">
          <Printer className="w-4 h-4" /> طباعة
        </Button>
      }
    >
      <BiTabsNav />
      <Card className="border-0 shadow-sm print:hidden">
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>من تاريخ</Label>
              <DatePicker value={from} onChange={setFrom} />
            </div>
            <div>
              <Label>إلى تاريخ</Label>
              <DatePicker value={to} onChange={setTo} />
            </div>
            <div>
              <Label>رقم القسم</Label>
              <Input type="number" placeholder="الكل" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); setDepartmentId(""); }}>إعادة تعيين</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ApprovalTimeliness from={from} to={to} departmentId={departmentId} />

      <Tabs defaultValue="sla" dir="rtl">
        <TabsList className="grid w-full grid-cols-6 print:hidden">
          <TabsTrigger value="sla">تأخر مستوى الخدمة</TabsTrigger>
          <TabsTrigger value="rejection">نسبة الرفض</TabsTrigger>
          <TabsTrigger value="bottleneck">الاختناقات</TabsTrigger>
          <TabsTrigger value="productivity">الإنتاجية</TabsTrigger>
          <TabsTrigger value="completion">وقت الإنجاز</TabsTrigger>
          <TabsTrigger value="trend">الاتجاه</TabsTrigger>
        </TabsList>
        <TabsContent value="sla"><SlaDelaysTab from={from} to={to} departmentId={departmentId} /></TabsContent>
        <TabsContent value="rejection"><RejectionRateTab from={from} to={to} /></TabsContent>
        <TabsContent value="bottleneck"><BottleneckTab from={from} to={to} departmentId={departmentId} /></TabsContent>
        <TabsContent value="productivity"><ProductivityTab from={from} to={to} departmentId={departmentId} /></TabsContent>
        <TabsContent value="completion"><CompletionTimeTab from={from} to={to} departmentId={departmentId} /></TabsContent>
        <TabsContent value="trend"><TrendTab from={from} to={to} departmentId={departmentId} /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
