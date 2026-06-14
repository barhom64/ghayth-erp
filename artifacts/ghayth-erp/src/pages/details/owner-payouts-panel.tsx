import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatCurrency, formatDateAr, todayLocal, currentPeriodRiyadh } from "@/lib/formatters";
import { Plus, Banknote } from "lucide-react";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "تحويل بنكي",
  cash: "نقداً",
  cheque: "شيك",
  other: "أخرى",
};

function periodDefault() {
  return currentPeriodRiyadh(); // utc-ok: uses Riyadh wall-clock via currentPeriodRiyadh
}

function firstOfMonth(period: string) {
  return period ? `${period}-01` : "";
}

function lastOfMonth(period: string) {
  if (!period) return "";
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // utc-ok: computing calendar last-day of month from YYYY-MM string; timezone-independent for Gregorian month length
  return `${period}-${String(last).padStart(2, "0")}`;
}

const EMPTY_FORM = {
  period: periodDefault(),
  fromDate: firstOfMonth(periodDefault()),
  toDate: lastOfMonth(periodDefault()),
  totalRentCollected: "",
  totalMaintenance: "0",
  commissionRate: "0",
  commissionAmount: "0",
  netAmount: "",
  paymentMethod: "bank_transfer",
  reference: "",
  paidAt: todayLocal(),
  notes: "",
};

interface Props {
  ownerId: number;
}

