import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiPatch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useQueryClient } from "@tanstack/react-query";
import { CreatePageLayout } from "@/components/create-page-layout";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";


const typeMap: Record<string, string> = {
  asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات"
};

export default function AccountsEdit() {
  const [, params] = useRoute("/finance/accounts/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("finance_accounts_edit", { name: "", code: "", type: "" });
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const { data, isLoading, isError } = useApiQuery<any>(["accounts"], "/finance/accounts");
  const items = data?.data || [];
  const account = items.find((a: any) => String(a.id) === params?.id);

  useEffect(() => {
    if (account) {
      setForm({ name: account.name || "", code: account.code || "", type: account.type || "asset" });
    }
  }, [account]);

  const handleSave = async () => {
    const firstError = validate({
      name: form.name ? null : "اسم الحساب مطلوب",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    setSaving(true);
    try {
      await apiPatch(`/finance/accounts/${params?.id}`, { name: form.name, type: form.type });
      clearDraft();
      toast({ title: "تم تحديث الحساب" });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setLocation("/finance/accounts");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء التحديث", description: err?.fix ?? err?.message });
    }
    finally { setSaving(false); }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  if (!account) return <div className="text-center py-16 text-gray-500">الحساب غير موجود</div>;

  return (
    <CreatePageLayout
      title={`تعديل الحساب — ${account.code}`}
      subtitle="تعديل بيانات الحساب في شجرة الحسابات"
      backPath="/finance/accounts"
    >
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField label="اسم الحساب" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={fieldErrors.name} />
          <FormFieldWrapper label="رمز الحساب" hint="رمز الحساب غير قابل للتعديل بعد الإنشاء">
            <Input value={form.code} disabled />
          </FormFieldWrapper>
          <FormFieldWrapper label="النوع">
            <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(typeMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/accounts")}>إلغاء</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2" rateLimitAware>
          <Save className="h-4 w-4" /> {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
