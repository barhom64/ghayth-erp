import React from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Users, Plane, AlertTriangle, UserPlus, Play, Zap, ShieldAlert, TrendingUp, TrendingDown, Coins, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@/components/page-shell";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";

export default function UmrahDashboard() {
  const { data: seasons } = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const activeSeason = (seasons?.data || []).find((s: any) => s.status === "open");
  const seasonId = activeSeason?.id;
  const { data: dash, refetch, isLoading, isError } = useApiQuery<any>(
    ["umrah-dashboard", String(seasonId || "")],
    seasonId ? `/umrah/dashboard?seasonId=${seasonId}` : "/umrah/dashboard"
  );
  // §6.1 NUSK-aware overview — uses the Phase-4 endpoint that reads from
  // the new umrah_mutamers + umrah_nusk_invoices + umrah_violations tables.
  const { data: overview } = useApiQuery<{ totals: {
    totalMutamers: number; insideKingdom: number; overstays: number;
    absconders: number; totalCost: number; openViolations: number;
    openViolationsTotal: number; unlinkedSubAgents: number;
  } }>(
    ["umrah-overview", String(seasonId || "")],
    seasonId ? `/umrah/dashboard/overview?seasonId=${seasonId}` : "/umrah/dashboard/overview"
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
    <PageShell title="العمرة" breadcrumbs={[{ label: "العمرة" }, { label: "نظرة عامة" }]}>
      <UmrahTabsNav />
      <div className="flex items-center justify-between">
        <div>
          {activeSeason && <p className="text-sm text-muted-foreground mt-1">الموسم النشط: {activeSeason.title}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runDaily} className="gap-2"><Play className="h-4 w-4" />تحديث الحالات</Button>
          <Button variant="outline" onClick={runPenalties} className="gap-2"><Zap className="h-4 w-4" />تشغيل الغرامات</Button>
        </div>
      </div>

      {/* §6.1 — 8 KPI cards from the NUSK-aware overview endpoint */}
      {overview?.totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <NuskKpi color="blue" icon={Users} label="إجمالي المعتمرين (نسك)" value={overview.totals.totalMutamers} />
          <NuskKpi color="green" icon={Plane} label="داخل المملكة الآن" value={overview.totals.insideKingdom} />
          <NuskKpi color="orange" icon={AlertTriangle} label="متجاوزون للبرنامج" value={overview.totals.overstays} />
          <NuskKpi color="red" icon={ShieldAlert} label="متغيّبون (تم التبليغ)" value={overview.totals.absconders} />
          <NuskKpi color="gray" icon={Coins} label="إجمالي تكاليف نسك" value={formatCurrency(Number(overview.totals.totalCost))} />
          <NuskKpi color="red" icon={TrendingDown} label="غرامات مفتوحة" value={overview.totals.openViolations}
            extra={formatCurrency(Number(overview.totals.openViolationsTotal))} />
          <NuskKpi color="orange" icon={Link2} label="وكلاء غير مربوطين بعميل" value={overview.totals.unlinkedSubAgents} />
          <NuskKpi color="purple" icon={TrendingUp} label="الموسم النشط" value={activeSeason?.title ?? "—"} />
        </div>
      )}

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

      {/* skipped for brevity */}
      {(dash?.recentArrivals || []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">آخر الواصلين</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "fullName", header: "الاسم", render: (r) => <span className="font-medium">{r.fullName}</span> },
                { key: "passportNumber", header: "الجواز" },
                { key: "nationality", header: "الجنسية" },
                { key: "actualArrival", header: "تاريخ الوصول", render: (r) => formatDateAr(r.actualArrival) },
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
    </PageShell>
  );
}

function NuskKpi({ color, icon: Icon, label, value, extra }: {
  color: "blue" | "green" | "orange" | "red" | "gray" | "purple";
  icon: any; label: string; value: number | string; extra?: string;
}) {
  const bgClass: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    orange: "bg-orange-50 text-orange-600",
    red: "bg-red-50 text-red-600",
    gray: "bg-slate-50 text-slate-600",
    purple: "bg-purple-50 text-purple-600",
  };
  const [bg, text] = bgClass[color].split(" ");
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-3 flex items-center gap-2">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", bg)}>
          <Icon className={cn("w-5 h-5", text)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold truncate">
            {typeof value === "number" ? value.toLocaleString("ar-SA") : value}
          </p>
          <p className="text-xs text-gray-500 truncate">{label}</p>
          {extra && <p className="text-[10px] text-muted-foreground">{extra}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
