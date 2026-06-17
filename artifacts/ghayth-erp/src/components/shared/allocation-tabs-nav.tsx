import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useApiQuery } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Workflow, Package, BookOpen, ShieldAlert, ShieldCheck, BarChart3, Eye, Settings,
} from "lucide-react";

/**
 * AllocationTabsNav — shared sub-navigation for the line-level allocation
 * cluster. Every allocation-* page renders this strip immediately under
 * its PageShell so the operator can bounce between rules, the audit
 * trail, the coverage report, the override log, and the product catalog
 * in one click without going back to the sidebar.
 *
 * Also surfaces the live `finance.enforce_line_allocation` setting as a
 * coloured badge so the same flag visibility is present on every page
 * in the cluster — answering "هل النظام في وضع الإنتاج الآن؟" without
 * needing to navigate to settings-hub.
 */

const TABS = [
  {
    href: "/finance/settings",
    label: "الإعدادات",
    icon: Settings,
    match: ["/finance/settings"],
  },
  {
    href: "/finance/allocation-rules",
    label: "قواعد التوجيه",
    icon: Workflow,
    match: ["/finance/allocation-rules"],
  },
  {
    href: "/finance/product-catalog",
    label: "كتالوج المنتجات",
    icon: Package,
    match: ["/finance/product-catalog"],
  },
  {
    href: "/finance/allocation-coverage",
    label: "تغطية التخصيص",
    icon: BarChart3,
    match: ["/finance/allocation-coverage"],
  },
  {
    href: "/finance/allocation-results",
    label: "سجل التوجيه",
    icon: Eye,
    match: ["/finance/allocation-results"],
  },
  {
    href: "/finance/overrides-report",
    label: "التعديلات اليدوية",
    icon: BookOpen,
    match: ["/finance/overrides-report"],
  },
  {
    href: "/finance/allocation-override-log",
    label: "تجاوزات الإلزام",
    icon: ShieldAlert,
    match: ["/finance/allocation-override-log"],
  },
];

interface EnforceStatusResp {
  enforce: boolean;
  key: string;
}

export function AllocationTabsNav() {
  const [location] = useLocation();

  // Status badge — same banner on every allocation page so the
  // operator always knows whether the system is in production mode.
  // Endpoint added in migration 223 / PR #1291.
  const { data: enforceStatus } = useApiQuery<EnforceStatusResp>(
    ["finance-settings-enforce-line-allocation"],
    "/finance/settings/enforce-line-allocation",
  );
  const enforce = !!enforceStatus?.enforce;

  return (
    <div className="border-b mb-4 -mt-2">
      <div className="flex items-center justify-between gap-3 overflow-x-auto">
        <nav className="flex gap-1 min-w-max" dir="rtl">
          {TABS.map((tab) => {
            // Two-segment paths (e.g. "/finance/allocation-rules") match
            // exact OR any deeper path under them (e.g. /create, /:id/edit).
            const isActive = tab.match.some(
              (m) => location === m || location.startsWith(`${m}/`),
            );
            const Icon = tab.icon;
            return (
              <Link key={tab.href} href={tab.href} asChild>
                <a
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </a>
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0 ps-3 pe-1 pb-1">
          {enforce ? (
            <Badge variant="outline" className="text-[10px] gap-1 border-status-success-surface text-status-success-foreground">
              <ShieldCheck className="h-3 w-3" />
              الإلزام مُفعَّل
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] gap-1 border-status-warning-surface text-status-warning-foreground">
              <ShieldAlert className="h-3 w-3" />
              الإلزام معطّل
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
