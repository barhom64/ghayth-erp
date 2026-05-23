import { Link } from "wouter";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveStatus } from "@workspace/ui-core";

interface SecondaryAlertsSectionProps {
  overdueItems: any[];
  expiringSoon: any[];
}

export function SecondaryAlertsSection({ overdueItems, expiringSoon }: SecondaryAlertsSectionProps) {
  if (overdueItems.length === 0 && expiringSoon.length === 0) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {overdueItems.length > 0 && (
        <Card className="border-0 shadow-sm border-s-4 border-s-red-400">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-status-error" />
              عناصر متأخرة
              <Badge variant="destructive" className="text-xs">{overdueItems.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueItems.slice(0, 5).map((item: any, idx: number) => (
                <Link key={`overdue-${idx}`} href={item.itemType === "task" ? `/tasks/${item.id}` : "/hr/leaves"}>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-status-error-surface hover:bg-status-error-surface transition-colors cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.title}</p>
                      <p className="text-xs text-status-error">
                        {item.itemType === "task" ? "مهمة متأخرة" : "طلب معلق"}
                        {item.deadline && ` — ${formatDateAr(item.deadline)}`}
                      </p>
                    </div>
                    <Badge className="text-[10px] bg-status-error-surface text-status-error-foreground shrink-0">{resolveStatus(item.status)?.label || item.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {expiringSoon.length > 0 && (
        <Card className="border-0 shadow-sm border-s-4 border-s-amber-400">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-status-warning" />
              يحتاج تجديد قريبا
              <Badge className="text-xs bg-status-warning-surface text-status-warning-foreground">{expiringSoon.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringSoon.slice(0, 5).map((item: any, idx: number) => {
                const daysLeft = item.expiryDate ? Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000) : 0;
                return (
                  <div key={`expiring-${idx}`} className="flex items-center justify-between p-2.5 rounded-lg bg-status-warning-surface/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-status-neutral-foreground truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.itemType === "document" ? "مستند" : "عقد"}
                      </p>
                    </div>
                    <Badge className={cn("text-[10px] shrink-0", daysLeft <= 7 ? "bg-status-error-surface text-status-error-foreground" : "bg-status-warning-surface text-status-warning-foreground")}>
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
