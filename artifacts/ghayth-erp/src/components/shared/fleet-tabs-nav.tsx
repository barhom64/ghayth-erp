import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Car, Users, Navigation, Wrench, Fuel, Shield, Bell,
  BarChart3, Calendar, AlertTriangle, Satellite, Package, Disc,
  Clipboard, FileSignature, MoreHorizontal, ChevronDown,
} from "lucide-react";
import { TransportTabsNav } from "./transport-tabs-nav";

interface Tab { href: string; label: string; icon: any; match: string[]; exact?: boolean; }

// 11 تبويبًا رئيسيًّا (مركبات/سائقون → نقل/رحلات/شحن/تأجير → صيانة → امتثال →
// تتبع → تقارير) + «المزيد» المنسدلة لتفاصيل الصيانة والتكاليف، على نمط شريطَي
// العمرة («الرقابة») والمالية — لتقصير الشريط من 15 مسطّحًا إلى 11 + منسدلة.
const PRIMARY_TABS: Tab[] = [
  { href: "/fleet", label: "المركبات", icon: Car, match: ["/fleet"], exact: true },
  { href: "/fleet/drivers", label: "السائقون", icon: Users, match: ["/fleet/drivers"] },
  // #1733 Comment 9 — booking + dispatch surface lives next to trips
  // because operators reach for it before the trip exists.
  { href: "/fleet/transport/bookings", label: "النقل", icon: Clipboard, match: ["/fleet/transport"] },
  { href: "/fleet/trips", label: "الرحلات", icon: Navigation, match: ["/fleet/trips"] },
  { href: "/fleet/cargo", label: "الشحن والبضائع", icon: Package, match: ["/fleet/cargo"] },
  // #2079 — rental (third transport leg: equipment rental) kept next to cargo.
  { href: "/fleet/rental-contracts", label: "التأجير", icon: FileSignature, match: ["/fleet/rental-contracts"] },
  { href: "/fleet/maintenance", label: "الصيانة", icon: Wrench, match: ["/fleet/maintenance"] },
  { href: "/fleet/traffic-violations", label: "المخالفات", icon: AlertTriangle, match: ["/fleet/traffic-violations"] },
  { href: "/fleet/alerts", label: "التنبيهات", icon: Bell, match: ["/fleet/alerts"] },
  { href: "/fleet/telematics/live-map", label: "التتبع المباشر", icon: Satellite, match: ["/fleet/telematics"] },
  { href: "/fleet/reports", label: "التقارير", icon: BarChart3, match: ["/fleet/reports", "/fleet/tco"] },
];

const MORE_TABS: Tab[] = [
  { href: "/fleet/fuel", label: "الوقود", icon: Fuel, match: ["/fleet/fuel"] },
  { href: "/fleet/insurance", label: "التأمين", icon: Shield, match: ["/fleet/insurance"] },
  { href: "/fleet/tires", label: "الإطارات", icon: Disc, match: ["/fleet/tires"] },
  { href: "/fleet/preventive-plans", label: "الصيانة الوقائية", icon: Calendar, match: ["/fleet/preventive-plans"] },
];

function isActive(tab: Tab, location: string): boolean {
  if (tab.exact) return location === tab.href;
  return tab.match.some((m) => location === m || location.startsWith(`${m}/`));
}

export function FleetTabsNav() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const inTransport = location.startsWith("/fleet/transport");
  const moreActive = MORE_TABS.some((t) => isActive(t, location));

  return (
    <>
      <div className="border-b mb-4 -mt-2 overflow-x-auto">
        <nav className="flex gap-1 min-w-max items-center" dir="rtl">
          {PRIMARY_TABS.map((tab) => {
            const active = isActive(tab, location);
            const Icon = tab.icon;
            return (
              <Link key={tab.href} href={tab.href}>
                <a
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

          {/* «المزيد» — تفاصيل الصيانة والتكاليف في قائمة منسدلة */}
          <div className="relative" onMouseLeave={() => setMoreOpen(false)}>
            <button
              type="button"
              data-testid="fleet-tab-more-dropdown"
              onClick={() => setMoreOpen((v) => !v)}
              onMouseEnter={() => setMoreOpen(true)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                moreActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
              المزيد
              <ChevronDown className="h-3 w-3" />
            </button>
            {moreOpen && (
              <div className="absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-md py-1 min-w-[200px] z-50">
                {MORE_TABS.map((tab) => {
                  const active = isActive(tab, location);
                  const Icon = tab.icon;
                  return (
                    <Link key={tab.href} href={tab.href}>
                      <a
                        onClick={() => setMoreOpen(false)}
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
        </nav>
      </div>
      {inTransport && <TransportTabsNav />}
    </>
  );
}
