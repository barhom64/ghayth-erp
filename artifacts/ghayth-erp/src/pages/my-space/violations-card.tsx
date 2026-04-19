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
          <AlertTriangle className="w-5 h-5 text-red-500" />
          الجزاءات والملاحظات
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {violations.map((v: any) => (
            <div key={v.id} className="flex items-center justify-between p-2.5 rounded-lg bg-red-50/50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{v.description}</p>
                <p className="text-xs text-gray-400">{v.period} — {v.type}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {v.deduction > 0 && (
                  <span className="text-xs text-red-600 font-medium">-{formatCurrency(Number(v.deduction))}</span>
                )}
                <Badge className={cn("text-[10px]", severityColors[v.severity] || "bg-gray-100 text-gray-700")}>
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
