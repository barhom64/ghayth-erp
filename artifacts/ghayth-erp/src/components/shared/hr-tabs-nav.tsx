import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Briefcase, Users, Clock, ClipboardCheck, Scale, Target,
  DollarSign, FileBarChart, Settings,
} from "lucide-react";

// HR-REV — the horizontal HR bar mirrors the sidebar's top-level groups 1:1
// (same order, same labels, same landing path), so the two menus express the
// same structure. Each tab's `match` lists the sub-paths that live under that
// sidebar group, so the right tab highlights wherever you are inside HR.
const TABS = [
  { href: "/hr", label: "لوحة الموارد البشرية", icon: Briefcase, match: ["/hr"], exact: true },
  {
    href: "/employees", label: "الموظفون", icon: Users,
    match: [
      "/employees", "/hr/recruitment", "/hr/employee-activation", "/hr/activation-board",
      "/hr/onboarding-review", "/hr/transfers", "/hr/expiring-documents", "/hr/org-tree",
      "/hr/organization", "/hr/delegations", "/hr/documents", "/hr/contracts",
      "/hr/official-letters", "/hr/exit",
    ],
  },
  {
    href: "/hr/attendance", label: "النشاط والحضور", icon: Clock,
    match: ["/hr/attendance", "/hr/shifts"],
  },
  {
    href: "/hr/services", label: "الطلبات", icon: ClipboardCheck,
    match: ["/hr/services", "/hr/approvals", "/hr/leaves", "/hr/overtime", "/hr/excuse-requests"],
  },
  {
    href: "/hr/violations", label: "المخالفات والجزاءات", icon: Scale,
    match: ["/hr/violations", "/hr/discipline", "/hr/saudization", "/hr/saudi-compliance"],
  },
  {
    href: "/hr/performance", label: "الأداء والتطوير", icon: Target,
    match: ["/hr/performance", "/hr/evaluation-360", "/hr/idp", "/hr/training"],
  },
  {
    href: "/hr/payroll", label: "الرواتب والمستحقات", icon: DollarSign,
    match: ["/hr/payroll", "/hr/loans", "/hr/gratuity", "/hr/accruals", "/hr/wps"],
  },
  {
    href: "/hr/turnover-report", label: "التقارير", icon: FileBarChart,
    match: ["/hr/turnover-report"],
  },
  {
    href: "/hr/attendance-policy", label: "الإعدادات", icon: Settings,
    match: ["/hr/attendance-policy", "/hr/public-holidays", "/hr/attendance-categories", "/hr/scoring-weights"],
  },
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
