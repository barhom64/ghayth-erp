import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { severityColors } from "./shared";

interface ViolationsCardProps {
  violations: any[];
}

export function ViolationsCard({ violations }: ViolationsCardProps) {
  if (violations.length === 0) return null;
  return (
    <Card className="border-0 shadow-sm border-s-4 border-s-red-400">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-status-error" />
          الجزاءات والملاحظات
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {violations.map((v: any) => (
            <div key={v.id} className="flex items-center justify-between p-2.5 rounded-lg bg-status-error-surface">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-status-neutral-foreground truncate">{v.description}</p>
                <p className="text-xs text-muted-foreground">{v.period} — {v.type}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {v.deduction > 0 && (
                  <span className="text-xs text-status-error-foreground font-medium">-{formatCurrency(Number(v.deduction))}</span>
                )}
                <Badge className={cn("text-[10px]", severityColors[v.severity] || "bg-surface-subtle text-status-neutral-foreground")}>
                  {v.severity === "low" ? "منخفض" : v.severity === "medium" ? "متوسط" : "عالي"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
