// إحياء: ضبط «تذكير SLA للمهام» — يربط GET/PUT/DELETE /settings/task-sla-reminder.
//
// الكرون inbox_task_sla_reminder_scan (كل 15د) يقرأ هذا الإعداد فعلًا لتنبيه
// المسؤول قبل تجاوز موعد الاستجابة، لكن لم تكن له واجهة ضبط (كان «موجودًا لا
// يعمل من الواجهة»). هذه الشاشة تُحييه. لا endpoint/هجرة جديد.

import { useState } from "react";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { BellRing } from "lucide-react";

interface SlaConfig {
  leadFraction: number;
  leadHours: number | null;
  finalReminderHours: number | null;
}
interface SlaResponse {
  config: SlaConfig;
  defaults: SlaConfig;
  isOverridden: boolean;
}

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function TaskSlaReminderTab() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<{ data: SlaResponse }>(
    ["task-sla-reminder"],
    "/settings/task-sla-reminder",
  );
  const { toast } = useToast();
  const resp = data?.data;

  const [leadFraction, setLeadFraction] = useState<string | null>(null);
  const [leadHours, setLeadHours] = useState<string | null>(null);
  const [finalHours, setFinalHours] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading) return <LoadingSpinner />;
  if (isError || !resp) return <ErrorState onRetry={() => refetch()} error={error} />;

  // القيمة المعروضة: تعديل المستخدم إن وُجد، وإلا المخزَّن.
  const cfg = resp.config;
  const fFraction = leadFraction ?? String(cfg.leadFraction);
  const fLead = leadHours ?? (cfg.leadHours == null ? "" : String(cfg.leadHours));
  const fFinal = finalHours ?? (cfg.finalReminderHours == null ? "" : String(cfg.finalReminderHours));

  const save = async () => {
    const frac = Number(fFraction);
    if (!Number.isFinite(frac) || frac <= 0 || frac >= 1) {
      toast({ variant: "destructive", title: "نسبة التذكير المسبق يجب أن تكون بين 0 و 1" });
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/settings/task-sla-reminder", {
        method: "PUT",
        body: JSON.stringify({
          leadFraction: frac,
          leadHours: numOrNull(fLead),
          finalReminderHours: numOrNull(fFinal),
        }),
      });
      toast({ title: "تم حفظ إعداد التذكير" });
      setLeadFraction(null); setLeadHours(null); setFinalHours(null);
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الحفظ", description: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await apiFetch("/settings/task-sla-reminder", { method: "DELETE" });
      toast({ title: "أُعيد الإعداد للافتراضي" });
      setLeadFraction(null); setLeadHours(null); setFinalHours(null);
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الإرجاع", description: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <BellRing className="h-5 w-5" /> تذكير SLA للمهام
      </h3>
      <p className="text-sm text-muted-foreground">
        يُنبّه النظام مسؤول مهمة صندوق الوارد قبل تجاوز موعد الاستجابة (SLA). يعمل تلقائيًا كل 15 دقيقة —
        هذه الشاشة تضبط توقيت التنبيه.
        {resp.isOverridden ? " (إعداد مخصّص للشركة)" : " (يُستخدم الافتراضي حاليًا)"}
      </p>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">توقيت التذكير</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">نسبة التذكير المسبق (0–1)</Label>
              <Input
                type="number" step="0.05" min="0.01" max="0.99"
                value={fFraction}
                onChange={(e) => setLeadFraction(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                يُرسل التذكير عند تبقّي هذه النسبة من نافذة SLA (افتراضي {resp.defaults.leadFraction}).
              </p>
            </div>
            <div>
              <Label className="text-xs">ساعات التذكير المسبق (اختياري)</Label>
              <Input
                type="number" step="1" min="1"
                value={fLead}
                placeholder="—"
                onChange={(e) => setLeadHours(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                إن حُدِّدت، تتقدّم على النسبة (ساعات قبل الموعد).
              </p>
            </div>
            <div>
              <Label className="text-xs">تذكير نهائي قبل الموعد (ساعات، اختياري)</Label>
              <Input
                type="number" step="1" min="1"
                value={fFinal}
                placeholder="بلا تذكير نهائي"
                onChange={(e) => setFinalHours(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                تذكير ثانٍ اختياري قبل الموعد بهذا العدد من الساعات.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GuardedButton perm="settings:update" size="sm" disabled={busy} onClick={save}>
              {busy ? "جاري الحفظ…" : "حفظ"}
            </GuardedButton>
            {resp.isOverridden && (
              <Button variant="outline" size="sm" disabled={busy} onClick={reset}>
                إرجاع للافتراضي
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
