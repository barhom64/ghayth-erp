import { useApiQuery } from "@/lib/api";
import { Check, Clock } from "lucide-react";

/**
 * U-19-P4 — Journey step indicator.
 *
 * Compact horizontal stepper that visualises the 4-stage umrah journey
 * (imported → linked → invoiced → collected) for a sub-agent or a
 * group. Reads from the U-19-P1 / U-19-P1b journey helper API:
 *   GET /umrah/sub-agents/:id/journey
 *   GET /umrah/groups/:id/journey
 *
 * Each stage shows:
 *   - filled circle ✓ if count > 0
 *   - empty circle ○ if count == 0
 *   - the `currentStage` prop highlights the focused step (the page
 *     we're currently on).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No write surface. Pure read.
 *   - No engine touch. Uses the existing journey helper API.
 *   - Empty state safe: if API is loading or errors, the indicator
 *     renders the 4 grey circles without throwing.
 */

export type JourneyStage = "imported" | "linked" | "invoiced" | "collected";

interface JourneyResponse {
  stages: Array<{
    stage: JourneyStage;
    count: number;
    total?: number;
  }>;
}

interface JourneyStepIndicatorProps {
  /** Which side of the journey to query. */
  subjectKind: "sub-agent" | "group";
  /** The id of the sub-agent or group. */
  subjectId: number;
  /** Which stage is the current page focused on (highlighted). */
  currentStage: JourneyStage;
}

const STAGES: Array<{ key: JourneyStage; label: string }> = [
  { key: "imported", label: "الاستيراد" },
  { key: "linked", label: "الربط" },
  { key: "invoiced", label: "الفوترة" },
  { key: "collected", label: "التحصيل" },
];

export function JourneyStepIndicator({
  subjectKind,
  subjectId,
  currentStage,
}: JourneyStepIndicatorProps) {
  const path =
    subjectKind === "sub-agent"
      ? `/umrah/sub-agents/${subjectId}/journey`
      : `/umrah/groups/${subjectId}/journey`;

  const { data } = useApiQuery<JourneyResponse>(
    ["journey", subjectKind, String(subjectId)],
    path,
  );

  const counts: Record<JourneyStage, number> = {
    imported: 0,
    linked: 0,
    invoiced: 0,
    collected: 0,
  };
  for (const s of data?.stages ?? []) {
    counts[s.stage] = Number(s.count ?? 0);
  }

  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-3"
      data-testid="journey-step-indicator"
      dir="rtl"
    >
      {STAGES.map((stage, i) => {
        const isCurrent = stage.key === currentStage;
        const isReached = counts[stage.key] > 0;
        return (
          <div
            key={stage.key}
            className="flex flex-1 items-center gap-2"
            data-stage={stage.key}
            data-stage-current={isCurrent ? "true" : undefined}
            data-stage-reached={isReached ? "true" : undefined}
          >
            <div
              className={[
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                isReached
                  ? "bg-emerald-600 text-white border-emerald-700"
                  : "bg-background text-muted-foreground",
                isCurrent ? "ring-2 ring-primary ring-offset-2" : "",
              ].join(" ")}
            >
              {isReached ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4 opacity-50" />}
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <div
                className={`truncate font-medium ${
                  isCurrent ? "text-primary" : "text-foreground"
                }`}
              >
                {stage.label}
              </div>
              <div className="text-muted-foreground" data-stage-count>
                {counts[stage.key]}
              </div>
            </div>
            {i < STAGES.length - 1 && (
              <div
                className={`h-px flex-1 ${
                  isReached ? "bg-emerald-400" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
