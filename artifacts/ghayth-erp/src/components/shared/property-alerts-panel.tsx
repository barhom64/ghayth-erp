/**
 * PropertyAlertsPanel — بانر تنبيهات العقارات.
 *
 * يعرض تنبيهات تلقائية مبنية على البيانات الموجودة:
 * - عقود تنتهي خلال 30 يوم
 * - دفعات متأخرة
 * - طلبات صيانة معلقة بأولوية عالية
 *
 * لا يستدعي endpoint مستقلاً — يستقبل البيانات كـ props من الصفحة
 * الأم التي تملكها أصلاً.
 */
import { AlertTriangle, Clock, Wrench, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";

export interface PropertyAlert {
  type: "contract_expiry" | "overdue_payment" | "maintenance_pending" | "no_contract";
  severity: "info" | "warning" | "critical";
  title: string;
  detail?: string;
  dueDate?: string;
}

interface PropertyAlertsPanelProps {
  alerts: PropertyAlert[];
  className?: string;
}

const SEVERITY_STYLE = {
  info: "bg-status-info-surface border-status-info-surface text-status-info-foreground",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  critical: "bg-status-error-surface border-status-error-surface text-status-error-foreground",
};

const SEVERITY_ICON = {
  info: Clock,
  warning: AlertTriangle,
  critical: XCircle,
};

export function PropertyAlertsPanel({ alerts, className }: PropertyAlertsPanelProps) {
  const [expanded, setExpanded] = useState(true);
  if (alerts.length === 0) return null;

  const criticalCount = alerts.filter(a => a.severity === "critical").length;
  const warningCount = alerts.filter(a => a.severity === "warning").length;

  return (
    <div className={cn("rounded-lg border shadow-sm overflow-hidden", className)}>
      <button
        onClick={() => setExpanded(v => !v)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold",
          criticalCount > 0
            ? "bg-status-error-surface text-status-error-foreground"
            : "bg-amber-50 text-amber-800"
        )}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span>
            تنبيهات تتطلب اهتمامك
            {criticalCount > 0 && (
              <span className="mr-1.5 text-xs bg-status-error-foreground/10 rounded px-1.5 py-0.5">{criticalCount} عاجل</span>
            )}
            {warningCount > 0 && (
              <span className="mr-1.5 text-xs bg-amber-200 rounded px-1.5 py-0.5">{warningCount} تحذير</span>
            )}
          </span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {expanded && (
        <div className="divide-y divide-border/50 bg-white">
          {alerts.map((alert, idx) => {
            const Icon = SEVERITY_ICON[alert.severity];
            return (
              <div key={idx} className={cn("flex items-start gap-3 px-4 py-2.5 text-sm", SEVERITY_STYLE[alert.severity])}>
                <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{alert.title}</p>
                  {(alert.detail || alert.dueDate) && (
                    <p className="text-xs opacity-80 mt-0.5">
                      {alert.detail}
                      {alert.dueDate && ` — ${formatDateAr(alert.dueDate)}`}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Helper to build alerts from unit/contract data ─────────── */

export function buildUnitAlerts(opts: {
  unit: any;
  contracts: any[];
  payments: any[];
  maintenance: any[];
}): PropertyAlert[] {
  const alerts: PropertyAlert[] = [];
  const now = new Date();
  const in30 = new Date(Date.now() + 30 * 86400000);
  const in7 = new Date(Date.now() + 7 * 86400000);

  const activeContract = opts.contracts.find((c: any) => c.status === "active");

  if (!activeContract && opts.unit?.status === "available") {
    alerts.push({ type: "no_contract", severity: "info", title: "الوحدة شاغرة — لا يوجد عقد ساري" });
  }

  if (activeContract) {
    const end = new Date(activeContract.endDate);
    if (end <= in7) {
      alerts.push({
        type: "contract_expiry",
        severity: "critical",
        title: `عقد ${activeContract.tenantName} ينتهي قريباً جداً`,
        dueDate: activeContract.endDate,
      });
    } else if (end <= in30) {
      alerts.push({
        type: "contract_expiry",
        severity: "warning",
        title: `عقد ${activeContract.tenantName} ينتهي خلال 30 يوم`,
        dueDate: activeContract.endDate,
      });
    }
  }

  const overduePayments = opts.payments.filter(
    (p: any) => p.status !== "paid" && new Date(p.dueDate) < now
  );
  if (overduePayments.length > 0) {
    const totalOverdue = overduePayments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    alerts.push({
      type: "overdue_payment",
      severity: "critical",
      title: `${overduePayments.length} دفعة متأخرة`,
      detail: `إجمالي المتأخرات: ${totalOverdue.toLocaleString("ar-SA")} ريال`,
    });
  }

  const urgentMaint = opts.maintenance.filter(
    (m: any) => ["pending", "approved", "in_progress"].includes(m.status) && m.priority === "urgent"
  );
  if (urgentMaint.length > 0) {
    alerts.push({
      type: "maintenance_pending",
      severity: "critical",
      title: `${urgentMaint.length} طلب صيانة عاجل`,
    });
  }

  const highMaint = opts.maintenance.filter(
    (m: any) => ["pending", "approved"].includes(m.status) && m.priority === "high"
  );
  if (highMaint.length > 0) {
    alerts.push({
      type: "maintenance_pending",
      severity: "warning",
      title: `${highMaint.length} طلب صيانة بأولوية عالية`,
    });
  }

  return alerts;
}

export function buildContractAlerts(opts: {
  contract: any;
  schedule: any[];
  maintRequests: any[];
}): PropertyAlert[] {
  const alerts: PropertyAlert[] = [];
  const now = new Date();
  const in30 = new Date(Date.now() + 30 * 86400000);
  const in7 = new Date(Date.now() + 7 * 86400000);

  if (opts.contract?.status === "active") {
    const end = new Date(opts.contract.endDate);
    if (end <= in7) {
      alerts.push({ type: "contract_expiry", severity: "critical", title: "العقد ينتهي خلال أقل من 7 أيام", dueDate: opts.contract.endDate });
    } else if (end <= in30) {
      alerts.push({ type: "contract_expiry", severity: "warning", title: "العقد ينتهي خلال 30 يوم", dueDate: opts.contract.endDate });
    }
  }

  const overduePayments = opts.schedule.filter(
    (p: any) => p.status !== "paid" && new Date(p.dueDate) < now
  );
  if (overduePayments.length > 0) {
    const total = overduePayments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    alerts.push({
      type: "overdue_payment",
      severity: "critical",
      title: `${overduePayments.length} دفعة متأخرة`,
      detail: `إجمالي: ${total.toLocaleString("ar-SA")} ريال`,
    });
  }

  const urgentMaint = opts.maintRequests.filter(
    (m: any) => ["pending", "approved", "in_progress"].includes(m.status) && m.priority === "urgent"
  );
  if (urgentMaint.length > 0) {
    alerts.push({ type: "maintenance_pending", severity: "critical", title: `${urgentMaint.length} طلب صيانة عاجل` });
  }

  return alerts;
}
