import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, ListTodo, DollarSign, FolderKanban } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface Props {
  employeeId: string | number;
  compact?: boolean;
}

export function ManagerWorkloadCard({ employeeId, compact = false }: Props) {
  const { data, isLoading } = useApiQuery<any>(
    ["manager-workload", String(employeeId)],
    `/projects/manager/${employeeId}/workload`,
    !!employeeId
  );

  if (!employeeId) return null;
  if (isLoading) {
    return (
      <Card className="border-dashed"><CardContent className="py-4 text-sm text-muted-foreground text-center">جارٍ تحميل عبء العمل...</CardContent></Card>
    );
  }
  if (!data) return null;

  const p = data.projects;
  const t = data.tasks;
  const overloaded = p.slipping > 0 || t.overdue > 3 || p.active > 5;

  return (
    <Card className={cn("border-2", overloaded ? "border-orange-200 bg-orange-50/30" : "border-blue-100 bg-blue-50/30")}>
      <CardContent className={cn("p-3", compact && "p-2")}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground">عبء المدير الحالي</span>
          {overloaded && <Badge className="bg-orange-100 text-orange-700 text-[10px]">مرهق</Badge>}
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div>
            <div className="flex items-center justify-center gap-1 text-blue-600">
              <Activity className="w-3 h-3" /> <span className="font-bold text-base">{p.active}</span>
            </div>
            <p className="text-muted-foreground">نشط</p>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1 text-red-600">
              <AlertTriangle className="w-3 h-3" /> <span className="font-bold text-base">{p.slipping}</span>
            </div>
            <p className="text-muted-foreground">متأخر</p>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1 text-purple-600">
              <ListTodo className="w-3 h-3" /> <span className="font-bold text-base">{t.open}</span>
            </div>
            <p className="text-muted-foreground">مهام مفتوحة</p>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1 text-orange-600">
              <AlertTriangle className="w-3 h-3" /> <span className="font-bold text-base">{t.overdue}</span>
            </div>
            <p className="text-muted-foreground">متأخرة</p>
          </div>
        </div>
        {p.activeBudget > 0 && !compact && (
          <div className="mt-2 pt-2 border-t text-xs flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> ميزانية مشاريعه النشطة
            </span>
            <span className="font-semibold">{formatCurrency(p.activeBudget)}</span>
          </div>
        )}
        {data.recent?.length > 0 && !compact && (
          <div className="mt-2 space-y-1">
            {data.recent.slice(0, 3).map((r: any) => (
              <Link key={r.id} href={`/projects/${r.id}`}>
                <div className="flex items-center justify-between text-xs py-1 hover:bg-white/60 rounded px-1 cursor-pointer">
                  <span className="flex items-center gap-1"><FolderKanban className="w-3 h-3 text-muted-foreground" /> {r.name}</span>
                  <span className="text-muted-foreground">{r.progress || 0}%</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
