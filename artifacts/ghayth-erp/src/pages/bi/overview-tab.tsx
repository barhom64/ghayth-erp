import { useRef } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, Building2, CreditCard, Car, Headphones, FolderKanban,
  DollarSign, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/formatters";
import { useChartExport } from "./shared";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";

export function OverviewTab() {
  const { data, isLoading, isError } = useApiQuery<any>(["bi-overview"], "/bi/overview");
  const d = data || {};
  const chartRef = useRef<HTMLDivElement>(null);
  const { exportChart } = useChartExport();
  const stats = [
    { label: "الموظفين", value: d.employees || 0, icon: Users, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "العملاء", value: d.clients || 0, icon: Building2, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "الفواتير", value: d.invoices || 0, icon: CreditCard, color: "text-purple-600 bg-purple-50" },
    { label: "المشاريع", value: d.projects || 0, icon: FolderKanban, color: "text-orange-600 bg-orange-50" },
    { label: "المركبات", value: d.vehicles || 0, icon: Car, color: "text-teal-600 bg-teal-50" },
    { label: "تذاكر مفتوحة", value: d.openTickets || 0, icon: Headphones, color: "text-status-error-foreground bg-status-error-surface" },
    { label: "الإيرادات", value: `${formatNumber(((d.totalRevenue || 0) / 1000))}K`, icon: DollarSign, color: "text-indigo-600 bg-indigo-50" },
  ];
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">نظرة عامة</h1>
        <GuardedButton perm="bi:export" variant="outline" size="sm" className="gap-2" onClick={() => exportChart(chartRef.current, "dashboard-overview.png")}>
          <Download className="h-4 w-4" />
          تصدير كصورة
        </GuardedButton>
      </div>
      <div ref={chartRef} className="grid grid-cols-2 md:grid-cols-4 gap-4 p-2">
        {stats.map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", s.color.split(" ")[1])}>
                <s.icon className={cn("w-5 h-5", s.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
