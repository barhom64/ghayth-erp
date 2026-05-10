import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Package, Calendar, Receipt, Bus,
  UserCircle, AlertTriangle, Upload, Building2, Tag, Award, ShieldAlert,
  FileSpreadsheet,
} from "lucide-react";

const TABS = [
  { href: "/umrah", label: "نظرة عامة", icon: LayoutDashboard, match: ["/umrah"], exact: true },
  { href: "/umrah/import-wizard", label: "الاستيراد", icon: FileSpreadsheet, match: ["/umrah/import-wizard", "/umrah/import"] },
  { href: "/umrah/pilgrims", label: "المعتمرون", icon: Users, match: ["/umrah/pilgrims"] },
  { href: "/umrah/seasons", label: "المواسم", icon: Calendar, match: ["/umrah/seasons"] },
  { href: "/umrah/agents", label: "الوكلاء", icon: UserCircle, match: ["/umrah/agents"] },
  { href: "/umrah/sub-agents", label: "الوكلاء الفرعيون", icon: Building2, match: ["/umrah/sub-agents"] },
  { href: "/umrah/pricing", label: "الأسعار", icon: Tag, match: ["/umrah/pricing"] },
  { href: "/umrah/invoices", label: "الفواتير", icon: Receipt, match: ["/umrah/invoices"] },
  { href: "/umrah/violations", label: "المخالفات", icon: ShieldAlert, match: ["/umrah/violations", "/umrah/penalties"] },
  { href: "/umrah/commission-plans", label: "العمولات", icon: Award, match: ["/umrah/commission-plans"] },
  { href: "/umrah/packages", label: "الباقات", icon: Package, match: ["/umrah/packages"] },
  { href: "/umrah/transport", label: "النقل", icon: Bus, match: ["/umrah/transport"] },
];

export function UmrahTabsNav() {
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
