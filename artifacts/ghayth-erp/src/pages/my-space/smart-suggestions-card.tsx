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
          <Lightbulb className="w-5 h-5 text-yellow-500" />
          اقتراحات ذكية
          <Badge variant="secondary" className="text-xs">{suggestions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {suggestions.slice(0, 6).map((s: any) => {
            const severityStyles: Record<string, { bg: string; border: string; icon: string }> = {
              critical: { bg: "bg-red-50", border: "border-red-200", icon: "text-red-600" },
              warning: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600" },
              info: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600" },
            };
            const style = severityStyles[s.severity] || severityStyles.info;
            return (
              <div key={s.id} className={cn("p-3 rounded-xl border flex items-start gap-3", style.bg, style.border)}>
                <Lightbulb className={cn("w-5 h-5 shrink-0 mt-0.5", style.icon)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
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
