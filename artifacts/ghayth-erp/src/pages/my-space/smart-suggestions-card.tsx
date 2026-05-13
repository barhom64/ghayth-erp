import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lightbulb, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface SmartSuggestionsCardProps {
  suggestions: any[];
}

export function SmartSuggestionsCard({ suggestions }: SmartSuggestionsCardProps) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-status-warning" />
          اقتراحات ذكية
          <Badge variant="secondary" className="text-xs">{suggestions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {suggestions.slice(0, 6).map((s: any) => {
            const severityStyles: Record<string, { bg: string; border: string; icon: string }> = {
              critical: { bg: "bg-status-error-surface", border: "border-status-error-surface", icon: "text-status-error-foreground" },
              warning: { bg: "bg-status-warning-surface", border: "border-status-warning-surface", icon: "text-status-warning-foreground" },
              info: { bg: "bg-status-info-surface", border: "border-status-info-surface", icon: "text-status-info-foreground" },
            };
            const style = severityStyles[s.severity] || severityStyles.info;
            return (
              <div key={s.id} className={cn("p-3 rounded-xl border flex items-start gap-3", style.bg, style.border)}>
                <Lightbulb className={cn("w-5 h-5 shrink-0 mt-0.5", style.icon)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-status-neutral-foreground">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                </div>
                {s.actionLink && (
                  <Link href={s.actionLink}>
                    <Button variant="outline" size="sm" className="text-xs shrink-0">
                      {s.action} <ChevronLeft className="w-3 h-3 ms-1" />
                    </Button>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
