import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import {
  Activity, AlertTriangle, ArrowUpRight, Building, Car, CheckCircle2,
  Clock, CreditCard, CloudRain, Home, RefreshCw, Shield, Timer, Users,
  Wrench, Zap, ChevronLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const SECTION_ICONS: Record<string, any> = {
  umrah: CloudRain,
  property: Home,
  hr: Users,
  finance: CreditCard,
  fleet: Car,
};

const SECTION_COLORS: Record<string, string> = {
  umrah: "text-purple-600",
  property: "text-blue-600",
  hr: "text-teal-600",
  finance: "text-green-600",
  fleet: "text-orange-600",
};

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  ok: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", dot: "bg-green-500" },
  warning: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", dot: "bg-yellow-500" },
  critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" },
};

const ACTION_LABELS: Record<string, string> = {
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  approve: "اعتماد",
  reject: "رفض",
  daily_close: "إقفال يومي",
};

const ENTITY_LABELS: Record<string, string> = {
  employee: "موظف",
  client: "عميل",
  invoice: "فاتورة",
  leave_request: "إجازة",
  expense: "مصروف",
  task: "مهمة",
  support_ticket: "تذكرة",
  daily_close: "إقفال يومي",
  vehicle: "مركبة",
  property: "عقار",
  voucher: "سند",
  attendance: "حضور",
  system: "نظام",
};

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

export default function OperationsCenter() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["operations-center", scopeQueryString, String(refreshKey)],
    `/operations-center${scopeSuffix}`
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const sections = data?.sections || {};
  const slaItems = data?.slaItems || [];
  const liveFeed = data?.liveFeed || [];

  const sectionOrder = ["umrah", "property", "hr", "finance", "fleet"];

  const totalCritical = (Object.values(sections) as any[]).reduce((acc: number, sec: any) => {
    return acc + (sec?.cards || []).filter((c: any) => c.severity === "critical").length;
  }, 0) as number;
  const totalWarning = (Object.values(sections) as any[]).reduce((acc: number, sec: any) => {
    return acc + (sec?.cards || []).filter((c: any) => c.severity === "warning").length;
  }, 0) as number;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            مركز العمليات
          </h1>
          <p className="text-gray-500 mt-1">نظرة شاملة على حالة التشغيل الآن</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/daily-close">
            <Button variant="outline" className="gap-2">
              <Shield className="w-4 h-4" />
              الإقفال اليومي
            </Button>
          </Link>
          <Button variant="outline" size="icon" onClick={() => { setRefreshKey(k => k + 1); refetch(); }}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={cn("rounded-xl p-4 border-2 text-center", totalCritical > 0 ? "border-red-200 bg-red-50" : "border-gray-100 bg-white")}>
          <p className="text-3xl font-black text-gray-900">{totalCritical}</p>
          <p className="text-sm text-gray-500 mt-1">حرج</p>
        </div>
        <div className={cn("rounded-xl p-4 border-2 text-center", totalWarning > 0 ? "border-yellow-200 bg-yellow-50" : "border-gray-100 bg-white")}>
          <p className="text-3xl font-black text-gray-900">{totalWarning}</p>
          <p className="text-sm text-gray-500 mt-1">تحذير</p>
        </div>
        <div className="rounded-xl p-4 border-2 border-gray-100 bg-white text-center">
          <p className="text-3xl font-black text-gray-900">{slaItems.length}</p>
          <p className="text-sm text-gray-500 mt-1">تجاوز مستوى الخدمة</p>
        </div>
        <div className="rounded-xl p-4 border-2 border-gray-100 bg-white text-center">
          <p className="text-3xl font-black text-gray-900">{Object.keys(sections).length}</p>
          <p className="text-sm text-gray-500 mt-1">أقسام نشطة</p>
        </div>
      </div>

      {sectionOrder.map((key) => {
        const section = sections[key];
        if (!section) return null;
        const SectionIcon = SECTION_ICONS[key] || Activity;
        const sectionColor = SECTION_COLORS[key] || "text-gray-600";
        return (
          <Card key={key} className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <SectionIcon className={cn("w-5 h-5", sectionColor)} />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {(section.cards || []).map((card: any) => {
                  const style = SEVERITY_STYLES[card.severity] || SEVERITY_STYLES.ok;
                  return (
                    <div key={card.key} className={cn("rounded-xl p-4 border-2 relative", style.bg, style.border)}>
                      <div className="flex items-start justify-between mb-2">
                        <div className={cn("w-2.5 h-2.5 rounded-full mt-1", style.dot)} />
                        <span className={cn("text-3xl font-black", style.text)}>{typeof card.value === "number" && Math.abs(card.value) >= 1000 ? card.value.toLocaleString() : card.value}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-800 mb-1">{card.label}</p>
                      {card.extra && <p className="text-xs text-gray-500 mb-2">{card.extra}</p>}
                      <Link href={card.actionLink || "#"}>
                        <Button size="sm" variant="outline" className="w-full gap-1 text-xs mt-1">
                          {card.actionLabel}
                          <ArrowUpRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {slaItems.length > 0 && (
          <Card className="border-0 shadow-sm border-s-4 border-s-red-400">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Timer className="w-5 h-5 text-red-500" />
                عناصر تجاوزت مستوى الخدمة
                <Badge variant="destructive" className="text-xs">{slaItems.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {slaItems.map((item: any, i: number) => (
                  <Link key={`${item.type}-${item.id}-${i}`} href={item.entityLink || "#"}>
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-red-50/50 transition-colors cursor-pointer border border-red-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {item.title || `#${item.id}`}
                        </p>
                        <p className="text-xs text-red-500">
                          متأخر بـ {item.hoursOverdue} ساعة
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className={cn("text-[10px]",
                          item.escalationStatus === "critical_escalation" ? "bg-red-200 text-red-800 border-red-300" :
                          item.escalationStatus === "escalated" ? "bg-orange-100 text-orange-700 border-orange-200" :
                          "bg-amber-100 text-amber-700 border-amber-200"
                        )}>
                          {item.escalationStatus === "critical_escalation" ? "تصعيد حرج" :
                           item.escalationStatus === "escalated" ? "مُصعّد" : "متأخر"}
                        </Badge>
                        {item.priority && (
                          <Badge variant="outline" className={cn("text-[10px]",
                            item.priority === "critical" || item.priority === "urgent" ? "bg-red-100 text-red-700" :
                            item.priority === "high" ? "bg-orange-100 text-orange-700" : ""
                          )}>
                            {item.priority}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              التغذية الحية
              <Badge className="text-xs bg-blue-100 text-blue-700">{liveFeed.length}</Badge>
            </CardTitle>
            <Link href="/activity-log">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                عرض الكل <ChevronLeft className="w-3 h-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {liveFeed.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-10 h-10 text-green-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">لا توجد أحداث حديثة</p>
                </div>
              ) : (
                liveFeed.slice(0, 50).map((event: any, i: number) => (
                  <div key={`${event.id}-${i}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate">
                        <span className="font-medium">{event.userName || "النظام"}</span>
                        {" "}
                        {ACTION_LABELS[event.action] || event.action}
                        {" "}
                        {ENTITY_LABELS[event.entity] || event.entity}
                        {event.entityId ? ` #${event.entityId}` : ""}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {event.createdAt ? formatTimeAgo(event.createdAt) : ""}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
