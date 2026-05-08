import { useState, useEffect } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SlidersHorizontal, CheckCircle, Settings2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function SystemControlsTab() {
  const { data, refetch, isLoading, isError, error } = useApiQuery<any>(["system-controls"], "/settings/system-controls");
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const controls = data?.data || {};

  const [form, setForm] = useState({
    "approval.require_notes_on_reject": true,
    "approval.require_notes_on_return": true,
    "approval.max_return_count": 3,
    "approval.auto_escalate_hours": 48,
    "system.allow_self_approval": false,
    "system.notifications_enabled": true,
    "system.attachment_max_size_mb": 5,
    "system.attachment_max_count": 10,
  });

  useEffect(() => {
    if (data?.data) {
      setForm((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next) as (keyof typeof next)[]) {
          if (controls[key] !== undefined) {
            (next as any)[key] = controls[key];
          }
        }
        return next;
      });
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/settings/system-controls", { method: "PUT", body: JSON.stringify(form) });
      toast({ title: "تم حفظ الإعدادات" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    } finally {
      setSaving(false);
    }
  };

  const settingsGroups = [
    {
      title: "إعدادات الموافقات",
      icon: CheckCircle,
      items: [
        { key: "approval.require_notes_on_reject", label: "إلزام كتابة سبب عند الرفض", type: "toggle" },
        { key: "approval.require_notes_on_return", label: "إلزام كتابة سبب عند الإرجاع", type: "toggle" },
        { key: "approval.max_return_count", label: "الحد الأقصى لعدد مرات الإرجاع", type: "number" },
        { key: "approval.auto_escalate_hours", label: "التصعيد التلقائي بعد (ساعة)", type: "number" },
        { key: "system.allow_self_approval", label: "السماح بالموافقة الذاتية", type: "toggle" },
      ]
    },
    {
      title: "إعدادات النظام",
      icon: Settings2,
      items: [
        { key: "system.notifications_enabled", label: "تفعيل الإشعارات", type: "toggle" },
        { key: "system.attachment_max_size_mb", label: "حجم الملف الأقصى (ميجابايت)", type: "number" },
        { key: "system.attachment_max_count", label: "عدد الملفات الأقصى لكل طلب", type: "number" },
      ]
    }
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} error={error} />;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <SlidersHorizontal className="h-5 w-5" />
        التحكم بالنظام
      </h3>
      {settingsGroups.map((group) => (
        <Card key={group.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <group.icon className="h-4 w-4" />
              {group.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm">{item.label}</span>
                {item.type === "toggle" ? (
                  <button
                    onClick={() => setForm({ ...form, [item.key]: !(form as any)[item.key] })}
                    className={cn(
                      "relative w-11 h-6 rounded-full transition-colors",
                      (form as any)[item.key] ? "bg-green-500" : "bg-gray-300"
                    )}
                  >
                    <span className={cn(
                      "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                      (form as any)[item.key] ? "start-0.5" : "start-[22px]"
                    )} />
                  </button>
                ) : (
                  <Input
                    type="number"
                    className="w-24 text-center"
                    value={(form as any)[item.key]}
                    onChange={(e) => setForm({ ...form, [item.key]: Number(e.target.value) })}
                    min={0}
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      <Button onClick={handleSave} disabled={saving} rateLimitAware>
        <Save className="h-4 w-4 me-1" />{saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
      </Button>
    </div>
  );
}
