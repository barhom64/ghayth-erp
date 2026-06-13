import { Link } from "wouter";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { useApiQuery } from "@/lib/api";
import { STATUSES } from "@/lib/constants";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Shield, DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  Clock, FileText, Truck, Users, Building2, BarChart3, FileX, BadgeAlert,
} from "lucide-react";

const riskColors: Record<string, string> = {
  low: "bg-status-success-surface text-status-success-foreground border-status-success-surface",
  medium: "bg-status-warning-surface text-status-warning-foreground border-yellow-300",
  high: "bg-orange-100 text-orange-700 border-orange-300",
  critical: "bg-status-error-surface text-status-error-foreground border-status-error-surface",
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
      <span className="w-20 text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 bg-surface-subtle rounded-full h-2.5">
        <div
          className="bg-status-info-surface0 rounded-full h-2.5 transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="w-28 text-end font-medium">{formatCurrency(amount)}</span>
    </div>
  );
}

interface OverdueInvoiceRow {
  id: number;
  invoiceNumber: string;
  dueDate: string;
  total: number;
  paidAmount: number;
  outstanding: number;
  daysPastDue: number;
  dunningStage: number;
  clientName: string | null;
}

interface CriticalObligationRow {
  id: number;
  entityType: string;
  entityId: number;
  description: string | null;
  dueDate: string;
  daysUntilDue: number;
  status: string;
  amount: number | null;
}

interface UnifiedPnl {
  period: { from: string; to: string };
  totals: { revenue: number; expense: number; net: number };
  bySource: Array<{ sourceType: string; revenue: number; expense: number; net: number }>;
  byAccount: Array<{ accountCode: string; name: string; type: string; total: number }>;
}

