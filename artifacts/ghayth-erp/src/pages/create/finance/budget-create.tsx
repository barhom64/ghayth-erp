import { useState } from "react";
import { todayLocal } from "@/lib/formatters";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const now = new Date();
const DRAFT_KEY = "finance_budget_create";
const INITIAL = { accountCode: "", period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, amount: "", date: todayLocal() };

export default function BudgetCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/budget", "POST", [["budget"]]);
  const { data: accountsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const accounts = accountsData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const handleSubmit = async () => {
    let periodError: string | null = null;
    if (!form.period) {
      periodError = "الفترة مطلوبة";
    } else {
      const year = parseInt(form.period.split("-")[0], 10);
      if (isNaN(year) || year < 2020 || year > 2040) periodError = "السنة يجب أن تكون بين 2020 و 2040";
    }
    const firstError = validate({
      accountCode: form.accountCode ? null : "يرجى اختيار الحساب",
      period: periodError,
      amount: !form.amount ? "المبلغ مطلوب" : Number(form.amount) < 0 ? "المبلغ يجب أن يكون صفر أو أكثر" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
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
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة بند الميزانية", description: err?.fix ?? err?.message });
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
        <FormFieldWrapper label="التاريخ">
          <DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
        </FormFieldWrapper>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormFieldWrapper label="الحساب" required error={fieldErrors.accountCode}>
          <Select value={form.accountCode} onValueChange={(v) => setForm((f) => ({ ...f, accountCode: v }))}>
            <SelectTrigger><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
            <SelectContent>
              {accounts.map((a: any) => (
                <SelectItem key={a.code || a.id} value={String(a.code || a.id)}>{a.code} - {a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="الفترة" required error={fieldErrors.period}>
          <Input type="month" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} />
        </FormFieldWrapper>
        <NumberField label="المبلغ المخصص" required value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} step={0.01} min={0} error={fieldErrors.amount} />
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/budget")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
