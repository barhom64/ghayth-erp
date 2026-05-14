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

  return (
    <Card className={cn("border-0 shadow-sm hover:shadow-md transition-shadow", className)}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn(
          "rounded-xl flex items-center justify-center",
          isSmall ? "w-10 h-10" : "w-12 h-12",
          bgColor,
        )}>
          <Icon className={cn(isSmall ? "w-5 h-5" : "w-6 h-6", iconColor)} />
        </div>
        <div>
          <p className={cn("font-bold", isSmall ? "text-lg" : "text-2xl")}>{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {trend && <p className="text-xs text-green-500">{trend}</p>}
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
  return (
    <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-4", className)}>
      {items.map((item) => (
        <KpiCard key={item.label} {...item} />
      ))}
    </div>
  );
}
