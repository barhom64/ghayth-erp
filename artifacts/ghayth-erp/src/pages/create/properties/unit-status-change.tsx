import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Pencil, CheckCircle, XCircle, Info, AlertTriangle, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "available", label: "متاحة" },
  { value: "occupied", label: "مشغولة" },
  { value: "maintenance", label: "صيانة" },
  { value: "reserved", label: "محجوزة" },
];

const STATUS_LABELS: Record<string, string> = {
  available: "متاحة", occupied: "مشغولة", maintenance: "صيانة", reserved: "محجوزة",
};

const STATUS_COLORS: Record<string, string> = {
  available: "border-green-300 text-green-700 bg-green-50",
  occupied: "border-blue-300 text-blue-700 bg-blue-50",
  maintenance: "border-yellow-300 text-yellow-700 bg-yellow-50",
  reserved: "border-purple-300 text-purple-700 bg-purple-50",
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "border-blue-200 bg-blue-50",
  warning: "border-yellow-200 bg-yellow-50",
  danger: "border-red-200 bg-red-50",
};

const SEVERITY_ICON: Record<string, any> = {
  info: Info,
  warning: AlertTriangle,
  danger: ShieldAlert,
};

export default function UnitStatusChangePage() {
  const [, params] = useRoute("/properties/:id/status") as [boolean, { id: string }];
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const id = params?.id;

  const { data: unit, isLoading } = useApiQuery<any>(["unit-detail", id || ""], `/properties/units/${id}`, !!id);

  const [selectedNewStatus, setSelectedNewStatus] = useState("");
  const [impactData, setImpactData] = useState<any>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const loadImpactPreview = async (newStatus: string) => {
    if (!newStatus || !id) return;
    setSelectedNewStatus(newStatus);
    setImpactLoading(true);
    try {
      const data = await apiFetch(`/properties/units/${id}/impact-preview?status=${newStatus}`);
      setImpactData(data);
    } catch {
      setImpactData(null);
    } finally {
      setImpactLoading(false);
    }
  };

  const applyStatusChange = async () => {
    if (!selectedNewStatus || !id) return;
    setConfirming(true);
    try {
      await apiFetch(`/properties/units/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: selectedNewStatus }),
      });
      toast({ title: "تم تغيير الحالة بنجاح" });
      qc.invalidateQueries({ queryKey: ["unit-detail", id] });
      qc.invalidateQueries({ queryKey: ["property-units"] });
      setLocation(`/properties/${id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ", description: err.message });
    } finally {
      setConfirming(false);
    }
  };

  if (isLoading) return <div className="text-center py-20 text-gray-400">جاري التحميل...</div>;
  if (!unit) return <div className="text-center py-20 text-gray-400">الوحدة غير موجودة</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/properties/${id}`}>
          <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">تغيير حالة الوحدة</h1>
          <p className="text-gray-500 text-sm mt-1">{unit.unitNumber || unit.name || `وحدة #${id}`}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Pencil className="h-5 w-5 text-blue-500" /> تغيير الحالة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-gray-500">
            الحالة الحالية: <Badge className={cn("border", STATUS_COLORS[unit.status])}>{STATUS_LABELS[unit.status] || unit.status}</Badge>
          </p>

          <div>
            <p className="text-sm font-medium mb-3">اختر الحالة الجديدة:</p>
            <div className="grid grid-cols-2 gap-3">
              {STATUS_OPTIONS.filter(o => o.value !== unit.status).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => loadImpactPreview(opt.value)}
                  className={cn(
                    "p-4 rounded-lg border-2 text-sm font-medium transition-all text-start",
                    selectedNewStatus === opt.value ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {impactLoading && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {impactData && !impactLoading && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-700">التأثيرات المتوقعة:</p>
              {impactData.blockers?.length > 0 && (
                <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 space-y-1">
                  <p className="text-sm font-semibold text-red-700 flex items-center gap-1">
                    <XCircle className="h-4 w-4" /> موانع التنفيذ
                  </p>
                  {impactData.blockers.map((b: string, i: number) => (
                    <p key={i} className="text-sm text-red-600">• {b}</p>
                  ))}
                </div>
              )}
              {impactData.impacts?.map((impact: any, i: number) => {
                const SeverityIcon = SEVERITY_ICON[impact.severity as keyof typeof SEVERITY_ICON] || Info;
                return (
                  <div key={i} className={cn("rounded-lg border p-3 flex gap-3", SEVERITY_COLORS[impact.severity as keyof typeof SEVERITY_COLORS])}>
                    <SeverityIcon className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{impact.title}</p>
                      <p className="text-xs mt-0.5 opacity-90">{impact.description}</p>
                    </div>
                  </div>
                );
              })}
              {impactData.impacts?.length === 0 && impactData.blockers?.length === 0 && (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-lg p-3 text-sm">
                  <CheckCircle className="h-4 w-4" /> لا توجد تأثيرات مهمة لهذا التغيير
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href={`/properties/${id}`}>
          <Button variant="outline">إلغاء</Button>
        </Link>
        <Button
          disabled={!selectedNewStatus || !impactData || !impactData.canProceed || confirming}
          onClick={applyStatusChange}
        >
          {confirming ? "جاري التطبيق..." : "تطبيق التغيير"}
        </Button>
      </div>
    </div>
  );
}
