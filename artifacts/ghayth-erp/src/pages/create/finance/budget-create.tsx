import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
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
  const { data: accountsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const accounts = accountsData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const errCls = (field: string) => fieldErrors[field] ? "border-red-500 ring-1 ring-red-300" : "";
  const FieldHint = ({ field }: { field: string }) => fieldErrors[field] ? <p className="text-xs text-red-600 mt-1">{fieldErrors[field]}</p> : null;

  const handleSubmit = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.accountCode) localErrors.accountCode = "يرجى اختيار الحساب";
    if (!form.period) {
      localErrors.period = "الفترة مطلوبة";
    } else {
      const year = parseInt(form.period.split("-")[0], 10);
      if (isNaN(year) || year < 2020 || year > 2040) localErrors.period = "السنة يجب أن تكون بين 2020 و 2040";
    }
    if (!form.amount) {
      localErrors.amount = "المبلغ مطلوب";
    } else if (Number(form.amount) < 0) {
      localErrors.amount = "المبلغ يجب أن يكون صفر أو أكثر";
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
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
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة بند الميزانية", description: err?.message });
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
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <Label>التاريخ</Label>
          <div className="mt-1"><DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} /></div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>الحساب <span className="text-red-500">*</span></Label>
          <Select value={form.accountCode} onValueChange={(v) => setForm((f) => ({ ...f, accountCode: v }))}>
            <SelectTrigger className={`mt-1 ${errCls("accountCode")}`}>
              <SelectValue placeholder="اختر الحساب" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a: any) => (
                <SelectItem key={a.code || a.id} value={String(a.code || a.id)}>{a.code} - {a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldHint field="accountCode" />
        </div>
        <div>
          <Label>الفترة <span className="text-red-500">*</span></Label>
          <Input className={`mt-1 ${errCls("period")}`} type="month" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} />
          <FieldHint field="period" />
        </div>
        <div><Label>المبلغ المخصص <span className="text-red-500">*</span></Label><Input className={`mt-1 ${errCls("amount")}`} type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /><FieldHint field="amount" /></div>
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
