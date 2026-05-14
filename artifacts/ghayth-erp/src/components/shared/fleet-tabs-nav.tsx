import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Car, Users, Navigation, Wrench, Fuel, Shield, Bell,
  BarChart3, Calendar, AlertTriangle,
} from "lucide-react";

const TABS = [
  { href: "/fleet", label: "المركبات", icon: Car, match: ["/fleet"], exact: true },
  { href: "/fleet/drivers", label: "السائقون", icon: Users, match: ["/fleet/drivers"] },
  { href: "/fleet/trips", label: "الرحلات", icon: Navigation, match: ["/fleet/trips"] },
  { href: "/fleet/maintenance", label: "الصيانة", icon: Wrench, match: ["/fleet/maintenance"] },
  { href: "/fleet/fuel", label: "الوقود", icon: Fuel, match: ["/fleet/fuel"] },
  { href: "/fleet/insurance", label: "التأمين", icon: Shield, match: ["/fleet/insurance"] },
  { href: "/fleet/preventive-plans", label: "الصيانة الوقائية", icon: Calendar, match: ["/fleet/preventive-plans"] },
  { href: "/fleet/traffic-violations", label: "المخالفات", icon: AlertTriangle, match: ["/fleet/traffic-violations"] },
  { href: "/fleet/alerts", label: "التنبيهات", icon: Bell, match: ["/fleet/alerts"] },
  { href: "/fleet/reports", label: "التقارير", icon: BarChart3, match: ["/fleet/reports", "/fleet/tco"] },
];

export function FleetTabsNav() {
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
