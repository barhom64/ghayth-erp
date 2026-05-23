import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, CheckCircle, XCircle, Info, AlertTriangle, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { cn } from "@/lib/utils";
import { CreatePageLayout } from "@workspace/ui-core";

const STATUS_OPTIONS = [
  { value: "available", label: "متاحة" },
  { value: "rented", label: "مؤجرة" },
  { value: "maintenance", label: "صيانة" },
  { value: "reserved", label: "محجوزة" },
  { value: "under_maintenance", label: "تحت الصيانة" },
  { value: "out_of_service", label: "خارج الخدمة" },
];

const STATUS_LABELS: Record<string, string> = {
  available: "متاحة", rented: "مؤجرة", maintenance: "صيانة", reserved: "محجوزة",
  under_maintenance: "تحت الصيانة", out_of_service: "خارج الخدمة",
};

const STATUS_COLORS: Record<string, string> = {
  available: "border-status-success-surface text-status-success-foreground bg-status-success-surface",
  rented: "border-status-info-surface text-status-info-foreground bg-status-info-surface",
  maintenance: "border-yellow-300 text-status-warning-foreground bg-status-warning-surface",
  reserved: "border-purple-300 text-purple-700 bg-purple-50",
  under_maintenance: "border-orange-300 text-orange-700 bg-orange-50",
  out_of_service: "border-status-error-surface text-status-error-foreground bg-status-error-surface",
};

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

export default function UnitStatusChangePage() {
  const [, params] = useRoute("/properties/:id/status") as [boolean, { id: string }];
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const id = params?.id;

  const { data: unit, isLoading } = useApiQuery<any>(["unit-detail", id || ""], `/properties/units/${id}`, !!id);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("properties_unit_status_change", { selectedNewStatus: "" });
  const { fieldErrors, validate } = useFieldErrors();
  const [impactData, setImpactData] = useState<any>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const selectedNewStatus = form.selectedNewStatus;
  const setSelectedNewStatus = (v: string) => setForm(f => ({ ...f, selectedNewStatus: v }));

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
      clearDraft();
      qc.invalidateQueries({ queryKey: ["unit-detail", id] });
      qc.invalidateQueries({ queryKey: ["property-units"] });
      setLocation(`/properties/${id}`);
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    } finally {
      setConfirming(false);
    }
  };

  if (isLoading) return <div className="text-center py-20 text-muted-foreground">جاري التحميل...</div>;
  if (!unit) return <div className="text-center py-20 text-muted-foreground">الوحدة غير موجودة</div>;

  return (
    <CreatePageLayout
      title="تغيير حالة الوحدة"
      subtitle={unit.unitNumber || unit.name || `وحدة #${id}`}
      backPath={`/properties/${id}`}
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
        <Button variant="outline" onClick={() => setLocation(`/properties/${id}`)}>إلغاء</Button>
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
