import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const now = new Date();
const DRAFT_KEY = "finance_budget_create";
const INITIAL = { accountCode: "", period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, amount: "", date: new Date().toISOString().split("T")[0] };

export default function BudgetCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/budget", "POST", [["budget"]]);
  const { data: accountsData } = useApiQuery<{ data: any[] }>(["accounts-posting"], "/finance/accounts?postingOnly=true");
  const accounts = accountsData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const handleSubmit = async () => {
    if (!form.accountCode) {
      toast({ variant: "destructive", title: "يرجى اختيار الحساب" });
      return;
    }
    if (!form.period) {
      toast({ variant: "destructive", title: "الفترة مطلوبة" });
      return;
    }
    if (!form.amount) {
      toast({ variant: "destructive", title: "المبلغ مطلوب" });
      return;
    }
    try {
      await createMut.mutateAsync({
        accountCode: form.accountCode,
        period: form.period,
        amount: Number(form.amount),
        date: form.date || undefined,
      });
      clearDraft();
      toast({ title: "تم إضافة بند الميزانية بنجاح" });
      setLocation("/finance/budget");
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة بند الميزانية" });
    }
  };

  return (
    <CreatePageLayout title="إضافة بند ميزانية" backPath="/finance/budget">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <Label>التاريخ</Label>
          <Input className="mt-1" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>الحساب</Label>
          <Select value={form.accountCode} onValueChange={(v) => setForm((f) => ({ ...f, accountCode: v }))}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="اختر الحساب" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a: any) => (
                <SelectItem key={a.code || a.id} value={String(a.code || a.id)}>{a.code} - {a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>الفترة</Label>
          <Input className="mt-1" type="month" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} />
        </div>
        <div><Label>المبلغ المخصص</Label><Input className="mt-1" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></div>
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/budget")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
