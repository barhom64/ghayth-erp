import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Home, Building2, Users2, FileText, Banknote, Wrench, BarChart3,
} from "lucide-react";

const TABS = [
  { href: "/properties/dashboard", label: "نظرة عامة", icon: LayoutDashboard, match: ["/properties/dashboard"] },
  { href: "/properties", label: "الوحدات", icon: Home, match: ["/properties"], exact: true },
  { href: "/properties/buildings", label: "المباني", icon: Building2, match: ["/properties/buildings"] },
  { href: "/properties/tenants", label: "المستأجرون", icon: Users2, match: ["/properties/tenants"] },
  { href: "/properties/contracts", label: "العقود", icon: FileText, match: ["/properties/contracts"] },
  { href: "/properties/payments", label: "المدفوعات", icon: Banknote, match: ["/properties/payments"] },
  { href: "/properties/maintenance", label: "الصيانة", icon: Wrench, match: ["/properties/maintenance"] },
  { href: "/properties/occupancy-report", label: "التقارير", icon: BarChart3, match: ["/properties/occupancy-report", "/properties/deposits", "/properties/inspections"] },
];

/**
 * Unified tab navigation across all properties pages — gives the module
 * a single mother-page surface even though each tab is a separate route.
 */
export function PropertyTabsNav() {
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
            <Link key={tab.href} href={tab.href}>
              <a
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
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
