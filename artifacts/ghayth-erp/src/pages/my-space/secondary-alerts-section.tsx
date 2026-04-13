import { Link } from "wouter";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusLabels } from "./shared";

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
              <AlertCircle className="w-5 h-5 text-red-500" />
              عناصر متأخرة
              <Badge variant="destructive" className="text-xs">{overdueItems.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueItems.slice(0, 5).map((item: any, idx: number) => (
                <Link key={`overdue-${idx}`} href={item.itemType === "task" ? `/tasks/${item.id}` : "/hr/leaves"}>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-red-50/50 hover:bg-red-50 transition-colors cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                      <p className="text-xs text-red-500">
                        {item.itemType === "task" ? "مهمة متأخرة" : "طلب معلق"}
                        {item.deadline && ` — ${formatDateAr(item.deadline)}`}
                      </p>
                    </div>
                    <Badge className="text-[10px] bg-red-100 text-red-700 shrink-0">{statusLabels[item.status]?.label || item.status}</Badge>
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
              <RefreshCw className="w-5 h-5 text-amber-500" />
              يحتاج تجديد قريبا
              <Badge className="text-xs bg-amber-100 text-amber-700">{expiringSoon.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringSoon.slice(0, 5).map((item: any, idx: number) => {
                const daysLeft = item.expiryDate ? Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000) : 0;
                return (
                  <div key={`expiring-${idx}`} className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                      <p className="text-xs text-gray-500">
                        {item.itemType === "document" ? "مستند" : "عقد"}
                      </p>
                    </div>
                    <Badge className={cn("text-[10px] shrink-0", daysLeft <= 7 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
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
