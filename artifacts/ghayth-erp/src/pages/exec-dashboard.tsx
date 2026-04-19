import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Shield, DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  Clock, FileText, Truck, Users, Building2, BarChart3,
} from "lucide-react";

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-700 border-green-300",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
  high: "bg-orange-100 text-orange-700 border-orange-300",
  critical: "bg-red-100 text-red-700 border-red-300",
};

const riskLabels: Record<string, string> = {
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
  critical: "حرج",
};

function AgingBar({ label, amount, total }: { label: string; amount: number; total: number }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 text-gray-500 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2.5">
        <div
          className="bg-blue-500 rounded-full h-2.5 transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="w-28 text-end font-medium">{formatCurrency(amount)}</span>
    </div>
  );
}

export default function ExecDashboard() {
  const { data, isLoading, isError } = useApiQuery<any>(
    ["exec-dashboard"],
    "/exec-dashboard/overview"
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const d = data || {};

  return (
    <PageShell
      title="لوحة القيادة التنفيذية"
      subtitle="نظرة شاملة على المخاطر والمؤشرات الحيوية"
      breadcrumbs={[{ label: "لوحة القيادة التنفيذية" }]}
    >
      {/* Risk Score */}
      <Card className={cn("border-2", riskColors[d.riskLevel] || riskColors.low)}>
        <CardContent className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center", riskColors[d.riskLevel])}>
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm text-gray-500">مؤشر المخاطر العام</p>
              <p className="text-4xl font-bold">{d.riskScore ?? 0}</p>
            </div>
          </div>
          <Badge className={cn("text-lg px-4 py-1", riskColors[d.riskLevel])}>
            {riskLabels[d.riskLevel] || "منخفض"}
          </Badge>
        </CardContent>
      </Card>

      {/* MTD Financials */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">إيرادات الشهر</p>
              <p className="text-xl font-bold">{formatCurrency(d.mtd?.revenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">مصروفات الشهر</p>
              <p className="text-xl font-bold">{formatCurrency(d.mtd?.expense)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">صافي الربح</p>
              <p className={cn("text-xl font-bold", (d.mtd?.net ?? 0) >= 0 ? "text-green-600" : "text-red-600")}>
                {formatCurrency(d.mtd?.net)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cash Position */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-500" />
            الوضع النقدي
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-blue-600 mb-2">{formatCurrency(d.cashPosition?.total)}</p>
          {d.cashPosition?.accounts?.length > 0 && (
            <div className="space-y-1 text-sm text-gray-600">
              {d.cashPosition.accounts.slice(0, 5).map((a: any) => (
                <div key={a.code} className="flex justify-between">
                  <span>{a.name || a.code}</span>
                  <span className="font-medium">{formatCurrency(Number(a.currentBalance))}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* AR Aging */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-orange-500" />
              أعمار الذمم المدينة (AR)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold text-orange-600 mb-3">{formatCurrency(d.ar?.total)}</p>
            <AgingBar label="جاري" amount={d.ar?.current ?? 0} total={d.ar?.total ?? 1} />
            <AgingBar label="1-30 يوم" amount={d.ar?.d1_30 ?? 0} total={d.ar?.total ?? 1} />
            <AgingBar label="31-60 يوم" amount={d.ar?.d31_60 ?? 0} total={d.ar?.total ?? 1} />
            <AgingBar label="61-90 يوم" amount={d.ar?.d61_90 ?? 0} total={d.ar?.total ?? 1} />
            <AgingBar label="+90 يوم" amount={d.ar?.d90_plus ?? 0} total={d.ar?.total ?? 1} />
          </CardContent>
        </Card>

        {/* Risk Signals */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              إشارات المخاطر
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "التزامات متأخرة", value: d.riskSignals?.criticalObligations, icon: AlertTriangle, color: "text-red-600" },
              { label: "انتهاكات SLA", value: (d.slaBreaches?.support ?? 0) + (d.slaBreaches?.workflow ?? 0), icon: Clock, color: "text-orange-600" },
              { label: "سير عمل متعطل", value: d.stuckWorkflows, icon: Clock, color: "text-amber-600" },
              { label: "تجاوز ميزانية", value: d.budgetOverages?.over100 ?? 0, icon: TrendingUp, color: "text-red-600" },
              { label: "عقود تنتهي قريباً", value: d.expiringContracts, icon: FileText, color: "text-purple-600" },
              { label: "صيانة أسطول قادمة", value: d.fleetMaintenance, icon: Truck, color: "text-blue-600" },
              { label: "وثائق موظفين تنتهي", value: d.hrDocExpiries, icon: Users, color: "text-teal-600" },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("w-4 h-4", s.color)} />
                    <span className="text-sm">{s.label}</span>
                  </div>
                  <Badge variant={s.value > 0 ? "destructive" : "secondary"} className="font-bold">
                    {s.value ?? 0}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* AP + Obligations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-500" />
              أوامر الشراء المفتوحة (AP)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-purple-600">{formatCurrency(d.ap?.total)}</p>
            <p className="text-sm text-gray-500">{d.ap?.count ?? 0} أمر شراء مفتوح</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              الالتزامات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xl font-bold text-amber-600">{d.obligations?.pending ?? 0}</p>
                <p className="text-xs text-gray-500">معلقة</p>
              </div>
              <div>
                <p className="text-xl font-bold text-red-600">{d.obligations?.breached ?? 0}</p>
                <p className="text-xs text-gray-500">متأخرة</p>
              </div>
              <div>
                <p className="text-xl font-bold text-orange-600">{d.obligations?.dueIn24h ?? 0}</p>
                <p className="text-xs text-gray-500">خلال 24 ساعة</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Overages */}
      {(d.budgetOverages?.top5?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-red-500" />
              تجاوزات الميزانية (أعلى 5)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {d.budgetOverages.top5.map((b: any) => (
                <div key={b.accountCode} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{b.accountName || b.accountCode}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500">{formatCurrency(b.actual)} / {formatCurrency(b.budget)}</span>
                    <Badge variant={b.pct > 100 ? "destructive" : "secondary"}>
                      {b.pct.toFixed(0)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
