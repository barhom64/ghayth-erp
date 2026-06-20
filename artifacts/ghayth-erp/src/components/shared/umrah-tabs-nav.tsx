import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Package, Calendar, Receipt, Bus,
  UserCircle, AlertTriangle, Upload, UserPlus, Tag, Briefcase, ShieldAlert,
  ClipboardList, Scale, Layers, Sparkles, Shield, Hotel, Settings, ChevronDown,
  BarChart3, Undo2, MoreHorizontal,
} from "lucide-react";

// 13 تبويبًا رئيسيًّا + منسدلتان: «المزيد» (ثانوي: وكلاء فرعيون/عمولات/طلبات نقل/
// غرامات/استردادات/استيراد) و«الرقابة» (الامتثال) + زر ⚙ إعدادات — لتقصير الشريط
// من 19 مسطّحًا إلى 13، على نمط شريطَي المالية والأسطول.

interface Tab {
  href: string;
  label: string;
  icon: any;
  match: string[];
  exact?: boolean;
}

const PRIMARY_TABS: Tab[] = [
  { href: "/umrah", label: "نظرة عامة", icon: LayoutDashboard, match: ["/umrah"], exact: true },
  { href: "/umrah/pilgrims", label: "المعتمرون", icon: Users, match: ["/umrah/pilgrims"] },
  { href: "/umrah/groups", label: "المجموعات", icon: Layers, match: ["/umrah/groups"] },
  { href: "/umrah/packages", label: "الباقات", icon: Package, match: ["/umrah/packages"] },
  { href: "/umrah/seasons", label: "المواسم", icon: Calendar, match: ["/umrah/seasons"] },
  { href: "/umrah/accommodations", label: "الإقامة", icon: Hotel, match: ["/umrah/accommodations"] },
  { href: "/umrah/agents", label: "الوكلاء", icon: UserCircle, match: ["/umrah/agents"] },
  { href: "/umrah/pricing", label: "التسعير", icon: Tag, match: ["/umrah/pricing"] },
  { href: "/umrah/sales-wizard", label: "معالج المبيعات", icon: Sparkles, match: ["/umrah/sales-wizard"] },
  { href: "/umrah/invoices", label: "الفواتير", icon: Receipt, match: ["/umrah/invoices"] },
  { href: "/umrah/transport", label: "النقل", icon: Bus, match: ["/umrah/transport"] },
  { href: "/umrah/violations", label: "المخالفات", icon: ShieldAlert, match: ["/umrah/violations"] },
  { href: "/umrah/reports", label: "التقارير", icon: BarChart3, match: ["/umrah/reports"] },
];

const MORE_TABS: Tab[] = [
  { href: "/umrah/sub-agents", label: "الوكلاء الفرعيون", icon: UserPlus, match: ["/umrah/sub-agents"] },
  { href: "/umrah/commission-plans", label: "العمولات", icon: Briefcase, match: ["/umrah/commission-plans", "/umrah/commission-calculations"] },
  { href: "/umrah/transport-requests", label: "طلبات النقل", icon: ClipboardList, match: ["/umrah/transport-requests"] },
  { href: "/umrah/penalties", label: "الغرامات", icon: AlertTriangle, match: ["/umrah/penalties"] },
  { href: "/umrah/refund-requests", label: "الاستردادات", icon: Undo2, match: ["/umrah/refund-requests"] },
  { href: "/umrah/import", label: "الاستيراد", icon: Upload, match: ["/umrah/import"] },
];

const MONITORING_TABS: Tab[] = [
  { href: "/umrah/compliance", label: "لوحة الامتثال", icon: AlertTriangle, match: ["/umrah/compliance"] },
  { href: "/umrah/daily-runsheet", label: "كشف اليوم", icon: ClipboardList, match: ["/umrah/daily-runsheet"] },
  { href: "/umrah/exempt-pilgrims", label: "المعفون", icon: Shield, match: ["/umrah/exempt-pilgrims"] },
  { href: "/umrah/reconciliation", label: "المطابقة", icon: Scale, match: ["/umrah/reconciliation"] },
];

function isActive(tab: Tab, location: string): boolean {
  if (tab.exact) return location === tab.href;
  return tab.match.some((m) => location === m || location.startsWith(`${m}/`));
}

function TabDropdown({ label, icon: Icon, tabs, location, testid, menuTestid }: {
  label: string; icon: any; tabs: Tab[]; location: string; testid: string; menuTestid?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = tabs.some((t) => isActive(t, location));
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        data-testid={testid}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
          active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
        )}
      >
        <Icon className="h-4 w-4" />
        {label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div data-testid={menuTestid} className="absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-md py-1 min-w-[200px] z-50">
          {tabs.map((tab) => {
            const a = isActive(tab, location);
            const TabIcon = tab.icon;
            return (
              <Link key={tab.href} href={tab.href} asChild>
                <a
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors",
                    a ? "text-primary font-medium" : "text-foreground"
                  )}
                >
                  <TabIcon className="h-4 w-4" />
                  {tab.label}
                </a>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UmrahTabsNav() {
  const [location] = useLocation();

  return (
    <div className="border-b mb-4 -mt-2 overflow-x-auto" data-testid="umrah-tabs-nav">
      <nav className="flex gap-1 min-w-max items-center" dir="rtl">
        {PRIMARY_TABS.map((tab) => {
          const active = isActive(tab, location);
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} asChild>
              <a
                data-testid={`umrah-tab-${tab.href.replace(/\//g, "-").replace(/^-/, "")}`}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </a>
            </Link>
          );
        })}

        <TabDropdown label="المزيد" icon={MoreHorizontal} tabs={MORE_TABS} location={location} testid="umrah-tab-more-dropdown" />
        <TabDropdown label="الرقابة" icon={Shield} tabs={MONITORING_TABS} location={location} testid="umrah-tab-monitoring-dropdown" menuTestid="umrah-monitoring-menu" />

        {/* زر ⚙ منفصل لصفحة إعدادات العمرة */}
        <Link href="/umrah/settings" asChild>
          <a
            data-testid="umrah-tab-settings-gear"
            title="إعدادات العمرة"
            className={cn(
              "inline-flex items-center justify-center w-10 h-10 mr-auto rounded-md transition-colors",
              isActive({ href: "/umrah/settings", match: ["/umrah/settings"], label: "", icon: Settings }, location)
                ? "text-primary bg-muted"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Settings className="h-4 w-4" />
          </a>
        </Link>
      </nav>
    </div>
  );
}
