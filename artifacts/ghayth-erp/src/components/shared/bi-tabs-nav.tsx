import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Zap, Shield } from "lucide-react";

// UX Nav Governance (موجة التنقّل، شريحة 6) — أُزيلت 3 تبويبات كانت href لها
// مسارات redirect تؤول إلى /bi: «اللوحات» (/bi/dashboards)، «المؤشرات»
// (/bi/kpis)، «التقارير» (/bi/reports). تبقى المسارات مُركَّبة كـ redirect.
const TABS = [
  { href: "/bi", label: "نظرة عامة", icon: LayoutDashboard, match: ["/bi"], exact: true },
  { href: "/bi/operations", label: "العمليات", icon: Zap, match: ["/bi/operations"] },
  { href: "/bi/admin-reports", label: "تقارير الإدارة", icon: Shield, match: ["/bi/admin-reports"] },
];

export function BiTabsNav() {
  const [location] = useLocation();
  return (
    <div className="border-b mb-4 -mt-2 overflow-x-auto">
      <nav className="flex gap-1 min-w-max" dir="rtl">
        {TABS.map((tab) => {
          const isActive = tab.exact
            ? location === tab.href
            : tab.match.some((m) => location === m || location.startsWith(`${m}/`));
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} asChild>
              <a
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </a>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
