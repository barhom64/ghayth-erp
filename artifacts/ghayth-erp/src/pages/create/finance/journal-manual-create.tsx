import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CostCenterSelect } from "@/components/shared/entity-selects";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";
import { ArrowRight } from "lucide-react";

type JournalLine = { accountCode: string; description: string; debit: number; credit: number };

const emptyLine = (): JournalLine => ({ accountCode: "", description: "", debit: 0, credit: 0 });

export default function JournalManualCreatePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const [form, setForm] = useState({
    description: "",
    date: new Date().toISOString().split("T")[0],
    costCenter: "",
    notes: "",
    lines: [emptyLine(), emptyLine()],
  });

  const { data: coaData } = useApiQuery<any>(
    ["chart-of-accounts"],
    `/finance/chart-of-accounts${scopeSuffix}`
  );

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch("/finance/journal-manual", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal-manual"] });
      toast({ title: "تم إنشاء القيد اليدوي بحالة مسودة" });
      navigate("/finance/journal-manual");
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "حدث خطأ" }),
  });

  const coa = coaData?.data ?? coaData ?? [];

  const totalDebit = form.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = form.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, emptyLine()] }));
  }
  function removeLine(i: number) {
    if (form.lines.length <= 2) return;
    setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  }
  function updateLine(i: number, field: keyof JournalLine, val: any) {
    setForm(f => {
      const lines = [...f.lines];
      lines[i] = { ...lines[i], [field]: field === "debit" || field === "credit" ? Number(val) || 0 : val };
      return { ...f, lines };
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isBalanced) { toast({ variant: "destructive", title: "القيد غير متوازن — يجب أن يتساوى مجموع المدين والدائن" }); return; }
    createMutation.mutate({ ...form, date: form.date || undefined });
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Link href="/finance/journal-manual">
          <Button variant="ghost">
            <ArrowRight className="h-4 w-4 me-1" />
            العودة
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold">إنشاء قيد يدوي جديد</h2>
          <p className="text-sm text-gray-500 mt-1">أنشئ قيداً يدوياً بحالة مسودة، ثم أرسله للمراجعة والاعتماد</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>بيانات القيد</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">البيان *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف القيد اليدوي" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">التاريخ</label>
                <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <CostCenterSelect
                value={form.costCenter}
                onChange={(v) => setForm(f => ({ ...f, costCenter: v }))}
              />
            </div>

            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-right">رمز الحساب</th>
                    <th className="px-3 py-2 text-right">البيان</th>
                    <th className="px-3 py-2 text-right">مدين</th>
                    <th className="px-3 py-2 text-right">دائن</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((line, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">
                        <input
                          list={`coa-list-${i}`}
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={line.accountCode}
                          onChange={e => updateLine(i, "accountCode", e.target.value)}
                          placeholder="الحساب"
                        />
                        <datalist id={`coa-list-${i}`}>
                          {(Array.isArray(coa) ? coa : []).map((a: any) => <option key={a.code} value={a.code}>{a.code} - {a.name}</option>)}
                        </datalist>
                      </td>
                      <td className="px-2 py-1">
                        <input className="w-full border rounded px-2 py-1 text-sm" value={line.description} onChange={e => updateLine(i, "description", e.target.value)} placeholder="البيان" />
                      </td>
                      <td className="px-2 py-1">
                        <input className="w-24 border rounded px-2 py-1 text-sm" type="number" min="0" value={line.debit || ""} onChange={e => updateLine(i, "debit", e.target.value)} placeholder="0" />
                      </td>
                      <td className="px-2 py-1">
                        <input className="w-24 border rounded px-2 py-1 text-sm" type="number" min="0" value={line.credit || ""} onChange={e => updateLine(i, "credit", e.target.value)} placeholder="0" />
                      </td>
                      <td className="px-2 py-1">
                        <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td colSpan={2} className="px-3 py-2 text-gray-500">المجموع</td>
                    <td className={`px-3 py-2 ${isBalanced ? "text-green-700" : "text-red-600"}`}>{formatCurrency(totalDebit)}</td>
                    <td className={`px-3 py-2 ${isBalanced ? "text-green-700" : "text-red-600"}`}>{formatCurrency(totalCredit)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {!isBalanced && totalDebit > 0 && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                القيد غير متوازن — الفرق: {formatCurrency(Math.abs(totalDebit - totalCredit))}
              </div>
            )}
            {isBalanced && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                القيد متوازن
              </div>
            )}

            <Button type="button" variant="outline" size="sm" onClick={addLine}>+ إضافة سطر</Button>

            <div>
              <label className="block text-sm font-medium mb-1">ملاحظات</label>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات اختيارية" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/finance/journal-manual">
                <Button type="button" variant="outline">إلغاء</Button>
              </Link>
              <Button type="submit" disabled={createMutation.isPending || !isBalanced}>
                {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء القيد"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
