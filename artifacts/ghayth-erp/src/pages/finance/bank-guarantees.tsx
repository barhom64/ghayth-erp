import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr as formatDate } from "@/lib/formatters";
import { Plus, Shield, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type BankGuarantee = {
  id: number;
  ref: string;
  bank: string;
  beneficiary: string;
  amount: number;
  issueDate: string;
  expiryDate: string;
  guaranteeType: string;
  status: string;
  alertStatus: string;
  daysToExpiry: number;
  notes?: string;
};

const GUARANTEE_TYPES = [
  { value: "performance", label: "حسن أداء" },
  { value: "advance_payment", label: "دفعة مقدمة" },
  { value: "bid_bond", label: "عطاء" },
  { value: "maintenance", label: "صيانة" },
  { value: "other", label: "أخرى" },
];

const alertConfig: Record<string, { label: string; color: string; Icon: any }> = {
  active: { label: "نشط", color: "green", Icon: CheckCircle },
  expired: { label: "منتهي", color: "red", Icon: XCircle },
  expiring_7: { label: "ينتهي خلال 7 أيام", color: "red", Icon: AlertTriangle },
  expiring_14: { label: "ينتهي خلال 14 يوم", color: "orange", Icon: AlertTriangle },
  expiring_30: { label: "ينتهي خلال 30 يوم", color: "yellow", Icon: Clock },
  released: { label: "مُطلق", color: "gray", Icon: CheckCircle },
  cancelled: { label: "ملغي", color: "gray", Icon: XCircle },
};

export default function BankGuaranteesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BankGuarantee | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({
    ref: "", bank: "", beneficiary: "", amount: "", issueDate: "", expiryDate: "",
    guaranteeType: "performance", notes: "",
  });

  const { data, isLoading } = useApiQuery<any>(
    ["bank-guarantees"],
    `/finance/bank-guarantees${scopeSuffix}`
  );

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editing
        ? apiFetch(`/finance/bank-guarantees/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : apiFetch("/finance/bank-guarantees", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-guarantees"] });
      toast({ title: editing ? "تم تحديث الضمان" : "تم إضافة الضمان البنكي" });
      setShowForm(false);
      setEditing(null);
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "حدث خطأ" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/finance/bank-guarantees/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-guarantees"] });
      toast({ title: "تم حذف الضمان" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "حدث خطأ" }),
  });

  const list: BankGuarantee[] = data?.data ?? data ?? [];
  const summary = data?.summary ?? {};

  function openNew() {
    setEditing(null);
    setForm({ ref: "", bank: "", beneficiary: "", amount: "", issueDate: "", expiryDate: "", guaranteeType: "performance", notes: "" });
    setShowForm(true);
  }

  function openEdit(row: BankGuarantee) {
    setEditing(row);
    setForm({ ref: row.ref, bank: row.bank, beneficiary: row.beneficiary, amount: String(row.amount), issueDate: row.issueDate?.slice(0, 10) ?? "", expiryDate: row.expiryDate?.slice(0, 10) ?? "", guaranteeType: row.guaranteeType, notes: row.notes ?? "", status: row.status });
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate({ ...form, amount: Number(form.amount) });
  }

  const alerts = list.filter(g => ["expiring_7", "expiring_14", "expiring_30", "expired"].includes(g.alertStatus));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">الضمانات البنكية</h2>
          <p className="text-sm text-gray-500 mt-1">إدارة الضمانات البنكية وتتبع مواعيد انتهائها</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 ml-2" />
          ضمان جديد
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-sm text-gray-500">إجمالي الضمانات</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">{summary.total ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-gray-500">إجمالي المبالغ النشطة</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{formatCurrency(summary.totalAmount ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-gray-500">تنتهي خلال 30 يوم</div>
          <div className="text-2xl font-bold text-yellow-600 mt-1">{summary.expiring30 ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-gray-500">منتهية الصلاحية</div>
          <div className="text-2xl font-bold text-red-600 mt-1">{summary.expired ?? 0}</div>
        </CardContent></Card>
      </div>

      {alerts.length > 0 && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4">
          <div className="flex items-center gap-2 text-yellow-800 font-semibold mb-3">
            <AlertTriangle className="h-5 w-5" />
            تنبيهات: {alerts.length} ضمان يحتاج مراجعة
          </div>
          <div className="space-y-2">
            {alerts.map(g => (
              <div key={g.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2 text-sm">
                <div className="font-medium">{g.ref} — {g.beneficiary}</div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">{g.bank}</span>
                  <span className="text-gray-500">{formatCurrency(g.amount)}</span>
                  <span className={`font-semibold ${g.alertStatus === "expired" ? "text-red-600" : "text-yellow-700"}`}>
                    {alertConfig[g.alertStatus]?.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-gray-400">لا توجد ضمانات بنكية مسجلة</div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">رقم الضمان</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">البنك</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">الجهة المستفيدة</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">المبلغ</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">النوع</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">تاريخ الإصدار</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">تاريخ الانتهاء</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">الحالة</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">الأيام المتبقية</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => {
                  const cfg = alertConfig[row.alertStatus] ?? alertConfig.active;
                  const StatusIcon = cfg.Icon;
                  return (
                    <tr key={row.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-3">{row.ref}</td>
                      <td className="px-3 py-3">{row.bank}</td>
                      <td className="px-3 py-3">{row.beneficiary}</td>
                      <td className="px-3 py-3 font-semibold">{formatCurrency(row.amount)}</td>
                      <td className="px-3 py-3">{GUARANTEE_TYPES.find(t => t.value === row.guaranteeType)?.label ?? row.guaranteeType}</td>
                      <td className="px-3 py-3 text-gray-500">{formatDate(row.issueDate)}</td>
                      <td className="px-3 py-3 text-gray-500">{formatDate(row.expiryDate)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-${cfg.color}-100 text-${cfg.color}-700`}>
                          <StatusIcon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={row.daysToExpiry < 0 ? "text-red-600 font-bold" : row.daysToExpiry <= 7 ? "text-red-500 font-semibold" : row.daysToExpiry <= 30 ? "text-yellow-600" : "text-gray-600"}>
                          {row.daysToExpiry < 0 ? `منتهي منذ ${Math.abs(row.daysToExpiry)} يوم` : `${row.daysToExpiry} يوم`}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(row)} className="text-blue-600 hover:underline text-sm">تعديل</button>
                          <button onClick={() => setDeleteId(row.id)} className="text-red-600 hover:underline text-sm">حذف</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold">{editing ? "تعديل الضمان البنكي" : "إضافة ضمان بنكي جديد"}</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">رقم الضمان *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" required value={form.ref} onChange={e => setForm((f: any) => ({ ...f, ref: e.target.value }))} placeholder="BG-2026-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">البنك المُصدر *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" required value={form.bank} onChange={e => setForm((f: any) => ({ ...f, bank: e.target.value }))} placeholder="البنك الأهلي" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">الجهة المستفيدة *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" required value={form.beneficiary} onChange={e => setForm((f: any) => ({ ...f, beneficiary: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">المبلغ *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" required type="number" min="0" value={form.amount} onChange={e => setForm((f: any) => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">تاريخ الإصدار *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" required type="date" value={form.issueDate} onChange={e => setForm((f: any) => ({ ...f, issueDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">تاريخ الانتهاء *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" required type="date" value={form.expiryDate} onChange={e => setForm((f: any) => ({ ...f, expiryDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">نوع الضمان</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.guaranteeType} onChange={e => setForm((f: any) => ({ ...f, guaranteeType: e.target.value }))}>
                    {GUARANTEE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {editing && (
                  <div>
                    <label className="block text-sm font-medium mb-1">الحالة</label>
                    <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e => setForm((f: any) => ({ ...f, status: e.target.value }))}>
                      <option value="active">نشط</option>
                      <option value="released">مُطلق</option>
                      <option value="renewed">مُجدَّد</option>
                      <option value="cancelled">ملغي</option>
                    </select>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">ملاحظات</label>
                  <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "جاري الحفظ..." : editing ? "حفظ التعديلات" : "إضافة الضمان"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل تريد حذف هذا الضمان البنكي؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
