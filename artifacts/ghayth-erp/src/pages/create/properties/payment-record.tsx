import { useState, useEffect } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Save, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href="/properties/contracts">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">تسجيل دفعة</h1>
            <p className="text-gray-500 text-sm mt-1">
              {installment ? `القسط رقم ${installment.installmentNumber} — المبلغ: ${formatCurrency(installment.amount)}` : "تحميل..."}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "جاري التسجيل..." : "تأكيد الدفع"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="h-5 w-5 text-blue-500" /> بيانات الدفعة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/properties/contracts">
          <Button variant="outline">إلغاء</Button>
        </Link>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "جاري التسجيل..." : "تأكيد الدفع"}
        </Button>
      </div>
    </div>
  );
}
