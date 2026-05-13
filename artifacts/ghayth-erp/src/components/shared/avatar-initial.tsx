import { cn } from "@/lib/utils";

const COLOR_SCHEMES = {
  blue:    "bg-blue-100 text-status-info-foreground",
  purple:  "bg-purple-100 text-purple-700",
  red:     "bg-red-100 text-status-error-foreground",
  green:   "bg-green-100 text-status-success-foreground",
  emerald: "bg-emerald-100 text-emerald-700",
  orange:  "bg-orange-100 text-orange-700",
  amber:   "bg-amber-100 text-status-warning-foreground",
  yellow:  "bg-yellow-100 text-yellow-700",
  indigo:  "bg-indigo-100 text-indigo-700",
  cyan:    "bg-cyan-100 text-cyan-700",
} as const;

export type AvatarColor = keyof typeof COLOR_SCHEMES;

export interface AvatarInitialProps {
  name: string | null | undefined;
  color?: AvatarColor;
  size?: "sm" | "default";
  className?: string;
}

export function AvatarInitial({ name, color = "blue", size = "default", className }: AvatarInitialProps) {
  return (
    <div className={cn(
      "rounded-full flex items-center justify-center font-bold shrink-0",
      size === "sm" ? "w-7 h-7 text-[10px]" : "w-8 h-8 text-xs",
      COLOR_SCHEMES[color],
      className,
    )}>
      {(name || "؟").charAt(0)}
    </div>
  );
}
