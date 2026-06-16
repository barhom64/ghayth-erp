import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { AssistantHints } from "@/components/umrah/assistant-hints";
import { useApiQuery, apiFetch } from "@/lib/api";
import { formatUmrahDate, formatNumber } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Users, Plane, AlertTriangle, UserPlus, Play, Zap, TrendingUp, TrendingDown, Wallet, ShieldAlert, Upload, Sparkles, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PrintButton } from "@/components/shared/print-button";
import { UmrahFinanceHygieneCard } from "@/components/shared/umrah-finance-hygiene-card";
import { UmrahJourneyHealthCard } from "@/components/shared/umrah-journey-health-card";

export default function UmrahDashboard() {
  const { data: seasons, isLoading: seasonsLoading, isError: seasonsError } = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const activeSeason = (seasons?.data || []).find((s: any) => s.status === "open");
  const seasonId = activeSeason?.id;
  // Don't fire the dashboard query when no active season is found —
  // sending `seasonId=0` makes the backend respond with a 400 or a
  // bogus empty-shape that the rest of the page reads as "loading
  // forever" or "missing data". Passing path=null short-circuits the
  // fetch entirely; the no-active-season branch below renders the
  // empty-state CTA instead.
  const { data: dash, refetch, isLoading: dashLoading, isError: dashError } = useApiQuery<any>(
    ["umrah-dashboard", String(seasonId || "")],
    seasonId ? `/umrah/dashboard?seasonId=${seasonId}` : null,
  );
  const { toast } = useToast();
  const p = dash?.pilgrims || {};
  const pen = dash?.penalties || {};
  const fin = dash?.financials || {};
  const salesFin = fin.sales || {};
  const nuskFin = fin.nusk || {};
  const netPosition: number = Number(fin.net ?? 0);
  const isNetPositive = netPosition >= 0;
  const visa = dash?.visaExpiry || {};
  const visaExpired = Number(visa.expired ?? 0);
  const visaCritical = Number(visa.critical ?? 0);
  const visaWarning = Number(visa.warning ?? 0);
  const visaTotal = visaExpired + visaCritical + visaWarning;

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

  if (seasonsLoading || dashLoading) return <LoadingSpinner />;
  if (seasonsError || dashError) return <ErrorState />;
  if (!activeSeason) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertTriangle className="w-12 h-12 text-orange-400 mb-4" />
      <h2 className="text-xl font-semibold mb-2">لا يوجد موسم نشط</h2>
      <p className="text-muted-foreground">يرجى إنشاء موسم عمرة وتفعيله من صفحة المواسم</p>
    </div>
  );

  return (
    <PageShell
      title="لوحة تشغيل العمرة"
      subtitle={activeSeason ? `الموسم النشط: ${activeSeason.title}` : undefined}
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "لوحة التشغيل" }]}
      actions={
        <div className="flex gap-2">
          <PrintButton
            entityType="report_umrah_dashboard"
            entityId="list"
            size="icon"
            label="طباعة لوحة تشغيل العمرة"
            payload={() => ({
              entity: {
                title: activeSeason ? `لوحة تشغيل العمرة — ${activeSeason.title}` : "لوحة تشغيل العمرة",
                activeSeason: activeSeason?.title ?? "—",
                totalPilgrims: p.total ?? 0,
                inSaudi: p.inSaudi ?? 0,
                returned: p.returned ?? 0,
                overstayed: p.overstayed ?? 0,
                penaltiesOpen: pen.open ?? 0,
                penaltiesTotalAmount: pen.totalAmount ?? 0,
                salesInvoiced: salesFin.totalInvoiced ?? 0,
                salesPaid: salesFin.totalPaid ?? 0,
                nuskTotal: nuskFin.total ?? 0,
                netPosition,
                visaExpired,
                visaCritical,
                visaWarning,
              },
              items: [],
            })}
          />
          <GuardedButton perm="umrah:create" variant="outline" onClick={runDaily} className="gap-2"><Play className="h-4 w-4" />تحديث الحالات</GuardedButton>
          <GuardedButton perm="umrah:create" variant="outline" onClick={runPenalties} className="gap-2"><Zap className="h-4 w-4" />تشغيل الغرامات</GuardedButton>
        </div>
      }
    >
      <UmrahTabsNav />

      {/* §9 of #1870 — Assistant Hints. Reads system state on mount
          and surfaces ranked suggestions ("12 pilgrim orphans need
          recovery", "3 invoices missing AP JE", ...) above the
          dashboard. Renders nothing when zero suggestions, so the
          quick-actions row sits at the top on a clean tenant. */}
      <AssistantHints />

      {/* §6 Finance Hygiene — كرت "نظافة المالية". إذا كان الحقل = 0
          البطاقة خضراء، وإلا توضح للمدير كم بند يحتاج اعتماد/ترحيل
          محاسبي + المبلغ المتأثر. روابط مباشرة للتقارير. */}
      <UmrahFinanceHygieneCard />

      {/* U-19-P7 — Journey Health. Surfaces the 4 stuck-item buckets
          from /umrah/reports/recovery-hub so the operator sees them
          immediately. Each tile links to the page where the operator
          actually fixes the problem. Hides itself entirely when all 4
          buckets are zero (clean tenant). */}
      <UmrahJourneyHealthCard />

      {/* Quick Actions — أهم 4 إجراءات يومية للعامل، ظاهرة مباشرة
          بدون ما يضطر يفتح tab. كانت كل وحدة مدفونة في مكان مختلف:
          - إضافة معتمر: /umrah/pilgrims/create (مخفي)
          - استيراد ملف: tab "الاستيراد"
          - إنشاء فاتورة: tab "معالج المبيعات"
          - تقرير امتثال: tab dropdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="umrah-quick-actions">
        <Link href="/umrah/pilgrims/create" data-testid="quick-action-pilgrim-create">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-status-info-surface">
                <UserPlus className="w-5 h-5 text-status-info-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">إضافة معتمر</p>
                <p className="text-xs text-muted-foreground">تسجيل يدوي جديد</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/umrah/import" data-testid="quick-action-import">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-status-success-surface">
                <Upload className="w-5 h-5 text-status-success-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">استيراد ملف</p>
                <p className="text-xs text-muted-foreground">معالج Excel</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/umrah/sales-wizard" data-testid="quick-action-invoice">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-status-warning-surface">
                <Sparkles className="w-5 h-5 text-status-warning-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">إنشاء فاتورة</p>
                <p className="text-xs text-muted-foreground">معالج المبيعات</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/umrah/compliance" data-testid="quick-action-compliance">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-status-error-surface">
                <FileText className="w-5 h-5 text-status-error-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">لوحة الامتثال</p>
                <p className="text-xs text-muted-foreground">المخاطر الحالية</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-status-info-surface">
              <Users className="w-6 h-6 text-status-info-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{p.total || 0}</p>
              <p className="text-xs text-muted-foreground">إجمالي المعتمرين</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-status-success-surface">
              <Plane className="w-6 h-6 text-status-success-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{Number(p.arrived || 0) + Number(p.active || 0)}</p>
              <p className="text-xs text-muted-foreground">داخل المملكة</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm border-status-error-surface">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-status-error-surface">
              <AlertTriangle className="w-6 h-6 text-status-error-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-status-error-foreground">{p.overstayed || 0}</p>
              <p className="text-xs text-muted-foreground">متأخرين</p>
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
              <p className="text-xs text-muted-foreground">غادروا</p>
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
              <p className="text-xs text-muted-foreground">بدون وكيل</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial position at a glance — receivable from sub-agents vs.
          payable to NUSK + the net umrah position. Lets the operator see
          the financial story without leaving the dashboard. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-status-success-surface">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm inline-flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-status-success-foreground" />
              مستحق لنا (مبيعات)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-status-success-foreground">{formatCurrency(Number(salesFin.outstandingTotal ?? 0))}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{formatNumber(Number(salesFin.invoiceCount ?? 0))} فاتورة</span>
              {Number(salesFin.overdueTotal ?? 0) > 0 && (
                <Badge variant="destructive" className="text-[10px]">متأخر {formatCurrency(Number(salesFin.overdueTotal))}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="border-status-warning-surface">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm inline-flex items-center gap-2 text-muted-foreground">
              <TrendingDown className="h-4 w-4 text-status-warning-foreground" />
              مستحق علينا (نسك)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-status-warning-foreground">{formatCurrency(Number(nuskFin.outstandingTotal ?? 0))}</p>
            <p className="text-xs text-muted-foreground mt-1">{formatNumber(Number(nuskFin.invoiceCount ?? 0))} فاتورة نسك</p>
          </CardContent>
        </Card>
        <Card className={isNetPositive ? "border-status-info-surface" : "border-status-error-surface"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm inline-flex items-center gap-2 text-muted-foreground">
              <Wallet className="h-4 w-4 text-status-info-foreground" />
              صافي المركز
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${isNetPositive ? "text-status-info-foreground" : "text-status-error-foreground"}`}>
              {formatCurrency(Math.abs(netPosition))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isNetPositive ? "صافي مستحق لنا" : "صافي مستحق علينا"} — مستحق المبيعات − مستحق نسك
            </p>
          </CardContent>
        </Card>
      </div>

      {visaTotal > 0 && (
        <Card className={visaExpired > 0 ? "border-status-error-surface" : visaCritical > 0 ? "border-status-warning-surface" : "border-status-info-surface"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm inline-flex items-center gap-2">
              <ShieldAlert className={`h-4 w-4 ${visaExpired > 0 ? "text-status-error-foreground" : visaCritical > 0 ? "text-status-warning-foreground" : "text-status-info-foreground"}`} />
              تنبيهات انتهاء التأشيرات
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xl font-bold text-status-error-foreground">{formatNumber(visaExpired)}</p>
              <p className="text-xs text-muted-foreground">منتهية الصلاحية</p>
            </div>
            <div>
              <p className="text-xl font-bold text-status-warning-foreground">{formatNumber(visaCritical)}</p>
              <p className="text-xs text-muted-foreground">حرج (أقل من 7 أيام)</p>
            </div>
            <div>
              <p className="text-xl font-bold text-status-info-foreground">{formatNumber(visaWarning)}</p>
              <p className="text-xs text-muted-foreground">تحذير (7-30 يوماً)</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">الغرامات</CardTitle></CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <div><span className="text-2xl font-bold text-status-error-foreground">{formatNumber(Number(pen.totalAmount || 0))}</span> <span className="text-sm">ريال</span></div>
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
                { key: "actualArrival", header: "تاريخ الوصول", render: (r) => formatUmrahDate(r.actualArrival) },
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
