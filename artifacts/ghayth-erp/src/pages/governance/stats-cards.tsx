import { Card, CardContent } from "@/components/ui/card";
import { Shield, FileCheck, AlertTriangle, ClipboardCheck, CheckCircle2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatsCards({ stats }: { stats: any }) {
  const cards = [
    { label: "السياسات", value: stats?.totalPolicies || 0, icon: FileCheck, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "المخاطر المفتوحة", value: stats?.openRisks || 0, icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
    { label: "التدقيق النشط", value: stats?.activeAudits || 0, icon: ClipboardCheck, color: "text-purple-600 bg-purple-50" },
    { label: "عدم الامتثال", value: stats?.nonCompliant || 0, icon: Shield, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "إجراءات الامتثال", value: stats?.complianceActions || 0, icon: Activity, color: "text-indigo-600 bg-indigo-50" },
    { label: "إجراءات تصحيحية مفتوحة", value: stats?.openCapas || 0, icon: CheckCircle2, color: "text-rose-600 bg-rose-50" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
              <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
            </div>
            <div>
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
