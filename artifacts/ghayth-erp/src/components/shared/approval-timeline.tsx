import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, RotateCcw, Clock, ArrowUpCircle, ArrowLeftRight, AlertCircle } from "lucide-react";

const ACTION_CONFIG: Record<string, { label: string; icon: any; color: string; bgColor: string }> = {
  approved: { label: "موافقة", icon: CheckCircle, color: "text-status-success-foreground", bgColor: "bg-green-100" },
  rejected: { label: "رفض", icon: XCircle, color: "text-status-error-foreground", bgColor: "bg-red-100" },
  returned: { label: "إرجاع", icon: RotateCcw, color: "text-orange-600", bgColor: "bg-orange-100" },
  pending: { label: "قيد المراجعة", icon: Clock, color: "text-status-info-foreground", bgColor: "bg-blue-100" },
  in_review: { label: "قيد المراجعة", icon: Clock, color: "text-status-info-foreground", bgColor: "bg-blue-100" },
  escalated: { label: "تصعيد", icon: ArrowUpCircle, color: "text-purple-600", bgColor: "bg-purple-100" },
  referred: { label: "إحالة", icon: ArrowLeftRight, color: "text-indigo-600", bgColor: "bg-indigo-100" },
  created: { label: "إنشاء", icon: AlertCircle, color: "text-muted-foreground", bgColor: "bg-gray-100" },
};

interface ApprovalTimelineProps {
  entityType: string;
  entityId: number | string;
  title?: string;
}

export function ApprovalTimeline({ entityType, entityId, title = "مسار الاعتماد" }: ApprovalTimelineProps) {
  const { data } = useApiQuery<any>(
    ["approval-actions", entityType, String(entityId)],
    `/approval-actions/${entityType}/${entityId}`
  );
  const actions = data?.data || [];

  if (actions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="absolute start-4 top-0 bottom-0 w-0.5 bg-gray-200" />
          <div className="space-y-4">
            {actions.map((action: any, index: number) => {
              const config = ACTION_CONFIG[action.action] || ACTION_CONFIG.created;
              const Icon = config.icon;
              const isLast = index === actions.length - 1;

              return (
                <div key={action.id || index} className="relative flex gap-3 ps-2">
                  <div className={cn(
                    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    config.bgColor
                  )}>
                    <Icon className={cn("h-4 w-4", config.color)} />
                  </div>
                  <div className={cn("flex-1 pb-3", !isLast && "border-b border-border")}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge className={cn("text-[10px]", config.bgColor, config.color)}>
                          {config.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {action.actionByName || action.actionByEmail || "النظام"}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDateAr(action.createdAt)}
                      </span>
                    </div>
                    {action.notes && (
                      <p className="mt-1 text-xs text-muted-foreground bg-surface-subtle rounded p-2">
                        {action.notes}
                      </p>
                    )}
                    {action.referredToName && (
                      <p className="mt-1 text-xs text-indigo-600">
                        محال إلى: {action.referredToName}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
