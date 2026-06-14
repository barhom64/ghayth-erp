/**
 * AssistantHints — §9 of #1870
 *
 * Renders a compact stack of suggestion cards driven by
 * GET /umrah/assistant/suggestions. Each card has a title, body,
 * severity-colored border, drill-down link.
 *
 * Designed to be embedded at the top of dashboard-style pages —
 * doesn't take ownership of layout (parent decides margins). When
 * there are zero suggestions, renders nothing (no empty-state noise).
 */
import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";

type SuggestionSeverity = "info" | "warning" | "critical";

interface AssistantSuggestion {
  type: string;
  title: string;
  body: string;
  severity: SuggestionSeverity;
  actionUrl: string;
  actionLabel: string;
  metric?: number;
}

const SEV_CLASSES: Record<SuggestionSeverity, string> = {
  critical: "border-rose-300 bg-rose-50",
  warning:  "border-amber-300 bg-amber-50",
  info:     "border-sky-300 bg-sky-50",
};

const SEV_DOT: Record<SuggestionSeverity, string> = {
  critical: "bg-rose-500",
  warning:  "bg-amber-500",
  info:     "bg-sky-500",
};

export function AssistantHints({
  seasonId,
  visibleLimit = 5,
}: {
  seasonId?: number | string;
  visibleLimit?: number;
}) {
  const qs = seasonId ? `?seasonId=${seasonId}` : "";
  const q = useApiQuery<{ data: AssistantSuggestion[] }>(
    ["umrah-assistant-suggestions", String(seasonId ?? "")],
    `/umrah/assistant/suggestions${qs}`,
  );
  const suggestions = q.data?.data ?? [];
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = suggestions.filter((s) => !dismissed.has(s.type));
  if (visible.length === 0) return null;

  const shown = expanded ? visible : visible.slice(0, visibleLimit);
  const hidden = visible.length - shown.length;

  return (
    <div className="space-y-2" data-testid="assistant-hints">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        <span>اقتراحات النظام ({visible.length})</span>
      </div>
      {shown.map((s) => {
        const sevCls = SEV_CLASSES[s.severity];
        const dotCls = SEV_DOT[s.severity];
        return (
          <Card key={s.type} className={`border ${sevCls}`} data-testid={`assistant-suggestion-${s.type}`}>
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.body}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <Button asChild size="sm" variant="outline" data-testid={`assistant-action-${s.type}`}><Link href={s.actionUrl}>
                        <ArrowLeft className="h-3 w-3 me-1" />
                        {s.actionLabel}
                      </Link></Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const next = new Set(dismissed);
                        next.add(s.type);
                        setDismissed(next);
                      }}
                      data-testid={`assistant-dismiss-${s.type}`}
                    >
                      تجاهل
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {hidden > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(true)}
          data-testid="assistant-expand"
          className="w-full"
        >
          <ChevronDown className="h-3.5 w-3.5 me-1" />
          عرض {hidden} اقتراحاً إضافياً
        </Button>
      )}
      {expanded && visible.length > visibleLimit && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(false)}
          data-testid="assistant-collapse"
          className="w-full"
        >
          <ChevronUp className="h-3.5 w-3.5 me-1" />
          طيّ
        </Button>
      )}
    </div>
  );
}
