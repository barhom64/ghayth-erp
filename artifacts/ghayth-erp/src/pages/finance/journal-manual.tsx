import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr as formatDate } from "@/lib/formatters";
import { Plus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "gray" },
  pending_review: { label: "في انتظار المراجعة", color: "yellow" },
  approved: { label: "معتمد", color: "blue" },
  posted: { label: "مُرحَّل", color: "green" },
  rejected: { label: "مرفوض", color: "red" },
};

export default function JournalManualPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [statusFilter, setStatusFilter] = useState("");
  const [actionModal, setActionModal] = useState<{ type: string; journal: any } | null>(null);
  const [actionNotes, setActionNotes] = useState("");

  const filterSuffix = statusFilter ? (scopeSuffix ? `${scopeSuffix}&status=${statusFilter}` : `?status=${statusFilter}`) : scopeSuffix;
  const { data, isLoading } = useApiQuery<any>(
    ["journal-manual", statusFilter],
    `/finance/journal-manual${filterSuffix}`
  );

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

  const postMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/finance/journal-manual/${id}/post`, { method: "PATCH", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["journal-manual"] }); toast({ title: "تم ترحيل القيد بنجاح" }); setActionModal(null); },
    onError: (e: any) => toast({ variant: "destructive", title: e.message ?? "حدث خطأ" }),
  });

  const list = data?.data ?? data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">القيود اليدوية</h2>
          <p className="text-sm text-gray-500 mt-1">إنشاء ومتابعة دورة اعتماد القيود اليدوية (مسودة ← مراجعة ← اعتماد ← ترحيل)</p>
        </div>
        <Link href="/finance/journal-manual/create">
          <Button>
            <Plus className="h-4 w-4 ml-2" />
            قيد يدوي جديد
          </Button>
        </Link>
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
                    <tr
                      key={row.id}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/finance/journal-manual/${row.id}`)}
                    >
                      <td className="px-3 py-3">{row.ref}</td>
                      <td className="px-3 py-3">{row.description}</td>
                      <td className="px-3 py-3 text-gray-500">{formatDate(row.createdAt)}</td>
                      <td className="px-3 py-3">{row.createdByName}</td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className={`bg-${cfg.color}-100 text-${cfg.color}-700`}>{cfg.label}</Badge>
                      </td>
                      <td className="px-3 py-3">{row.reviewedByName ?? "—"}</td>
                      <td className="px-3 py-3">{row.approvedByName ?? "—"}</td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2 flex-wrap">
                          <Link href={`/finance/journal-manual/${row.id}`}>
                            <button className="text-blue-600 hover:underline text-xs">عرض</button>
                          </Link>
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
