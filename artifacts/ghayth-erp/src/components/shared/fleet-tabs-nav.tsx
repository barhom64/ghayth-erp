import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Car, Users, Navigation, Wrench, Fuel, Shield, Bell,
  BarChart3, Calendar, CalendarDays, AlertTriangle, Satellite, Package, Disc,
  Clipboard, FileSignature,
} from "lucide-react";
import { TransportTabsNav } from "./transport-tabs-nav";

const TABS = [
  { href: "/fleet", label: "المركبات", icon: Car, match: ["/fleet"], exact: true },
  { href: "/fleet/drivers", label: "السائقون", icon: Users, match: ["/fleet/drivers"] },
  // #1733 Comment 9 — booking + dispatch surface lives next to trips
  // because operators reach for it before the trip exists.
  { href: "/fleet/transport/bookings", label: "النقل", icon: Clipboard, match: ["/fleet/transport"] },
  { href: "/fleet/trips", label: "الرحلات", icon: Navigation, match: ["/fleet/trips"] },
  { href: "/fleet/cargo", label: "نقل البضائع", icon: Package, match: ["/fleet/cargo"] },
  // #2079 TA-T18-13 (FIX-12) — rental was orphaned from the in-page
  // fleet tabs even after TA-T18-09 split it onto its own
  // `fleet.rentals` feature. Surfacing it next to cargo so the
  // operator reaches the third transport leg (equipment rental)
  // without leaving the fleet sub-app.
  { href: "/fleet/rental-contracts", label: "التأجير", icon: FileSignature, match: ["/fleet/rental-contracts"] },
  { href: "/fleet/maintenance", label: "الصيانة", icon: Wrench, match: ["/fleet/maintenance"] },
  { href: "/fleet/fuel", label: "الوقود", icon: Fuel, match: ["/fleet/fuel"] },
  { href: "/fleet/insurance", label: "التأمين", icon: Shield, match: ["/fleet/insurance"] },
  { href: "/fleet/tires", label: "الإطارات", icon: Disc, match: ["/fleet/tires"] },
  { href: "/fleet/preventive-plans", label: "الصيانة الوقائية", icon: Calendar, match: ["/fleet/preventive-plans"] },
  // TR-022 — unified transport calendar (booking/dispatch/maintenance/rental/cargo).
  { href: "/fleet/transport/calendar", label: "التقويم", icon: CalendarDays, match: ["/fleet/transport/calendar"] },
  { href: "/fleet/traffic-violations", label: "المخالفات", icon: AlertTriangle, match: ["/fleet/traffic-violations"] },
  { href: "/fleet/alerts", label: "التنبيهات", icon: Bell, match: ["/fleet/alerts"] },
  { href: "/fleet/telematics/live-map", label: "التتبع المباشر", icon: Satellite,
    match: ["/fleet/telematics"] },
  { href: "/fleet/reports", label: "التقارير", icon: BarChart3, match: ["/fleet/reports", "/fleet/tco"] },
];

export function FleetTabsNav() {
  const [location] = useLocation();
  // On the transport cluster, render the secondary transport nav below
  // the top fleet tabs (القائمة السفلية تحت العلوية).
  const inTransport = location.startsWith("/fleet/transport");

  return (
    <>
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
      {inTransport && <TransportTabsNav />}
    </>
  );
}
