import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Users, Clock, Calendar, AlertTriangle, GraduationCap, Target,
  DollarSign, UserPlus, ListChecks, Building2,
} from "lucide-react";

const TABS = [
  { href: "/employees", label: "الموظفون", icon: Users, match: ["/employees"], exact: true },
  { href: "/hr/attendance", label: "الحضور", icon: Clock, match: ["/hr/attendance"] },
  { href: "/hr/leaves", label: "الإجازات", icon: Calendar, match: ["/hr/leaves"] },
  { href: "/hr/violations", label: "المخالفات", icon: AlertTriangle, match: ["/hr/violations"] },
  { href: "/hr/training", label: "التدريب", icon: GraduationCap, match: ["/hr/training"] },
  { href: "/hr/performance", label: "الأداء", icon: Target, match: ["/hr/performance"] },
  { href: "/hr/payroll", label: "الرواتب", icon: DollarSign, match: ["/hr/payroll"] },
  { href: "/hr/recruitment", label: "التوظيف", icon: UserPlus, match: ["/hr/recruitment"] },
  { href: "/hr/shifts", label: "الورديات", icon: ListChecks, match: ["/hr/shifts"] },
  { href: "/hr/organization", label: "الهيكل", icon: Building2, match: ["/hr/organization"] },
];

export function HrTabsNav() {
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
