import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Clipboard, Send, Navigation, Repeat, LayoutDashboard,
  CalendarDays, ListChecks, Tag, Receipt, Link2,
} from "lucide-react";

// القائمة السفلية لمسار النقل (تحت القائمة العرضية للأسطول).
// تظهر تلقائياً على شاشات /fleet/transport/* عبر FleetTabsNav، وتنقّل
// المشغّل داخل خطّ أنابيب النقل دون الرجوع للقائمة العلوية. مرتّبة على
// تسلسل العملية: الحجز ← الإرسال ← خطط/قوالب المسار ← العمليات/التقويم،
// ثم الإعدادات (قواعد/تسعير) والمخرجات (الفوترة/التكامل).
const TRANSPORT_TABS = [
  { href: "/fleet/transport/bookings", label: "الحجوزات", icon: Clipboard },
  { href: "/fleet/transport/dispatch", label: "الإرسال", icon: Send },
  { href: "/fleet/transport/itineraries", label: "خطط المسارات", icon: Navigation },
  { href: "/fleet/transport/route-patterns", label: "القوالب المتكررة", icon: Repeat },
  { href: "/fleet/transport/ops-dashboard", label: "لوحة العمليات", icon: LayoutDashboard },
  { href: "/fleet/transport/calendar", label: "التقويم", icon: CalendarDays },
  { href: "/fleet/transport/rules", label: "قواعد الاستقبال", icon: ListChecks },
  { href: "/fleet/transport/price-rules", label: "قواعد التسعير", icon: Tag },
  { href: "/fleet/transport/service-lines", label: "أوامر الفوترة", icon: Receipt },
  { href: "/fleet/transport/integration", label: "التكامل", icon: Link2 },
];

/**
 * Secondary (sub-level) navigation for the transport cluster. Rendered
 * below FleetTabsNav on /fleet/transport/* routes. Pill styling marks it
 * as a sub-level distinct from the top underline tabs.
 */
export function TransportTabsNav() {
  const [location] = useLocation();
  return (
    <div className="mb-4 -mt-1 overflow-x-auto">
      <nav className="flex gap-1 min-w-max rounded-lg bg-surface-subtle/60 p-1" dir="rtl">
        {TRANSPORT_TABS.map((tab) => {
          const isActive = location === tab.href || location.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} asChild>
              <a
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-background text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </a>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
