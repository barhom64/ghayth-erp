import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable } from "@workspace/ui-core";
import { BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";

export function AlertFatigueTab() {
  const { data: dcData, isLoading, isError } = useApiQuery<any>(["alert-daily-count"], "/bi/alert-fatigue/daily-count");
  const { data: settingsData } = useApiQuery<any>(["alert-fatigue-settings"], "/bi/alert-fatigue/settings");
  const { toast } = useToast();
  const [muteType, setMuteType] = useState("");
  const [muteHours, setMuteHours] = useState("24");
  const [loading, setLoading] = useState(false);

  const handleMute = async () => {
    if (!muteType.trim()) { toast({ title: "أدخل نوع التنبيه", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const muteUntil = new Date(Date.now() + Number(muteHours) * 3600000).toISOString();
      await apiFetch("/bi/alert-fatigue/mute", { method: "POST", body: JSON.stringify({ alertType: muteType, muteUntil }) });
      toast({ title: "تم كتم التنبيهات", description: `سيتم كتم "${muteType}" لمدة ${muteHours} ساعة` });
      setMuteType("");
    } catch {
      toast({ title: "خطأ", variant: "destructive" });
    }
    setLoading(false);
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
          <div className="flex gap-3">
            <input
              className="flex-1 border rounded-md px-3 py-2 text-sm"
              placeholder="نوع التنبيه (مثال: invoice_overdue)"
              value={muteType}
              onChange={(e) => setMuteType(e.target.value)}
              dir="ltr"
            />
            <Select value={muteHours} onValueChange={setMuteHours}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">ساعة واحدة</SelectItem>
                <SelectItem value="4">4 ساعات</SelectItem>
                <SelectItem value="8">8 ساعات</SelectItem>
                <SelectItem value="24">يوم كامل</SelectItem>
                <SelectItem value="72">3 أيام</SelectItem>
              </SelectContent>
            </Select>
            <GuardedButton perm="bi:create" onClick={handleMute} disabled={loading}>
              <BellOff className="h-4 w-4 me-2" />كتم
            </GuardedButton>
          </div>
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
