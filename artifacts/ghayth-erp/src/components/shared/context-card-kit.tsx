// context-card-kit — shared presentational fragments for the entity
// "context cards" (client / employee / vehicle / supplier / product /
// property-unit). Each card keeps its OWN data-fetching and bespoke logic;
// this kit only removes the markup that was copy-pasted identically across all
// of them (the loading skeleton, the stat cell, the warning block). Extracting
// these enforces one visual contract instead of six drifting copies.
//
// Part of the duplication-reduction sweep (UNIFICATION_PLAN P4 / context-card
// cluster). Opt-in: cards migrate to it incrementally — nothing breaks.
import type { ComponentType, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ className?: string }>;

/**
 * The pulse skeleton every context card renders while its primary entity
 * query is in flight. Was duplicated verbatim in all six cards.
 */
export function ContextCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("border-border bg-surface-subtle/50 animate-pulse", className)}>
      <CardContent className="p-4">
        <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * One cell in a context card's info/stat grid: a muted label (optionally with
 * a leading icon) over a bold value. `tone` overrides the value colour and
 * `borderTone` the cell border (e.g. low-stock = warning, out-of-stock = error).
 */
export function ContextStat({
  icon: Icon,
  label,
  value,
  tone,
  borderTone,
  truncate,
}: {
  icon?: IconType;
  label: ReactNode;
  value: ReactNode;
  tone?: string;
  borderTone?: string;
  /** Clip an over-long value to one line (driver names, vehicle type, …). */
  truncate?: boolean;
}) {
  return (
    <div className={cn("bg-white rounded p-2 border", borderTone ?? "border-border")}>
      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        <span>{label}</span>
      </p>
      <p className={cn("text-sm font-semibold", tone ?? "text-gray-800", truncate && "truncate")}>{value}</p>
    </div>
  );
}

const WARNING_TONES = {
  error: "text-status-error-foreground bg-status-error-surface border-status-error-surface",
  warning: "text-status-warning-foreground bg-status-warning-surface border-status-warning-surface",
  info: "text-status-info-foreground bg-status-info-surface border-status-info-surface",
} as const;

export type ContextWarningTone = keyof typeof WARNING_TONES;

/**
 * A contextual warning strip under a context card (inactive entity, low stock,
 * out of service, …). `tone` picks the colour family; `icon` defaults to the
 * caller's choice so non-alert cues (TrendingDown) read correctly.
 */
export function ContextWarning({
  icon: Icon,
  tone = "error",
  children,
}: {
  icon: IconType;
  tone?: ContextWarningTone;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-1.5 text-xs border rounded p-1.5", WARNING_TONES[tone])}>
      <Icon className="h-3 w-3" />
      <span>{children}</span>
    </div>
  );
}
