import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { useAppContext } from "@/contexts/app-context";
import {
  AccountFormFields, ACCOUNT_FORM_INITIAL, USAGE_UNSET, SHARED,
} from "@/components/shared/account-form-fields";

const DRAFT_KEY = "finance_accounts_create";

export default function AccountsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { filteredBranches } = useAppContext();
  const createMut = useApiMutation("/finance/accounts", "POST", [["accounts"], ["accounts-list"], ["accounts-posting"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, ACCOUNT_FORM_INITIAL);
  const { data: accountsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const accounts = accountsData?.data || [];
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  // #1715 (Comment #6): the next free code is derived server-side by the
  // level/step-aware /finance/accounts/next-code endpoint — the single source
  // of truth so the UI, imports and API all agree. Re-runs on parent change.
  const { data: nextCodeData } = useApiQuery<{ code: string | null }>(
    ["account-next-code", form.parentCode],
    `/finance/accounts/next-code?parentCode=${encodeURIComponent(form.parentCode)}`,
    { enabled: !!form.parentCode },
  );

  // #1715: when launched from a tree node's «إضافة حساب فرعي» (?parent=CODE),
  // pre-fill the parent once accounts have loaded. Guarded so it runs once.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    const parentParam = new URLSearchParams(window.location.search).get("parent");
    if (!parentParam || accounts.length === 0) return;
    prefilledRef.current = true;
    if (form.parentCode) return; // a restored draft already has a parent — respect it
    setForm((f) => ({ ...f, parentCode: parentParam }));
  }, [accounts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill the suggested code only while the field is empty, so it never
  // clobbers a code the operator typed or a restored draft.
  useEffect(() => {
    const suggested = nextCodeData?.code;
    if (suggested && !form.code) setForm((f) => (f.code ? f : { ...f, code: suggested }));
  }, [nextCodeData?.code]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const { branchScope, ...rest } = form;
      const payload = {
        ...rest,
        branchId: branchScope && branchScope !== SHARED ? Number(branchScope) : null,
        // Sentinel → null so the backend treats "unset" as "inherit from
        // parent / leave unclassified" (it runs the #1715 inheritance logic).
        accountUsage: rest.accountUsage && rest.accountUsage !== USAGE_UNSET ? rest.accountUsage : null,
      };
      await createMut.mutateAsync(payload);
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
      <AccountFormFields
        form={form}
        setForm={setForm}
        mode="create"
        accounts={accounts}
        branches={filteredBranches}
        fieldErrors={fieldErrors}
      />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/accounts")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || !form.code || createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
