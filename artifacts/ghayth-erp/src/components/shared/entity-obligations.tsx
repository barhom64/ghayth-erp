import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { Link } from "wouter";

interface Props {
  entityType: string;
  entityId: number | string;
  /** Hide the card entirely when there are no obligations (rather than show empty state). */
  hideWhenEmpty?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  breached: "bg-red-100 text-red-700",
  escalated_l1: "bg-orange-100 text-orange-700",
  escalated_l2: "bg-red-200 text-red-800",
  met: "bg-green-100 text-green-700",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "معلق",
  breached: "متجاوز",
  escalated_l1: "تصعيد 1",
  escalated_l2: "تصعيد 2",
  met: "ملبى",
  cancelled: "ملغى",
};

/**
 * Shared card showing all obligations registered against a specific entity
 * (e.g. a contract, invoice, vehicle, or project). Makes detail pages
 * "aware" of upcoming deadlines registered via the obligations engine.
 */
export function EntityObligations({ entityType, entityId, hideWhenEmpty }: Props) {
  const { data, isLoading } = useApiQuery<any>(
    ["entity-obligations", entityType, String(entityId)],
    `/obligations?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}&limit=20`,
    !!entityId
  );

  if (isLoading) return null;
  const list: any[] = data?.data || data || [];

  if (list.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            الالتزامات الزمنية
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-300" />
          لا توجد التزامات مسجلة
        </CardContent>
      </Card>
    );
  }

  const overdue = list.filter((o) =>
    (o.status === "pending" || o.status === "breached" || o.status?.startsWith("escalated")) &&
    o.dueAt && new Date(o.dueAt) < new Date()
  );

  return (
    <Card className={overdue.length > 0 ? "border-red-200" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          الالتزامات الزمنية
          <Badge variant="outline" className="text-xs">{list.length}</Badge>
          {overdue.length > 0 && (
            <Badge className="bg-red-100 text-red-700 text-[10px] gap-1">
              <AlertTriangle className="h-3 w-3" /> {overdue.length} متأخر
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.slice(0, 5).map((o) => {
          const isOverdue = o.dueAt && new Date(o.dueAt) < new Date() &&
            o.status !== "met" && o.status !== "cancelled";
          return (
            <div key={o.id} className={`flex items-center justify-between text-xs p-2 rounded ${isOverdue ? "bg-red-50" : "bg-muted/30"}`}>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{o.title}</p>
                {o.dueAt && (
                  <p className={`text-[10px] ${isOverdue ? "text-red-600" : "text-muted-foreground"}`}>
                    استحقاق: {formatDateAr(o.dueAt)}
                  </p>
                )}
              </div>
              <Badge className={`text-[10px] ${STATUS_COLORS[o.status] || "bg-gray-100"}`}>
                {STATUS_LABELS[o.status] || o.status}
              </Badge>
            </div>
          );
        })}
        {list.length > 5 && (
          <Link href="/obligations">
            <div className="text-xs text-center text-primary hover:underline cursor-pointer pt-1">
              عرض جميع {list.length} التزام →
            </div>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
