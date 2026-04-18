import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Banknote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { CreatePageLayout } from "@/components/create-page-layout";

export default function PaymentRegisterPage() {
  const [, params] = useRoute("/properties/payments/:paymentId/pay") as [boolean, { paymentId: string }];
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: paymentsResp } = useApiQuery<any>(["rent-payments"], "/properties/payments");
  const payments = asList(paymentsResp);
  const payment = payments.find((p: any) => String(p.id) === params?.paymentId);

  const remaining = payment ? payment.amount - (payment.paidAmount || 0) : 0;

  const [form, setForm] = useState({
    paidAmount: "",
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "bank_transfer",
    notes: "",
  });

  if (payment && !form.paidAmount && remaining > 0) {
    setForm(f => ({ ...f, paidAmount: String(remaining) }));
  }

  const handleSave = async () => {
    if (!form.paidAmount) {
      toast({ variant: "destructive", title: "يرجى تحديد المبلغ" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/properties/payments/${params?.paymentId}/pay`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(form.paidAmount),
          paidDate: form.paymentDate,
          method: form.paymentMethod,
          notes: form.notes,
        }),
      });
      toast({ title: "تم تسجيل الدفعة بنجاح" });
      qc.invalidateQueries({ queryKey: ["rent-payments"] });
      setLocation("/properties/payments");
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء تسجيل الدفعة", description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CreatePageLayout
      title="تسجيل دفعة إيجار"
      subtitle={payment ? `${payment.tenantName} — ${formatCurrency(payment.amount)}` : "تحميل..."}
      backPath="/properties/payments"
    >
      {payment && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Banknote className="h-5 w-5 text-emerald-500" /> بيانات الدفعة
          </h3>
          <div className="bg-blue-50 rounded-lg p-4 text-sm space-y-1">
              <p>المستأجر: <strong>{payment.tenantName}</strong></p>
              <p>الوحدة: <strong>{payment.unitNumber || "—"}</strong></p>
              <p>تاريخ الاستحقاق: <strong>{formatDateAr(payment.dueDate)}</strong></p>
              <p>المبلغ الكلي: <strong>{formatCurrency(payment.amount)}</strong></p>
              <p>المدفوع سابقاً: <strong>{formatCurrency(payment.paidAmount || 0)}</strong></p>
              <p>المتبقي: <strong className="text-red-600">{formatCurrency(remaining)}</strong></p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>المبلغ المدفوع <span className="text-red-500">*</span></Label>
                <Input
                  className="mt-1"
                  type="number"
                  step="0.01"
                  value={form.paidAmount}
                  onChange={e => setForm(f => ({ ...f, paidAmount: e.target.value }))}
                />
              </div>
              <div>
                <Label>تاريخ الدفع</Label>
                <div className="mt-1"><DatePicker value={form.paymentDate} onChange={v => setForm(f => ({ ...f, paymentDate: v }))} /></div>
              </div>
              <div>
                <Label>طريقة الدفع</Label>
                <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                    <SelectItem value="cash">نقداً</SelectItem>
                    <SelectItem value="check">شيك</SelectItem>
                    <SelectItem value="online">دفع إلكتروني</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ملاحظات (اختياري)</Label>
                <Input
                  className="mt-1"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="ملاحظات اختيارية"
                />
              </div>
            </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/properties/payments")}>إلغاء</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "جاري التسجيل..." : "تسجيل الدفعة"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
