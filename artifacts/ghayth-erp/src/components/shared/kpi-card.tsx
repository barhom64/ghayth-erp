import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Format: "text-status-info-foreground bg-status-info-surface" — first token for icon, second for container */
  color: string;
  /** "default" for list pages, "sm" for detail pages */
  size?: "default" | "sm";
  trend?: string;
  className?: string;
}

export function KpiCard({ label, value, icon: Icon, color, size = "default", trend, className }: KpiCardProps) {
  const [iconColor, bgColor] = color.split(" ");
  const isSmall = size === "sm";

  // Mobile fix: shrink the icon tile from 12→10 (default) and 10→9 (sm)
  // on `< sm` viewports + use p-3 instead of p-4 so a 2-column grid
  // doesn't push the card width past the viewport on a 360px screen.
  // The label gets `truncate` so a long string ("مهام مستحقة بانتظار
  // الاعتماد") doesn't drive the card's intrinsic min-width higher than
  // the available column width.
  return (
    <Card className={cn("border-0 shadow-sm hover:shadow-md transition-shadow min-w-0", className)}>
      <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3 min-w-0">
        <div className={cn(
          "rounded-xl flex items-center justify-center shrink-0",
          isSmall ? "w-9 h-9 sm:w-10 sm:h-10" : "w-10 h-10 sm:w-12 sm:h-12",
          bgColor,
        )}>
          <Icon className={cn(isSmall ? "w-4 h-4 sm:w-5 sm:h-5" : "w-5 h-5 sm:w-6 sm:h-6", iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("font-bold leading-tight", isSmall ? "text-base sm:text-lg" : "text-xl sm:text-2xl")}>{value}</p>
          <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{label}</p>
          {trend && <p className="text-[10px] sm:text-xs text-green-500 truncate">{trend}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export interface KpiGridProps {
  items: KpiCardProps[];
  className?: string;
}

export function KpiGrid({ items, className }: KpiGridProps) {
  // Mobile fix: gap-2 on mobile, gap-3 on sm+, gap-4 on lg+. The
  // earlier fixed gap-4 ate 16px × 1 horizontal gap on a 360px
  // viewport — combined with px-1 page padding it left ~170px per
  // card which clipped the value + label on long ones.
  return (
    <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4", className)}>
      {items.map((item) => (
        <KpiCard key={item.label} {...item} />
      ))}
    </div>
  );
}
