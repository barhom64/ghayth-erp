import { Link } from "wouter";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertsSectionProps {
  overdueItems: any[];
  expiringSoon: any[];
}

export function AlertsSection({ overdueItems, expiringSoon }: AlertsSectionProps) {
  if (overdueItems.length === 0 && expiringSoon.length === 0) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {overdueItems.length > 0 && (
        <Card className="border-0 shadow-sm border-t-4 border-t-red-400">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-status-error" />
              عناصر متأخرة
              <Badge variant="destructive" className="text-xs">{overdueItems.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueItems.slice(0, 5).map((item: any, i: number) => (
                <Link key={`overdue-${i}`} href={item.type === "task" ? `/tasks` : "/hr/leaves"}>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-status-error-surface hover:bg-status-error-surface transition-colors cursor-pointer">
                    <div className="w-2 h-2 rounded-full bg-status-error-surface0 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.title}</p>
                      <p className="text-xs text-status-error">
                        {item.type === "task" ? "مهمة" : "طلب"} — مستحق: {item.deadline ? formatDateAr(item.deadline) : ""}
                      </p>
                    </div>
                    {item.priority && (
                      <Badge className={cn("text-[10px] shrink-0",
                        item.priority === "high" || item.priority === "urgent" ? "bg-status-error-surface text-status-error-foreground" : "bg-status-warning-surface text-status-warning-foreground"
                      )}>
                        {item.priority === "high" ? "عاجل" : item.priority === "urgent" ? "طارئ" : "متوسط"}
                      </Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {expiringSoon.length > 0 && (
        <Card className="border-0 shadow-sm border-t-4 border-t-amber-400">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Hourglass className="w-5 h-5 text-status-warning" />
              قريب الانتهاء
              <Badge className="text-xs bg-status-warning-surface text-status-warning-foreground">{expiringSoon.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringSoon.slice(0, 5).map((item: any, i: number) => {
                const daysLeft = Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000);
                const categoryLabels: Record<string, string> = { document: "مستند", contract: "عقد", insurance: "تأمين" };
                return (
                  <div key={`expiring-${i}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-status-warning-surface/50">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", daysLeft <= 7 ? "bg-status-error-surface0" : "bg-status-warning-surface0")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.name || item.title}</p>
                      <p className="text-xs text-muted-foreground">{categoryLabels[item.category] || item.category}</p>
                    </div>
                    <Badge className={cn("text-[10px] shrink-0",
                      daysLeft <= 7 ? "bg-status-error-surface text-status-error-foreground" : "bg-status-warning-surface text-status-warning-foreground"
                    )}>
                      {daysLeft <= 0 ? "منتهي" : `${daysLeft} يوم`}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
