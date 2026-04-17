import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { CreatePageLayout } from "@/components/create-page-layout";

export default function PaymentRecord() {
  const [, params] = useRoute("/properties/contracts/:contractId/pay/:installmentId") as [boolean, { contractId: string; installmentId: string }];
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: contractResp } = useApiQuery<any>(
    ["property-contract-detail", params?.contractId],
    `/properties/contracts/${params?.contractId}`
  );
  const contract = contractResp?.data || contractResp;
  const schedule = Array.isArray(contract?.schedule) ? contract.schedule : [];
  const installment = schedule.find((i: any) => String(i.id) === params?.installmentId);

  const [form, setForm] = useState({ amount: "", method: "bank_transfer", receiptNumber: "" });

  useEffect(() => {
    if (installment) {
      setForm(f => ({ ...f, amount: String(installment.amount || "") }));
    }
  }, [installment]);

  const handleSave = async () => {
    if (!form.amount) { toast({ variant: "destructive", title: "المبلغ مطلوب" }); return; }
    setSaving(true);
    try {
      await apiFetch(`/properties/contracts/${params?.contractId}/installments/${params?.installmentId}/pay`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(form.amount),
          method: form.method,
          receiptNumber: form.receiptNumber || undefined,
        }),
      });
      toast({ title: "تم تسجيل الدفعة بنجاح" });
      qc.invalidateQueries({ queryKey: ["property-contract"] });
      qc.invalidateQueries({ queryKey: ["property-contracts"] });
      setLocation(`/properties/contracts`);
    } catch { toast({ variant: "destructive", title: "حدث خطأ أثناء تسجيل الدفعة" }); }
    finally { setSaving(false); }
  };

  return (
    <CreatePageLayout
      title="تسجيل دفعة"
      subtitle={installment ? `القسط رقم ${installment.installmentNumber} — المبلغ: ${formatCurrency(installment.amount)}` : "تحميل..."}
      backPath="/properties/contracts"
    >
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <CreditCard className="h-5 w-5 text-blue-500" /> بيانات الدفعة
        </h3>
        {installment && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-1">
              <p>تاريخ الاستحقاق: <strong>{formatDateAr(installment.dueDate)}</strong></p>
              <p>المبلغ المطلوب: <strong>{formatCurrency(installment.amount)}</strong></p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>المبلغ المدفوع <span className="text-red-500">*</span></Label>
              <Input className="mt-1" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} dir="ltr" />
            </div>
            <div>
              <Label>طريقة الدفع</Label>
              <Select value={form.method} onValueChange={v => setForm({ ...form, method: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                  <SelectItem value="cheque">شيك</SelectItem>
                  <SelectItem value="online">إلكتروني</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>رقم الإيصال (اختياري)</Label>
              <Input className="mt-1" value={form.receiptNumber} onChange={e => setForm({ ...form, receiptNumber: e.target.value })} dir="ltr" />
            </div>
          </div>
      </div>

      {Number(form.amount) > 0 && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <p className="font-semibold mb-1">سيتم تلقائياً عند تأكيد الدفع:</p>
          <ul className="list-disc list-inside space-y-1 text-green-700">
            <li>إنشاء قيد محاسبي: مدين النقدية / دائن إيراد الإيجار بمبلغ {Number(form.amount).toLocaleString("ar-SA")} ريال</li>
            <li>تحديث حالة القسط إلى "مدفوع" وربط القيد بالعقد والوحدة</li>
          </ul>
        </div>
      )}
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/properties/contracts")}>إلغاء</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "جاري التسجيل..." : "تأكيد الدفع"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
