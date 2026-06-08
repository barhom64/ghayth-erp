import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, apiPatch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useQueryClient } from "@tanstack/react-query";
import { CreatePageLayout } from "@workspace/ui-core";
import {
  AccountFormFields, ACCOUNT_FORM_INITIAL, accountToFormState, buildAccountUpdatePayload,
} from "@/components/shared/account-form-fields";

export default function AccountsEdit() {
  const [, params] = useRoute("/finance/accounts/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  // Same canonical form shape as the create page — the two now share one form.
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("finance_accounts_edit", ACCOUNT_FORM_INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const { data, isLoading, isError } = useApiQuery<any>(["accounts-list"], "/finance/accounts");
  const items = data?.data || [];
  const account = items.find((a: any) => String(a.id) === params?.id);

  useEffect(() => {
    if (account) setForm(() => accountToFormState(account));
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

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
      await apiPatch(`/finance/accounts/${params?.id}`, buildAccountUpdatePayload(form));
      clearDraft();
      toast({ title: "تم تحديث الحساب" });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["accounts-list"] });
      setLocation("/finance/accounts");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء التحديث", description: err?.fix ?? err?.message });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  if (!account) return <div className="text-center py-16 text-muted-foreground">الحساب غير موجود</div>;

  return (
    <CreatePageLayout
      title={`تعديل الحساب — ${account.code}`}
      subtitle="تعديل بيانات الحساب في شجرة الحسابات"
      backPath="/finance/accounts"
    >
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <AccountFormFields
        form={form}
        setForm={setForm}
        mode="edit"
        accounts={items}
        fieldErrors={fieldErrors}
      />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/accounts")}>إلغاء</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2" rateLimitAware>
          <Save className="h-4 w-4" /> {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