export function OwnerPayoutsPanel({ ownerId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const { data: resp, isLoading } = useApiQuery<any>(
    ["owner-payouts", String(ownerId)],
    `/properties/owners/${ownerId}/payouts`,
    !!ownerId,
  );
  const payouts: any[] = resp?.data || resp || [];

  function setField(key: string, value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Auto-fill fromDate/toDate when period changes
      if (key === "period") {
        next.fromDate = firstOfMonth(value);
        next.toDate = lastOfMonth(value);
      }
      // Auto-calc commission and net
      const rent = Number(next.totalRentCollected) || 0;
      const maint = Number(next.totalMaintenance) || 0;
      const rate = Number(next.commissionRate) || 0;
      if (key === "totalRentCollected" || key === "totalMaintenance" || key === "commissionRate") {
        const commission = Math.round(rent * (rate / 100) * 100) / 100;
        next.commissionAmount = String(commission);
        next.netAmount = String(Math.max(0, Math.round((rent - maint - commission) * 100) / 100));
      }
      if (key === "commissionAmount") {
        // Manual override of commission — recalc net only
        const commission = Number(value) || 0;
        next.netAmount = String(Math.max(0, Math.round((rent - maint - commission) * 100) / 100));
      }
      return next;
    });
  }

  async function handleSave() {
    if (!form.period || !form.netAmount || Number(form.netAmount) <= 0) {
      toast({ variant: "destructive", title: "أدخل الفترة والصافي المستحق" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/properties/owners/${ownerId}/payouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: form.period,
          fromDate: form.fromDate,
          toDate: form.toDate,
          totalRentCollected: Number(form.totalRentCollected) || 0,
          totalMaintenance: Number(form.totalMaintenance) || 0,
          commissionRate: Number(form.commissionRate) || 0,
          commissionAmount: Number(form.commissionAmount) || 0,
          netAmount: Number(form.netAmount),
          paymentMethod: form.paymentMethod,
          reference: form.reference || undefined,
          paidAt: form.paidAt || undefined,
          notes: form.notes || undefined,
        }),
      });
      toast({ title: "تم تسجيل الدفعة وقيد المحاسبة" });
      qc.invalidateQueries({ queryKey: ["owner-payouts", String(ownerId)] });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التسجيل", description: err.message });
    } finally {
      setSaving(false);
    }
  }

  const totalPaid = payouts.reduce((s: number, r: any) => s + Number(r.netAmount || 0), 0);

  const columns: DataTableColumn<any>[] = [
    { key: "period", header: "الفترة", sortable: true, render: (r) => <span className="font-mono text-xs">{r.period}</span> },
    { key: "fromDate", header: "من", render: (r) => formatDateAr(r.fromDate) },
    { key: "toDate", header: "إلى", render: (r) => formatDateAr(r.toDate) },
    { key: "totalRentCollected", header: "إيجارات محصّلة", render: (r) => formatCurrency(Number(r.totalRentCollected || 0)) },
    { key: "commissionAmount", header: "العمولة", render: (r) => r.commissionAmount ? formatCurrency(Number(r.commissionAmount)) : "—" },
    {
      key: "netAmount",
      header: "الصافي المدفوع",
      sortable: true,
      render: (r) => <span className="font-bold text-emerald-600">{formatCurrency(Number(r.netAmount || 0))}</span>,
    },
    {
      key: "paymentMethod",
      header: "طريقة الدفع",
      render: (r) => (
        <Badge variant="outline" className="text-xs">
          {PAYMENT_METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}
        </Badge>
      ),
    },
    { key: "paidAt", header: "تاريخ الدفع", render: (r) => r.paidAt ? formatDateAr(r.paidAt) : "—" },
    { key: "reference", header: "المرجع", render: (r) => r.reference || "—" },
    {
      key: "journalEntryId",
      header: "القيد المحاسبي",
      render: (r) =>
        r.journalEntryId ? (
          <Badge variant="outline" className="border-emerald-200 text-emerald-600 bg-emerald-50 text-xs">
            #{r.journalEntryId}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 text-xs">بدون قيد</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Banknote className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">إجمالي المدفوع للمالك</p>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalPaid)}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="h-4 w-4" /> سجل المدفوعات للمالك
            </CardTitle>
            <GuardedButton perm="properties:create" size="sm" className="gap-1" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> تسجيل دفعة
            </GuardedButton>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={payouts}
            isLoading={isLoading}
            emptyMessage="لا توجد دفعات مسجلة لهذا المالك"
          />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تسجيل دفعة للمالك</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">الفترة (YYYY-MM) *</Label>
                <Input
                  className="h-9 font-mono"
                  placeholder="2025-06"
                  value={form.period}
                  onChange={(e) => setField("period", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">من</Label>
                <Input type="date" className="h-9" value={form.fromDate} onChange={(e) => setField("fromDate", e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">إلى</Label>
                <Input type="date" className="h-9" value={form.toDate} onChange={(e) => setField("toDate", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">الإيجارات المحصّلة (ريال) *</Label>
                <Input
                  type="number"
                  className="h-9"
                  value={form.totalRentCollected}
                  onChange={(e) => setField("totalRentCollected", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">خصم الصيانة (ريال)</Label>
                <Input
                  type="number"
                  className="h-9"
                  value={form.totalMaintenance}
                  onChange={(e) => setField("totalMaintenance", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">نسبة العمولة (%)</Label>
                <Input
                  type="number"
                  className="h-9"
                  min="0"
                  max="100"
                  value={form.commissionRate}
                  onChange={(e) => setField("commissionRate", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">مبلغ العمولة (ريال)</Label>
                <Input
                  type="number"
                  className="h-9"
                  value={form.commissionAmount}
                  onChange={(e) => setField("commissionAmount", e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">الصافي المستحق (ريال) *</Label>
                <Input
                  type="number"
                  className="h-9 font-bold"
                  value={form.netAmount}
                  onChange={(e) => setField("netAmount", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">طريقة الدفع</Label>
                <select
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.paymentMethod}
                  onChange={(e) => setField("paymentMethod", e.target.value)}
                >
                  <option value="bank_transfer">تحويل بنكي</option>
                  <option value="cash">نقداً</option>
                  <option value="cheque">شيك</option>
                  <option value="other">أخرى</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">تاريخ الدفع</Label>
                <Input type="date" className="h-9" value={form.paidAt} onChange={(e) => setField("paidAt", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">رقم المرجع / رقم التحويل</Label>
                <Input className="h-9 font-mono" value={form.reference} onChange={(e) => setField("reference", e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">ملاحظات</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
            </div>
            {form.netAmount && Number(form.netAmount) > 0 && (
              <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
                سيُنشئ النظام قيداً محاسبياً تلقائياً: DR ذمة مالك {formatCurrency(Number(form.netAmount))} / CR نقدية/بنك
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1" rateLimitAware>
              {saving ? "جاري الحفظ..." : "تسجيل الدفعة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
