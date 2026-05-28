import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  MapPin, Bot, Activity, Video, HardDrive, Settings,
} from "lucide-react";

const TABS = [
  { href: "/fleet/telematics/live-map", label: "الخريطة المباشرة", icon: MapPin },
  { href: "/fleet/telematics/ai-alerts", label: "تنبيهات السلامة الذكية", icon: Bot },
  { href: "/fleet/telematics/sensors", label: "قراءات الحساسات", icon: Activity },
  { href: "/fleet/telematics/video-evidence", label: "أدلة الفيديو", icon: Video },
  { href: "/fleet/telematics/devices", label: "أجهزة MDVR", icon: HardDrive },
  { href: "/fleet/telematics/settings", label: "إعدادات CMSV6", icon: Settings },
];

export function FleetTelematicsTabsNav() {
  const [location] = useLocation();
  return (
    <div className="border-b mb-4 -mt-2 overflow-x-auto">
      <nav className="flex gap-1 min-w-max" dir="rtl">
        {TABS.map((tab) => {
          const isActive = location === tab.href || location.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href}>
              <a
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
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
