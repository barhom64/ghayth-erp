import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Autocomplete } from "@/components/ui/autocomplete";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { Switch } from "@/components/ui/switch";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const typeMap: Record<string, string> = { asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات" };
const natureMap: Record<string, string> = { debit: "مدين", credit: "دائن" };

const DRAFT_KEY = "finance_accounts_create";
const INITIAL = { code: "", name: "", nameEn: "", type: "asset", parentCode: "", nature: "debit", allowPosting: true, isAnalytical: false };

export default function AccountsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/accounts", "POST", [["accounts"], ["accounts-list"], ["accounts-posting"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { data: accountsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const accounts = accountsData?.data || [];
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleSubmit = async () => {
    const firstError = validate({
      code: form.code ? null : "الرمز مطلوب",
      name: form.name ? null : "الاسم مطلوب",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync(form);
      clearDraft();
      toast({ title: "تم إضافة الحساب" });
      setLocation("/finance/accounts");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ", description: err?.fix ?? getErrorMessage(err) });
    }
  };

  return (
    <CreatePageLayout title="إضافة حساب جديد" backPath="/finance/accounts">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField label="الرمز" required dir="ltr" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v }))} placeholder="1100" error={fieldErrors.code} />
        <TextField label="الاسم" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={fieldErrors.name} />
        <TextField label="الاسم بالإنجليزية" dir="ltr" value={form.nameEn} onChange={(v) => setForm((f) => ({ ...f, nameEn: v }))} placeholder="Account Name" />
        <FormFieldWrapper label="النوع">
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(typeMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="الحساب الأب">
          <Autocomplete
            value={form.parentCode}
            onChange={(v) => setForm((f) => ({ ...f, parentCode: String(v) }))}
            options={accounts.map((a: any) => ({ value: String(a.code), label: `${a.code} - ${a.name}` }))}
            placeholder="ابحث عن حساب أب..."
            emptyMessage="لا توجد حسابات"
          />
        </FormFieldWrapper>
        <FormFieldWrapper label="الطبيعة">
          <Select value={form.nature} onValueChange={(v) => setForm((f) => ({ ...f, nature: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(natureMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={form.allowPosting} onCheckedChange={(v) => setForm((f) => ({ ...f, allowPosting: v }))} id="allowPosting" />
          <Label htmlFor="allowPosting">يقبل الحركة (ترحيل)</Label>
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={form.isAnalytical} onCheckedChange={(v) => setForm((f) => ({ ...f, isAnalytical: v }))} id="isAnalytical" />
          <Label htmlFor="isAnalytical">حساب تحليلي</Label>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/accounts")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || !form.code || createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
