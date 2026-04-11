import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr as formatDate } from "@/lib/formatters";
import { Plus, Send, Eye, CheckCircle, XCircle, FileCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type JournalLine = { accountCode: string; description: string; debit: number; credit: number };

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "gray" },
  pending_review: { label: "في انتظار المراجعة", color: "yellow" },
  approved: { label: "معتمد", color: "blue" },
  posted: { label: "مُرحَّل", color: "green" },
  rejected: { label: "مرفوض", color: "red" },
};

const emptyLine = (): JournalLine => ({ accountCode: "", description: "", debit: 0, credit: 0 });

export default function JournalManualPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [showCreate, setShowCreate] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [actionModal, setActionModal] = useState<{ type: string; journal: any } | null>(null);
  const [actionNotes, setActionNotes] = useState("");

  const [form, setForm] = useState({
    description: "",
    costCenter: "",
    notes: "",
    lines: [emptyLine(), emptyLine()],
  });

  const filterSuffix = statusFilter ? (scopeSuffix ? `${scopeSuffix}&status=${statusFilter}` : `?status=${statusFilter}`) : scopeSuffix;
  const { data, isLoading } = useApiQuery<any>(
    ["journal-manual", statusFilter],
    `/finance/journal-manual${filterSuffix}`
  );

  const { data: coaData } = useApiQuery<any>(
    ["chart-of-accounts"],
    `/finance/chart-of-accounts${scopeSuffix}`
  );

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch("/finance/journal-manual", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal-manual"] });
      toast({ title: "تم إنشاء القيد اليدوي بحالة مسودة" });
      setShowCreate(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "حدث خطأ" }),
  });

  const submitMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/finance/journal-manual/${id}/submit`, { method: "PATCH", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["journal-manual"] }); toast({ title: "تم إرسال القيد للمراجعة" }); setActionModal(null); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "حدث خطأ" }),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, approved, notes }: any) => apiFetch(`/finance/journal-manual/${id}/review`, { method: "PATCH", body: JSON.stringify({ approved, notes }) }),
    onSuccess: (_: any, v: any) => { qc.invalidateQueries({ queryKey: ["journal-manual"] }); toast({ title: v.approved ? "تمت المراجعة والموافقة" : "تم رفض القيد" }); setActionModal(null); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "حدث خطأ" }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, approved, notes }: any) => apiFetch(`/finance/journal-manual/${id}/approve`, { method: "PATCH", body: JSON.stringify({ approved, notes }) }),
    onSuccess: (_: any, v: any) => { qc.invalidateQueries({ queryKey: ["journal-manual"] }); toast({ title: v.approved ? "تم اعتماد القيد" : "تم رفض القيد" }); setActionModal(null); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "حدث خطأ" }),
  });

  const postMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/finance/journal-manual/${id}/post`, { method: "PATCH", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["journal-manual"] }); toast({ title: "تم ترحيل القيد بنجاح" }); setActionModal(null); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "حدث خطأ" }),
  });

  const list = data?.data ?? data ?? [];
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
    createMutation.mutate(form);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">القيود اليدوية</h2>
          <p className="text-sm text-gray-500 mt-1">إنشاء ومتابعة دورة اعتماد القيود اليدوية (مسودة ← مراجعة ← اعتماد ← ترحيل)</p>
        </div>
        <Button onClick={() => { setForm({ description: "", costCenter: "", notes: "", lines: [emptyLine(), emptyLine()] }); setShowCreate(true); }}>
          <Plus className="h-4 w-4 ml-2" />
          قيد يدوي جديد
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        {[{ v: "", l: "الكل" }, { v: "draft", l: "مسودة" }, { v: "pending_review", l: "في انتظار المراجعة" }, { v: "approved", l: "معتمدة" }, { v: "posted", l: "مُرحَّلة" }, { v: "rejected", l: "مرفوضة" }].map(opt => (
          <button
            key={opt.v}
            onClick={() => setStatusFilter(opt.v)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${statusFilter === opt.v ? "bg-primary text-white border-primary" : "bg-white hover:bg-gray-50"}`}
          >
            {opt.l}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-gray-400">لا توجد قيود يدوية</div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">المرجع</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">البيان</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">التاريخ</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">أنشأه</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">الحالة</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">راجعه</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">اعتمده</th>
                  <th className="px-3 py-3 text-right text-xs text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row: any) => {
                  const cfg = STATUS_CONFIG[row.approvalStatus] ?? STATUS_CONFIG.draft;
                  return (
                    <tr key={row.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-3">{row.ref}</td>
                      <td className="px-3 py-3">{row.description}</td>
                      <td className="px-3 py-3 text-gray-500">{formatDate(row.createdAt)}</td>
                      <td className="px-3 py-3">{row.createdByName}</td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className={`bg-${cfg.color}-100 text-${cfg.color}-700`}>{cfg.label}</Badge>
                      </td>
                      <td className="px-3 py-3">{row.reviewedByName ?? "—"}</td>
                      <td className="px-3 py-3">{row.approvedByName ?? "—"}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => setSelectedJournal(row)} className="text-blue-600 hover:underline text-xs">عرض</button>
                          {row.approvalStatus === "draft" && (
                            <button onClick={() => setActionModal({ type: "submit", journal: row })} className="text-yellow-600 hover:underline text-xs">إرسال للمراجعة</button>
                          )}
                          {row.approvalStatus === "pending_review" && (
                            <button onClick={() => { setActionNotes(""); setActionModal({ type: "review", journal: row }); }} className="text-indigo-600 hover:underline text-xs">مراجعة</button>
                          )}
                          {row.approvalStatus === "approved" && (
                            <button onClick={() => setActionModal({ type: "post", journal: row })} className="text-green-600 hover:underline text-xs">ترحيل</button>
                          )}
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

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold">إنشاء قيد يدوي جديد</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">البيان *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف القيد اليدوي" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">مركز التكلفة</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.costCenter} onChange={e => setForm(f => ({ ...f, costCenter: e.target.value }))} placeholder="مثال: الإدارة العامة" />
                </div>
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

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
                <Button type="submit" disabled={createMutation.isPending || !isBalanced}>
                  {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء القيد"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedJournal && (
        <Dialog open={!!selectedJournal} onOpenChange={() => setSelectedJournal(null)}>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-start">{`قيد رقم ${selectedJournal.ref}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">البيان: </span><span className="font-medium">{selectedJournal.description}</span></div>
                <div><span className="text-gray-500">الحالة: </span><span className="font-medium">{STATUS_CONFIG[selectedJournal.approvalStatus]?.label}</span></div>
                <div><span className="text-gray-500">أنشأه: </span><span>{selectedJournal.createdByName}</span></div>
                <div><span className="text-gray-500">التاريخ: </span><span>{formatDate(selectedJournal.createdAt)}</span></div>
                {selectedJournal.reviewedByName && <div><span className="text-gray-500">راجعه: </span><span>{selectedJournal.reviewedByName}</span></div>}
                {selectedJournal.approvedByName && <div><span className="text-gray-500">اعتمده: </span><span>{selectedJournal.approvedByName}</span></div>}
                {selectedJournal.approvalNotes && <div className="col-span-2"><span className="text-gray-500">ملاحظات: </span><span>{selectedJournal.approvalNotes}</span></div>}
              </div>
              <div className="rounded-xl border overflow-hidden text-sm">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-right">الحساب</th>
                      <th className="px-3 py-2 text-right">البيان</th>
                      <th className="px-3 py-2 text-right">مدين</th>
                      <th className="px-3 py-2 text-right">دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedJournal.lines ?? []).filter((l: any) => l).map((l: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{l.accountCode}</td>
                        <td className="px-3 py-2">{l.description}</td>
                        <td className="px-3 py-2 font-mono">{l.debit > 0 ? formatCurrency(l.debit) : ""}</td>
                        <td className="px-3 py-2 font-mono">{l.credit > 0 ? formatCurrency(l.credit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {actionModal && (
        <AlertDialog open={!!actionModal} onOpenChange={() => setActionModal(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {actionModal.type === "submit" ? "إرسال للمراجعة" :
                  actionModal.type === "review" ? "مراجعة القيد" :
                  actionModal.type === "post" ? "ترحيل القيد" : ""}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {actionModal.type === "submit" && `هل تريد إرسال القيد ${actionModal.journal.ref} للمراجعة والاعتماد؟`}
                {actionModal.type === "post" && `هل تريد ترحيل القيد ${actionModal.journal.ref}؟ لا يمكن التراجع عن الترحيل.`}
                {(actionModal.type === "review" || actionModal.type === "approve") && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium mb-1">ملاحظات</label>
                    <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={actionNotes} onChange={e => setActionNotes(e.target.value)} placeholder="ملاحظات الرفض مطلوبة عند الرفض" />
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              {actionModal.type === "submit" && <AlertDialogAction onClick={() => submitMutation.mutate(actionModal.journal.id)}>إرسال</AlertDialogAction>}
              {actionModal.type === "review" && (
                <>
                  <Button variant="outline" className="border-red-300 text-red-600" onClick={() => reviewMutation.mutate({ id: actionModal.journal.id, approved: false, notes: actionNotes })}>رفض</Button>
                  <AlertDialogAction onClick={() => reviewMutation.mutate({ id: actionModal.journal.id, approved: true, notes: actionNotes })}>موافقة</AlertDialogAction>
                </>
              )}
              {actionModal.type === "post" && <AlertDialogAction onClick={() => postMutation.mutate(actionModal.journal.id)}>ترحيل</AlertDialogAction>}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
