import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageStatusBadge } from "@workspace/ui-core";
import { Pencil, CheckCircle, XCircle, Info, AlertTriangle, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { cn } from "@/lib/utils";
import { CreatePageLayout } from "@workspace/ui-core";

const VEHICLE_STATUS_OPTIONS = [
  { value: "available", label: "متاحة" },
  { value: "in_use", label: "قيد الاستخدام" },
  { value: "maintenance", label: "في الصيانة" },
  { value: "out_of_service", label: "خارج الخدمة" },
];

const SEVERITY_COLORS: Record<string, string> = {
  info: "border-status-info-surface bg-status-info-surface",
  warning: "border-status-warning-surface bg-status-warning-surface",
  danger: "border-status-error-surface bg-status-error-surface",
};

const SEVERITY_ICON: Record<string, any> = {
  info: Info,
  warning: AlertTriangle,
  danger: ShieldAlert,
};

export default function VehicleStatusChangePage() {
  const [, params] = useRoute("/fleet/:id/status") as [boolean, { id: string }];
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const id = params?.id;

  const { data: vehicle, isLoading } = useApiQuery<any>(["vehicle-detail", id || ""], `/fleet/vehicles/${id}`, !!id);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("fleet_vehicle_status_change", {
    selectedNewStatus: "",
  });
  const { fieldErrors, validate } = useFieldErrors();
  const selectedNewStatus = form.selectedNewStatus;
  const setSelectedNewStatus = (v: string) => setForm(f => ({ ...f, selectedNewStatus: v }));
  const [impactData, setImpactData] = useState<any>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const loadImpactPreview = async (newStatus: string) => {
    if (!newStatus || !id) return;
    setSelectedNewStatus(newStatus);
    setImpactLoading(true);
    try {
      const data = await apiFetch(`/fleet/vehicles/${id}/impact-preview?status=${newStatus}`);
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
      await apiFetch(`/fleet/vehicles/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: selectedNewStatus }),
      });
      clearDraft();
      toast({ title: "تم تغيير الحالة بنجاح" });
      qc.invalidateQueries({ queryKey: ["vehicle-detail", id] });
      qc.invalidateQueries({ queryKey: ["fleet-vehicles"] });
      setLocation(`/fleet/${id}`);
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    } finally {
      setConfirming(false);
    }
  };

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">جاري التحميل...</div>;
  if (!vehicle) return <div className="text-center py-20 text-muted-foreground">المركبة غير موجودة</div>;

  return (
    <CreatePageLayout
      title="تغيير حالة المركبة"
      subtitle={`${vehicle.plateNumber || vehicle.make} ${vehicle.model}`}
      backPath={`/fleet/${id}`}
    >
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="space-y-5">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Pencil className="h-5 w-5 text-status-info" /> تغيير الحالة
        </h3>
        <p className="text-sm text-muted-foreground">
            الحالة الحالية: <PageStatusBadge status={vehicle.status} domain="vehicle" />
          </p>

          <div>
            <p className="text-sm font-medium mb-3">اختر الحالة الجديدة:</p>
            <div className="grid grid-cols-2 gap-3">
              {VEHICLE_STATUS_OPTIONS.filter(o => o.value !== vehicle.status).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => loadImpactPreview(opt.value)}
                  className={cn(
                    "p-4 rounded-lg border-2 text-sm font-medium transition-all text-start",
                    selectedNewStatus === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-border"
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
              <p className="text-sm font-semibold text-status-neutral-foreground">التأثيرات المتوقعة:</p>
              {impactData.blockers?.length > 0 && (
                <div className="rounded-lg border-2 border-status-error-surface bg-status-error-surface p-3 space-y-1">
                  <p className="text-sm font-semibold text-status-error-foreground flex items-center gap-1">
                    <XCircle className="h-4 w-4" /> موانع التنفيذ
                  </p>
                  {impactData.blockers.map((b: string, i: number) => (
                    <p key={i} className="text-sm text-status-error-foreground">• {b}</p>
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
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation(`/fleet/${id}`)}>إلغاء</Button>
        <Button
          disabled={!selectedNewStatus || !impactData || !impactData.canProceed || confirming}
          onClick={applyStatusChange}
          rateLimitAware
        >
          {confirming ? "جاري التطبيق..." : "تطبيق التغيير"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
