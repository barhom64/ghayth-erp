import React from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";
import { Users, Plane, AlertTriangle, UserPlus, Play, Zap } from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function UmrahDashboard() {
  const { data: seasons } = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const activeSeason = (seasons?.data || []).find((s: any) => s.status === "open");
  const seasonId = activeSeason?.id;
  const { data: dash, refetch, isLoading, isError } = useApiQuery<any>(
    ["umrah-dashboard", String(seasonId || "")],
    seasonId ? `/umrah/dashboard?seasonId=${seasonId}` : "/umrah/dashboard"
  );
  const { toast } = useToast();
  const p = dash?.pilgrims || {};
  const pen = dash?.penalties || {};

  const runDaily = async () => {
    try {
      await apiFetch("/umrah/run-daily-status", { method: "POST" });
      toast({ title: "تم تحديث حالات المعتمرين" });
      refetch();
    } catch { toast({ variant: "destructive", title: "خطأ في التحديث" }); }
  };
  const runPenalties = async () => {
    try {
      const res = await apiFetch<any>("/umrah/run-penalty-engine", { method: "POST", body: JSON.stringify({}) });
      toast({ title: `تم إنشاء ${res.penaltiesCreated} غرامة` });
      refetch();
    } catch { toast({ variant: "destructive", title: "خطأ في محرك الغرامات" }); }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">لوحة تشغيل العمرة</h1>
          {activeSeason && <p className="text-sm text-muted-foreground mt-1">الموسم النشط: {activeSeason.title}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runDaily} className="gap-2"><Play className="h-4 w-4" />تحديث الحالات</Button>
          <Button variant="outline" onClick={runPenalties} className="gap-2"><Zap className="h-4 w-4" />تشغيل الغرامات</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-50">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{p.total || 0}</p>
              <p className="text-xs text-gray-500">إجمالي المعتمرين</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-green-50">
              <Plane className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{Number(p.arrived || 0) + Number(p.active || 0)}</p>
              <p className="text-xs text-gray-500">داخل المملكة</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm border-red-100">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-red-50">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{p.overstayed || 0}</p>
              <p className="text-xs text-gray-500">متأخرين</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-purple-50">
              <Plane className="w-6 h-6 text-purple-600 rotate-45" />
            </div>
            <div>
              <p className="text-2xl font-bold">{p.departed || 0}</p>
              <p className="text-xs text-gray-500">غادروا</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm border-orange-100">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-orange-50">
              <UserPlus className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600">{p.unassigned || 0}</p>
              <p className="text-xs text-gray-500">بدون وكيل</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">الغرامات</CardTitle></CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <div><span className="text-2xl font-bold text-red-600">{formatCurrency(Number(pen.totalAmount || 0))}</span></div>
              <Badge variant="outline">{pen.pending || 0} معلقة</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">أفضل الوكلاء</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(dash?.topAgents || []).slice(0, 5).map((a: any) => (
              <div key={a.id} className="flex justify-between text-sm">
                <span>{a.name}</span>
                <div className="flex gap-2">
                  <Badge variant="outline">{a.pilgrimCount} معتمر</Badge>
                  {Number(a.overstayedCount) > 0 && <Badge variant="destructive">{a.overstayedCount} متأخر</Badge>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {(dash?.recentArrivals || []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">آخر الواصلين</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "fullName", header: "الاسم", render: (r) => <span className="font-medium">{r.fullName}</span> },
                { key: "passportNumber", header: "الجواز" },
                { key: "nationality", header: "الجنسية" },
                { key: "actualArrival", header: "تاريخ الوصول", render: (r) => r.actualArrival ? new Date(r.actualArrival).toLocaleDateString("ar-SA") : "-" },
                { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
              ] as DataTableColumn<any>[]}
              data={dash?.recentArrivals || []}
              noToolbar
              pageSize={0}
              emptyMessage="لا توجد بيانات"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
