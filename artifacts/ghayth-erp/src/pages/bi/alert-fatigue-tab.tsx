import { z } from "zod";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DataTable,
  FormShell,
  FormGrid,
  FormTextField,
  FormSelectField,
} from "@workspace/ui-core";
import { BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { usePermission } from "@/components/shared/permission-gate";

const muteSchema = z.object({
  alertType: z.string().min(1, "أدخل نوع التنبيه"),
  muteHours: z.string(),
});

const MUTE_HOURS_OPTIONS = [
  { value: "1", label: "ساعة واحدة" },
  { value: "4", label: "4 ساعات" },
  { value: "8", label: "8 ساعات" },
  { value: "24", label: "يوم كامل" },
  { value: "72", label: "3 أيام" },
];

export function AlertFatigueTab() {
  const { data: dcData, isLoading, isError } = useApiQuery<any>(["alert-daily-count"], "/bi/alert-fatigue/daily-count");
  const { data: settingsData } = useApiQuery<any>(["alert-fatigue-settings"], "/bi/alert-fatigue/settings");
  const { toast } = useToast();
  const canMute = usePermission("bi:create");

  const handleMute = async (values: { alertType: string; muteHours: string }) => {
    try {
      const muteUntil = new Date(Date.now() + Number(values.muteHours) * 3600000).toISOString();
      await apiFetch("/bi/alert-fatigue/mute", { method: "POST", body: JSON.stringify({ alertType: values.alertType, muteUntil }) });
      toast({ title: "تم كتم التنبيهات", description: `سيتم كتم "${values.alertType}" لمدة ${values.muteHours} ساعة` });
    } catch {
      toast({ title: "خطأ", variant: "destructive" });
    }
  };

  const dc = dcData || {};
  const settings = (settingsData?.data || []) as any[];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold flex items-center gap-2"><BellOff className="h-6 w-6 text-muted-foreground" />إدارة التنبيهات — منع الإرهاق</h2>

      <div className="grid grid-cols-3 gap-4">
        <Card className={cn("border-0 shadow-sm", dc.isOverLimit ? "bg-status-error-surface" : "bg-emerald-50")}>
          <CardContent className="p-4 text-center">
            <p className={cn("text-2xl font-bold", dc.isOverLimit ? "text-status-error-foreground" : "text-emerald-600")}>{dc.todayCount || 0}</p>
            <p className="text-xs text-muted-foreground">تنبيهات اليوم</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-status-neutral-foreground">{dc.dailyLimit || 50}</p>
            <p className="text-xs text-muted-foreground">الحد اليومي</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className={cn("text-2xl font-bold", dc.isOverLimit ? "text-status-error-foreground" : "text-emerald-600")}>
              {dc.isOverLimit ? "تجاوز الحد" : "ضمن الحد"}
            </p>
            <p className="text-xs text-muted-foreground">الحالة</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>كتم نوع تنبيه مؤقتاً</CardTitle></CardHeader>
        <CardContent>
          <FormShell
            schema={muteSchema}
            defaultValues={{ alertType: "", muteHours: "24" }}
            submitLabel="كتم"
            disabled={!canMute}
            onSubmit={handleMute}
          >
            <FormGrid cols={2}>
              <FormTextField name="alertType" label="نوع التنبيه" placeholder="invoice_overdue" required />
              <FormSelectField name="muteHours" label="المدة" options={MUTE_HOURS_OPTIONS} />
            </FormGrid>
          </FormShell>
        </CardContent>
      </Card>

      {settings.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-status-neutral-foreground">قواعد الكتم النشطة</h3>
          <DataTable
            data={settings}
            rowKey={(s, i) => s.alertType ?? i}
            searchPlaceholder="بحث بنوع التنبيه..."
            emptyMessage="لا توجد قواعد كتم"
            columns={[
              { key: "alertType", header: "نوع التنبيه", sortable: true, searchable: true, className: "font-mono text-sm", render: (s) => s.alertType },
              { key: "muteUntil", header: "مكتوم حتى", sortable: true, className: "text-sm", render: (s) => s.muteUntil ? formatDateAr(s.muteUntil) : "دائم" },
              { key: "reason", header: "السبب", searchable: true, className: "text-sm text-muted-foreground", render: (s) => s.reason || "-" },
            ]}
          />
        </div>
      )}

      <Card className="bg-status-info-surface border-status-info-surface">
        <CardContent className="p-4">
          <h3 className="font-semibold text-status-info-foreground mb-2">كيف يعمل نظام منع إرهاق التنبيهات؟</h3>
          <ul className="text-sm text-status-info-foreground space-y-1 list-disc list-inside">
            <li>تجميع التنبيهات المتكررة من نفس النوع في تنبيه واحد</li>
            <li>الحد الأقصى للتنبيهات اليومية: {dc.dailyLimit || 50} تنبيه</li>
            <li>إمكانية كتم نوع معين من التنبيهات مؤقتاً</li>
            <li>الأولوية للتنبيهات العاجلة والحرجة دائماً</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
