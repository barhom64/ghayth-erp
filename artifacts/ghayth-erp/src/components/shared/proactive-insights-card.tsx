import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bell, AlertTriangle, Info, FileWarning, IdCard, ListChecks,
  CalendarClock, Banknote, Receipt, ArrowUpRight,
} from "lucide-react";

/**
 * IGOC-006 — Role-Adaptive Proactive Insights surface.
 *
 * Reads GET /me/proactive-insights and renders one card per category.
 * The endpoint shapes the response by ACTIVE context — switching the
 * role-picker re-narrows scope.role server-side and this widget
 * automatically shows the new surface on the next refetch (the React
 * Query key includes selectedRoleKey so the cache invalidates).
 *
 * The widget is intentionally dumb about role logic: it trusts the
 * server's "show me what matters" output and never tries to second-
 * guess what an employee vs a manager should see.
 */

type Severity = "info" | "warning" | "critical";

interface InsightItem {
  id: number | string;
  label: string;
  meta?: Record<string, unknown>;
}

interface Insight {
  category: string;
  severity: Severity;
  title: string;
  body: string;
  count: number;
  deepLink: string;
  items: InsightItem[];
}

interface InsightsResponse {
  insights: Insight[];
  totalCount: number;
  generatedAt: string;
  context: {
    role: string;
    companyId: number;
    branchId: number;
    activeAssignmentId: number;
    selectedRoleKey: string | null;
    resolvedScope: string | null;
  };
}

const SEVERITY_STYLE: Record<Severity, { badge: string; ring: string; icon: string }> = {
  critical: {
    badge: "bg-red-100 text-red-700 border-red-300",
    ring: "border-r-2 border-red-500",
    icon: "text-red-600",
  },
  warning: {
    badge: "bg-amber-100 text-amber-700 border-amber-300",
    ring: "border-r-2 border-amber-500",
    icon: "text-amber-600",
  },
  info: {
    badge: "bg-sky-100 text-sky-700 border-sky-300",
    ring: "border-r-2 border-sky-500",
    icon: "text-sky-600",
  },
};

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  my_documents_expiring: FileWarning,
  my_official_docs_expiring: IdCard,
  my_pending_requests: ListChecks,
  team_pending_leaves: CalendarClock,
  company_iqama_expiring: IdCard,
  company_unposted_journals: Banknote,
  company_overdue_invoices: Receipt,
  company_due_obligations: CalendarClock,
  critical_notifications: Bell,
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "عاجل",
  warning: "هام",
  info: "للعلم",
};

export function ProactiveInsightsCard() {
  const { selectedRole } = useAppContext();
  // selectedRole.roleKey is part of the cache key so switching the
  // header role-picker invalidates the cached payload and the surface
  // refetches under the NEW scope.role.
  const roleKey = selectedRole?.roleKey ?? "default";
  const { data, isLoading } = useApiQuery<InsightsResponse>(
    ["proactive-insights", roleKey],
    "/me/proactive-insights",
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ما يحتاج انتباهك</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">جاري التحميل…</p>
        </CardContent>
      </Card>
    );
  }

  const insights = data?.insights ?? [];

  if (insights.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4 text-sky-500" />
            ما يحتاج انتباهك
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-3">
            لا يوجد شيء عاجل الآن — كل شيء على ما يرام.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4 text-sky-500" />
          ما يحتاج انتباهك
          <Badge variant="outline" className="ms-auto">{data?.totalCount ?? 0}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          مرتبة حسب الأولوية — يظهر العاجل أولًا
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.map((insight) => {
          const style = SEVERITY_STYLE[insight.severity];
          const Icon = CATEGORY_ICON[insight.category] ?? Info;
          return (
            <div
              key={insight.category}
              className={`rounded-lg p-3 bg-card ${style.ring}`}
              data-category={insight.category}
              data-severity={insight.severity}
            >
              <div className="flex items-start gap-2">
                <Icon className={`w-4 h-4 mt-1 ${style.icon}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-semibold truncate">{insight.title}</h4>
                    <Badge variant="outline" className={`text-xs ${style.badge}`}>
                      {SEVERITY_LABEL[insight.severity]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{insight.body}</p>
                  {insight.items.length > 0 && (
                    <ul className="space-y-1 mb-2">
                      {insight.items.slice(0, 3).map((item) => (
                        <li
                          key={`${insight.category}-${item.id}`}
                          className="text-xs text-foreground/80 truncate"
                        >
                          • {item.label}
                        </li>
                      ))}
                      {insight.items.length > 3 && (
                        <li className="text-xs text-muted-foreground">
                          + {insight.items.length - 3} عنصر آخر
                        </li>
                      )}
                    </ul>
                  )}
                  <Button asChild variant="ghost" size="sm" className="h-6 px-2 gap-1"><Link href={insight.deepLink}>
                      <span className="text-xs">افتح</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </Link></Button>
                </div>
              </div>
            </div>
          );
        })}
        {data?.context.selectedRoleKey && (
          <p className="text-[10px] text-muted-foreground text-center pt-1">
            السياق النشط: دور={data.context.selectedRoleKey} • شركة={data.context.companyId}
            {data.context.resolvedScope ? ` • نطاق=${data.context.resolvedScope}` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
