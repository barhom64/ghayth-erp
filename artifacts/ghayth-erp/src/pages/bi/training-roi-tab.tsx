import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { TrendingUp } from "lucide-react";
import { formatNumber } from "@/lib/formatters";

export function TrainingROITab() {
  const { data, isLoading, isError } = useApiQuery<any>(["bi-training-roi"], "/bi/reports/training-roi");
  const summary = data?.summary || {};
  const programs = (data?.byProgram || []) as any[];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">عائد الاستثمار في التدريب</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "موظفون مدربون", value: summary.trainedEmployees || 0 },
          { label: "ساعات التدريب", value: summary.totalHours || 0 },
          { label: "التكلفة الإجمالية", value: formatNumber(summary.totalCost || 0) },
          { label: "تكلفة للموظف", value: formatNumber(summary.costPerEmployee || 0) },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            {isLoading ? <CardContent className="p-6"><div className="h-12 bg-gray-100 rounded animate-pulse" /></CardContent> : (
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
      <DataTable
        data={programs}
        isLoading={isLoading}
        isError={isError}
        rowKey={(r, i) => r.programName ?? i}
        searchPlaceholder="بحث باسم البرنامج..."
        emptyMessage="لا توجد بيانات تدريب"
        emptyIcon={<TrendingUp className="h-10 w-10 opacity-30" />}
        columns={[
          { key: "programName", header: "البرنامج", sortable: true, searchable: true, className: "font-medium", render: (r) => r.programName },
          { key: "participants", header: "المشاركون", sortable: true, render: (r) => r.participants },
          { key: "totalHours", header: "الساعات", sortable: true, render: (r) => r.totalHours },
          { key: "cost", header: "التكلفة", sortable: true, render: (r) => formatNumber(r.cost) },
          { key: "costPerParticipant", header: "تكلفة/مشارك", sortable: true, render: (r) => formatNumber(r.costPerParticipant) },
          { key: "avgScore", header: "متوسط الدرجات", sortable: true, render: (r) => r.avgScore > 0 ? `${r.avgScore}%` : "-" },
        ]}
      />
    </div>
  );
}
