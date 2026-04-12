import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, DollarSign, ClipboardList, BarChart3, ChevronDown, ChevronUp } from "lucide-react";

interface ImpactItem {
  type: "financial" | "administrative" | "reporting";
  icon: string;
  label: string;
  detail: string;
}

interface ImpactCardProps {
  entityType: string;
  entityId: number;
  action: string;
}

const TYPE_STYLES = {
  financial: { color: "text-red-700", bg: "bg-red-50", border: "border-red-200", Icon: DollarSign },
  administrative: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", Icon: ClipboardList },
  reporting: { color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", Icon: BarChart3 },
};

export function ImpactCard({ entityType, entityId, action }: ImpactCardProps) {
  const [impacts, setImpacts] = useState<ImpactItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<{ impacts: ImpactItem[] }>("/impact-preview", {
      method: "POST",
      body: JSON.stringify({ entityType, entityId, action }),
    })
      .then((res) => { if (!cancelled) setImpacts(res.impacts); })
      .catch(() => { if (!cancelled) setImpacts(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, action]);

  if (loading) {
    return (
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="p-3 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!impacts || impacts.length === 0) return null;

  const financialImpacts = impacts.filter((i) => i.type === "financial");
  const adminImpacts = impacts.filter((i) => i.type === "administrative");
  const reportImpacts = impacts.filter((i) => i.type === "reporting");

  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50/50 to-orange-50/30">
      <CardHeader className="p-3 pb-0">
        <button
          className="flex items-center justify-between w-full"
          onClick={() => setExpanded(!expanded)}
        >
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            ملخص الأثر المتوقع
          </CardTitle>
          {expanded ? <ChevronUp className="h-4 w-4 text-amber-600" /> : <ChevronDown className="h-4 w-4 text-amber-600" />}
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="p-3 pt-2 space-y-2">
          {[
            { items: financialImpacts, label: "الأثر المالي", key: "financial" },
            { items: adminImpacts, label: "الأثر الإداري", key: "administrative" },
            { items: reportImpacts, label: "الأثر على التقارير", key: "reporting" },
          ]
            .filter((g) => g.items.length > 0)
            .map((group) => {
              const style = TYPE_STYLES[group.key as keyof typeof TYPE_STYLES];
              return (
                <div key={group.key} className={`rounded-lg p-2 ${style.bg} border ${style.border}`}>
                  <div className={`text-xs font-semibold mb-1 flex items-center gap-1.5 ${style.color}`}>
                    <style.Icon className="h-3.5 w-3.5" />
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-700">
                        <span>{item.icon}</span>
                        <span>
                          <span className="font-medium">{item.label}:</span> {item.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          <div className="text-[10px] text-gray-400 text-center pt-1">
            هذا تقدير للأثر المتوقع — سيتم التنفيذ الفعلي عند التأكيد
          </div>
        </CardContent>
      )}
    </Card>
  );
}