export default function ExecDashboard() {
  const { data, isLoading, isError } = useApiQuery<any>(
    ["exec-dashboard"],
    "/exec-dashboard/overview"
  );

  // Drill-down endpoints — only fetched once the overview lands (they
  // share the same role gate so failing them separately is fine).
  const { data: overdueResp } = useApiQuery<{ data: OverdueInvoiceRow[] }>(
    ["exec-dashboard-overdue"],
    "/exec-dashboard/overdue-invoices",
  );
  const { data: obligResp } = useApiQuery<{ data: CriticalObligationRow[] }>(
    ["exec-dashboard-obligations"],
    "/exec-dashboard/critical-obligations",
  );
  // Consolidated P&L for the current month-to-date (backend defaults the
  // period to Riyadh MTD when no range is passed).
  const { data: pnlResp } = useApiQuery<UnifiedPnl>(
    ["exec-dashboard-unified-pnl"],
    "/exec-dashboard/unified-pnl",
  );
  const overdueInvoices = overdueResp?.data ?? [];
  const criticalObligations = obligResp?.data ?? [];
  const pnl = pnlResp;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

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
              <p className="text-sm text-muted-foreground">مؤشر المخاطر العام</p>
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
            <div className="w-12 h-12 rounded-xl bg-status-success-surface flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-status-success-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إيرادات الشهر</p>
              <p className="text-xl font-bold">{formatCurrency(d.mtd?.revenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-status-error-surface flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-status-error-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">مصروفات الشهر</p>
              <p className="text-xl font-bold">{formatCurrency(d.mtd?.expense)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-status-info-surface flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-status-info-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">صافي الربح</p>
              <p className={cn("text-xl font-bold", (d.mtd?.net ?? 0) >= 0 ? "text-status-success-foreground" : "text-status-error-foreground")}>
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
            <DollarSign className="w-5 h-5 text-status-info" />
            الوضع النقدي
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-status-info-foreground mb-2">{formatCurrency(d.cashPosition?.total)}</p>
          {d.cashPosition?.accounts?.length > 0 && (
            <div className="space-y-1 text-sm text-muted-foreground">
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

      {/* Consolidated P&L — current month-to-date */}
      {pnl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-status-success" />
              الأرباح والخسائر — الشهر حتى تاريخه
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">الإيرادات</p>
                <p className="text-2xl font-bold text-status-success-foreground">{formatCurrency(pnl.totals?.revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">المصروفات</p>
                <p className="text-2xl font-bold text-status-error-foreground">{formatCurrency(pnl.totals?.expense)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">صافي الربح</p>
                <p className={cn("text-2xl font-bold", (pnl.totals?.net ?? 0) >= 0 ? "text-status-success-foreground" : "text-status-error-foreground")}>
                  {formatCurrency(pnl.totals?.net)}
                </p>
              </div>
            </div>
            {pnl.byAccount?.length > 0 && (
              <div className="space-y-1 text-sm text-muted-foreground border-t border-muted/40 pt-3">
                {pnl.byAccount.slice(0, 5).map((a) => (
                  <div key={a.accountCode} className="flex justify-between">
                    <span>{a.name || a.accountCode}</span>
                    <span className={cn("font-medium", a.type === "revenue" ? "text-status-success-foreground" : "text-status-error-foreground")}>
                      {formatCurrency(a.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
              <AlertTriangle className="w-5 h-5 text-status-error" />
              إشارات المخاطر
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "التزامات متأخرة", value: d.riskSignals?.criticalObligations, icon: AlertTriangle, color: "text-status-error-foreground" },
              { label: "انتهاكات SLA", value: (d.slaBreaches?.support ?? 0) + (d.slaBreaches?.workflow ?? 0), icon: Clock, color: "text-orange-600" },
              { label: "سير عمل متعطل", value: d.stuckWorkflows, icon: Clock, color: "text-status-warning-foreground" },
              { label: "تجاوز ميزانية", value: d.budgetOverages?.over100 ?? 0, icon: TrendingUp, color: "text-status-error-foreground" },
              { label: "عقود تنتهي قريباً", value: d.expiringContracts, icon: FileText, color: "text-purple-600" },
              { label: "صيانة أسطول قادمة", value: d.fleetMaintenance, icon: Truck, color: "text-status-info-foreground" },
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
            <p className="text-sm text-muted-foreground">{d.ap?.count ?? 0} أمر شراء مفتوح</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-status-warning" />
              الالتزامات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xl font-bold text-status-warning-foreground">{d.obligations?.pending ?? 0}</p>
                <p className="text-xs text-muted-foreground">معلقة</p>
              </div>
              <div>
                <p className="text-xl font-bold text-status-error-foreground">{d.obligations?.breached ?? 0}</p>
                <p className="text-xs text-muted-foreground">متأخرة</p>
              </div>
              <div>
                <p className="text-xl font-bold text-orange-600">{d.obligations?.dueIn24h ?? 0}</p>
                <p className="text-xs text-muted-foreground">خلال 24 ساعة</p>
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
              <BarChart3 className="w-5 h-5 text-status-error" />
              تجاوزات الميزانية (أعلى 5)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {d.budgetOverages.top5.map((b: any) => (
                <div key={b.accountCode} className="flex items-center justify-between text-sm">
                  <span className="text-status-neutral-foreground">{b.accountName || b.accountCode}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{formatCurrency(b.actual)} / {formatCurrency(b.budget)}</span>
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

      {/* Drill-down: overdue invoices */}
      {overdueInvoices.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileX className="w-5 h-5 text-status-error-foreground" />
              فواتير متأخرة ({overdueInvoices.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "invoiceNumber", header: "الرقم", render: (r) => (
                  <Link href={`/finance/invoices/${r.id}`}>
                    <span className="font-mono text-xs text-status-info-foreground hover:underline cursor-pointer">{r.invoiceNumber}</span>
                  </Link>
                )},
                { key: "clientName", header: "العميل", render: (r) => <span className="text-xs">{r.clientName || "—"}</span> },
                { key: "outstanding", header: "المتبقي", render: (r) => (
                  <span className="font-bold text-status-error-foreground">{formatCurrency(Number(r.outstanding))}</span>
                )},
                { key: "daysPastDue", header: "أيام التأخر", render: (r) => (
                  <Badge variant={r.daysPastDue > 60 ? "destructive" : "secondary"} className="text-xs">
                    {r.daysPastDue} يوم
                  </Badge>
                )},
                { key: "dunningStage", header: "مرحلة المطالبة", render: (r) => (
                  <span className="font-mono text-xs">{r.dunningStage > 0 ? `#${r.dunningStage}` : "—"}</span>
                )},
                { key: "dueDate", header: "تاريخ الاستحقاق", render: (r) => (
                  <span className="text-xs text-muted-foreground">{formatDateAr(r.dueDate)}</span>
                )},
              ] as DataTableColumn<OverdueInvoiceRow>[]}
              data={overdueInvoices}
              noToolbar
              pageSize={10}
            />
          </CardContent>
        </Card>
      )}

      {/* Drill-down: critical obligations */}
      {criticalObligations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BadgeAlert className="w-5 h-5 text-status-warning-foreground" />
              التزامات حرجة ({criticalObligations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "description", header: "الوصف", render: (r) => <span className="text-xs">{r.description || "—"}</span> },
                { key: "entityType", header: "النوع", render: (r) => <Badge variant="outline" className="text-xs">{r.entityType}</Badge> },
                { key: "amount", header: "المبلغ", render: (r) => (
                  r.amount ? <span className="font-mono text-xs">{formatCurrency(Number(r.amount))}</span> : <span className="text-muted-foreground">—</span>
                )},
                { key: "daysUntilDue", header: "متبقي", render: (r) => (
                  <Badge variant={r.daysUntilDue < 7 ? "destructive" : "secondary"} className="text-xs">
                    {r.daysUntilDue < 0 ? `متأخر ${Math.abs(r.daysUntilDue)} يوم` : `${r.daysUntilDue} يوم`}
                  </Badge>
                )},
                { key: "dueDate", header: "الاستحقاق", render: (r) => (
                  <span className="text-xs text-muted-foreground">{formatDateAr(r.dueDate)}</span>
                )},
                { key: "status", header: "الحالة", render: (r) => <Badge variant="outline" className="text-xs">{STATUSES[r.status] ?? r.status}</Badge> },
              ] as DataTableColumn<CriticalObligationRow>[]}
              data={criticalObligations}
              noToolbar
              pageSize={10}
            />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
