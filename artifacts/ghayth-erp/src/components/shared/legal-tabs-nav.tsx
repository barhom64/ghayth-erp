import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Scale, Calendar, Gavel, Mail } from "lucide-react";

const TABS = [
  { href: "/legal", label: "القضايا", icon: Scale, match: ["/legal"], exact: true },
  { href: "/legal/sessions", label: "الجلسات", icon: Calendar, match: ["/legal/sessions"] },
  { href: "/legal/judgments", label: "الأحكام", icon: Gavel, match: ["/legal/judgments"] },
  { href: "/legal/correspondence", label: "المراسلات", icon: Mail, match: ["/legal/correspondence"] },
];

export function LegalTabsNav() {
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
