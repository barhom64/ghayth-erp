// البند ٢ دفعة ٣ — واجهة اعتماد شطب الديون المعدومة.
// تعرض مرشّحي الشطب (ذمم متأخّرة فوق العتبة عبر GET /bad-debt/write-off-candidates)،
// وتُرحّل الشطب باعتماد بشري فقط (POST /bad-debt/write-off) بعد تأكيد إشعار العميل
// كتابيًّا (شرط تخفيف ضريبة ZATCA — مادة ٤٠) وعرض «الأثر المتوقع» قبل الترحيل.
import { useState } from "react";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { formatCurrency } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";

interface Candidate {
  id: number;
  ref: string | null;
  clientId: number | null;
  outstanding: number;
  daysOverdue: number;
  dueDate: string | null;
  createdAt: string;
}
interface CandidatesResponse {
  asOf: string;
  minDaysOverdue: number;
  count: number;
  totalOutstanding: number;
  candidates: Candidate[];
}

export function BadDebtWriteOffCandidates() {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useApiQuery<CandidatesResponse>(
    ["bad-debt-writeoff-candidates"],
    "/finance/bad-debt/write-off-candidates",
  );
  const writeOffMut = useApiMutation("/finance/bad-debt/write-off", "POST", [
    ["bad-debt-writeoff-candidates"], ["bad-debt-preview"], ["journal"],
  ]);

  const [selected, setSelected] = useState<Candidate | null>(null);
  const [notified, setNotified] = useState(false);
  const [reason, setReason] = useState("");

  const openDialog = (c: Candidate) => { setSelected(c); setNotified(false); setReason(""); };
  const closeDialog = () => setSelected(null);

  const confirmWriteOff = async () => {
    if (!selected || !notified) return;
    try {
      await writeOffMut.mutateAsync({ invoiceId: selected.id, reason: reason || undefined, customerNotified: true });
      toast({ title: "تم شطب الدين وترحيل القيد (مع استرداد ضريبة المخرجات)" });
      closeDialog();
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر الشطب", description: err?.fix ?? getErrorMessage(err) });
    }
  };

  const candidates = data?.candidates ?? [];

  return (
    <Card className="mb-4 border-status-error-surface">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-status-error-foreground" />
          مرشّحو الشطب{data ? ` — ذمم متأخّرة فوق ${data.minDaysOverdue} يومًا` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          الشطب يُزيل الذمّة غير القابلة للتحصيل مقابل المخصّص ويسترد ضريبة المخرجات (ZATCA مادة ٤٠) —
          يتطلّب مرور ١٢ شهرًا وإشعار العميل كتابيًّا. عملية دفترية تُرحَّل باعتمادك فقط.
        </p>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">جاري التحميل...</p>
        ) : candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا مرشّحين للشطب حاليًّا.</p>
        ) : (
          <>
            <div className="text-xs text-muted-foreground mb-2">
              {data?.count} فاتورة · إجمالي {formatCurrency(data?.totalOutstanding ?? 0)}
            </div>
            <DataTable
              noToolbar
              data={candidates}
              rowKey={(r) => r.id}
              columns={[
                { key: "ref", header: "الفاتورة", render: (r) => <span className="font-mono text-xs">{r.ref ?? `#${r.id}`}</span> },
                { key: "clientId", header: "العميل", render: (r) => (r.clientId ? `#${r.clientId}` : "-") },
                { key: "outstanding", header: "المتبقّي", align: "end", className: "font-mono", render: (r) => formatCurrency(r.outstanding) },
                { key: "daysOverdue", header: "أيام التأخّر", align: "end", render: (r) => <Badge className="bg-red-100 text-red-900 text-xs">{r.daysOverdue}</Badge> },
                { key: "act", header: "", align: "end", render: (r) => (
                  <GuardedButton perm="finance:create" onClick={() => openDialog(r)}>اعتماد الشطب</GuardedButton>
                ) },
              ] satisfies DataTableColumn<Candidate>[]}
            />
          </>
        )}
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>شطب دين معدوم — الفاتورة {selected?.ref ?? `#${selected?.id ?? ""}`}</DialogTitle>
            <DialogDescription>
              المتبقّي {formatCurrency(selected?.outstanding ?? 0)} · العميل {selected?.clientId ? `#${selected.clientId}` : "-"} · متأخّر {selected?.daysOverdue ?? 0} يومًا.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
            <p className="font-semibold">الأثر المتوقع (يُرحَّل عند الاعتماد):</p>
            <div className="flex justify-between"><span>مخصص الديون — الصافي</span><span className="text-orange-700">مدين</span></div>
            <div className="flex justify-between"><span>ضريبة القيمة المضافة المستحقة — استرداد المخرجات</span><span className="text-orange-700">مدين</span></div>
            <div className="flex justify-between"><span>ذمم العميل</span><span className="text-emerald-700">دائن {formatCurrency(selected?.outstanding ?? 0)}</span></div>
            <p className="text-muted-foreground text-[10px] pt-1">ثم تُعلَّم الفاتورة «مشطوبة» وتخرج من التقادم.</p>
          </div>

          <div className="flex items-start gap-2 mt-1">
            <Checkbox id="wo-notified" checked={notified} onCheckedChange={(v) => setNotified(v === true)} />
            <Label htmlFor="wo-notified" className="text-xs leading-relaxed cursor-pointer">
              أُقرّ بإشعار العميل كتابيًّا بالمبلغ المشطوب (شرط تخفيف الضريبة — ZATCA مادة ٤٠).
            </Label>
          </div>

          <div>
            <Label className="text-xs">السبب (اختياري — يظهر على القيد)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="مثلاً: تعذّر التحصيل بعد محاولات / إفلاس العميل" />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>إلغاء</Button>
            <Button variant="destructive" disabled={!notified || writeOffMut.isPending} onClick={confirmWriteOff}>
              {writeOffMut.isPending ? "جاري الشطب..." : "تأكيد الشطب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
