import { type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * DecisionImpactPreview — «الأثر المتوقع قبل الفعل» (دستور المادة 4).
 *
 * A presentational panel that lists what WILL happen when an operator confirms
 * a decision (approve / reject / post / …) — e.g. «سيتم: إنشاء قيد + إشعار
 * المقدم + قفل التعديل». It carries NO logic: the owning path passes the
 * effects it already knows its action triggers, so no business rule moves into
 * this component. Render it next to a confirm/submit control.
 */
export interface DecisionEffect {
  /** Arabic effect line, e.g. «إشعار مقدم الطلب». */
  label: string;
  /** Optional emphasis tone for ledger-touching / irreversible effects. */
  tone?: "default" | "warning";
}

export function DecisionImpactPreview({
  effects,
  title = "عند تنفيذ القرار سيتم:",
  className,
  children,
}: {
  effects: DecisionEffect[];
  /** Lead line. Override to match the action, e.g. «عند الاعتماد سيتم:». */
  title?: string;
  className?: string;
  /** Optional trailing content (e.g. a note). */
  children?: ReactNode;
}) {
  if (!effects.length) return null;
  return (
    <div className={cn("rounded-lg border bg-surface-subtle p-3", className)} data-testid="decision-impact">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {effects.map((e, i) => (
          <li key={i} className="flex items-center gap-1.5 text-xs">
            <ArrowLeft className={cn("h-3 w-3 shrink-0", e.tone === "warning" ? "text-status-warning-foreground" : "text-muted-foreground")} />
            <span className={cn(e.tone === "warning" && "text-status-warning-foreground font-medium")}>{e.label}</span>
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}
