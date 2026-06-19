import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Package, Calendar, Receipt, Bus,
  UserCircle, AlertTriangle, Upload, UserPlus, Tag, Briefcase, ShieldAlert,
  ClipboardList, Scale, Layers, Sparkles, Shield, Hotel, Settings, ChevronDown,
  BarChart3, Undo2,
} from "lucide-react";

// نمط جديد للتبويبات — مجموعة من 14 تبويب رئيسي مباشر + dropdown
// "الرقابة" يجمع 4 صفحات مراقبة كانت متفرقة + زر ⚙ منفصل للإعدادات.
//
// قبل: 19 تب أفقي يجبر العامل على scroll طويل للوصول لأي شي
// بعد: 14 تب + 1 dropdown + 1 settings gear = أوضح بصرياً وأقل تشتيت

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
  { href: "/umrah/sub-agents", label: "الوكلاء الفرعيون", icon: UserPlus, match: ["/umrah/sub-agents"] },
  { href: "/umrah/pricing", label: "التسعير", icon: Tag, match: ["/umrah/pricing"] },
  { href: "/umrah/sales-wizard", label: "معالج المبيعات", icon: Sparkles, match: ["/umrah/sales-wizard"] },
  { href: "/umrah/invoices", label: "الفواتير", icon: Receipt, match: ["/umrah/invoices"] },
  { href: "/umrah/commission-plans", label: "العمولات", icon: Briefcase, match: ["/umrah/commission-plans", "/umrah/commission-calculations"] },
  { href: "/umrah/transport", label: "النقل", icon: Bus, match: ["/umrah/transport"] },
  // U-02b M5a (#2080) — تبويب جديد يظهر صفحة طلبات النقل الموحَّدة
  // (POST /umrah/groups/:id/transport-requests). يقف بجانب التبويب
  // القديم بلا حذف وبلا تعديل سلوك. M5a لا يُحوِّل أي رابط آخر —
  // التقويم وتعطيل المسار القديم يتطلبان إذناً مستقلاً (M5b وما بعده).
  { href: "/umrah/transport-requests", label: "طلبات النقل", icon: ClipboardList, match: ["/umrah/transport-requests"] },
  { href: "/umrah/violations", label: "المخالفات", icon: ShieldAlert, match: ["/umrah/violations"] },
  { href: "/umrah/penalties", label: "الغرامات", icon: AlertTriangle, match: ["/umrah/penalties"] },
  { href: "/umrah/refund-requests", label: "الاستردادات", icon: Undo2, match: ["/umrah/refund-requests"] },
  { href: "/umrah/import", label: "الاستيراد", icon: Upload, match: ["/umrah/import"] },
  { href: "/umrah/reports", label: "التقارير", icon: BarChart3, match: ["/umrah/reports"] },
];

// المجموعة الفرعية — كل صفحات الرقابة والامتثال في dropdown واحد
// مع لوحة الامتثال كأول عنصر (إنها التلخيص الموحَّد للباقي).
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

export function UmrahTabsNav() {
  const [location] = useLocation();
  const [monitoringOpen, setMonitoringOpen] = useState(false);
  const monitoringActive = MONITORING_TABS.some((t) => isActive(t, location));

  return (
    <div className="border-b mb-4 -mt-2 overflow-x-auto" data-testid="umrah-tabs-nav">
      <nav className="flex gap-1 min-w-max items-center" dir="rtl">
        {PRIMARY_TABS.map((tab) => {
          const active = isActive(tab, location);
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href}>
              <a
                data-testid={`umrah-tab-${tab.href.replace(/\//g, "-").replace(/^-/, "")}`}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  active
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

        {/* الرقابة dropdown — يجمع 4 صفحات مراقبة كانت متفرقة */}
        <div className="relative" onMouseLeave={() => setMonitoringOpen(false)}>
          <button
            type="button"
            data-testid="umrah-tab-monitoring-dropdown"
            onClick={() => setMonitoringOpen((v) => !v)}
            onMouseEnter={() => setMonitoringOpen(true)}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              monitoringActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            <Shield className="h-4 w-4" />
            الرقابة
            <ChevronDown className="h-3 w-3" />
          </button>
          {monitoringOpen && (
            <div
              className="absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-md py-1 min-w-[200px] z-50"
              data-testid="umrah-monitoring-menu"
            >
              {MONITORING_TABS.map((tab) => {
                const active = isActive(tab, location);
                const Icon = tab.icon;
                return (
                  <Link key={tab.href} href={tab.href}>
                    <a
                      data-testid={`umrah-monitoring-item-${tab.href.replace(/\//g, "-").replace(/^-/, "")}`}
                      onClick={() => setMonitoringOpen(false)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors",
                        active ? "text-primary font-medium" : "text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </a>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* زر ⚙ منفصل لصفحة إعدادات العمرة (كانت route مخفي) */}
        <Link href="/umrah/settings">
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
