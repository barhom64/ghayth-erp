import { useEffect, useRef } from "react";
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
import { useAppContext } from "@/contexts/app-context";
import { ACCOUNT_USAGE_LABELS_AR } from "@/lib/finance-account-usage";

const typeMap: Record<string, string> = { asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات" };
const natureMap: Record<string, string> = { debit: "مدين", credit: "دائن" };

// #1715: account-usage classification + how children inherit it. Mirrors the
// backend financeAccountClassifier (ChildrenUsagePolicy + accountUsage).
const USAGE_UNSET = "_unset";
const CHILDREN_USAGE_POLICY_LABELS: Record<string, string> = {
  inherit_locked: "إلزام تصنيف الأب (الأبناء يرثون ولا يُغيَّر)",
  inherit_default: "وراثة افتراضية (قابلة للتغيير)",
  mixed_allowed: "السماح بتصنيفات مختلطة للأبناء",
  manual_required: "إلزام اختيار تصنيف يدوي لكل ابن",
};

// #1715 auto-numbering: suggest the next free child code under a parent.
// Prefers numeric siblings sharing the parent's code prefix (the common COA
// scheme), max+1; falls back to `${parentCode}01`. Pure suggestion — the
// operator can always override the editable code field.
function suggestChildCode(parentCode: string, accounts: any[]): string {
  if (!parentCode) return "";
  const siblings = accounts.filter(
    (a) => typeof a.code === "string" && a.code.length > parentCode.length && a.code.startsWith(parentCode),
  );
  const nums = siblings.map((a) => Number(a.code)).filter((n) => Number.isFinite(n));
  if (nums.length) return String(Math.max(...nums) + 1);
  return `${parentCode}01`;
}

const DRAFT_KEY = "finance_accounts_create";
const SHARED = "__shared__";
const INITIAL = { code: "", name: "", nameEn: "", type: "asset", parentCode: "", nature: "debit", allowPosting: true, isAnalytical: false, branchScope: SHARED, accountUsage: USAGE_UNSET, childrenUsagePolicy: "inherit_default" };

export default function AccountsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { filteredBranches } = useAppContext();
  const createMut = useApiMutation("/finance/accounts", "POST", [["accounts"], ["accounts-list"], ["accounts-posting"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { data: accountsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const accounts = accountsData?.data || [];
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  // #1715: when launched from a tree node's «إضافة حساب فرعي» (?parent=CODE),
  // pre-fill the parent and suggest the next code once accounts have loaded.
  // Guarded by a ref so it runs once and never clobbers an in-progress draft.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    const parentParam = new URLSearchParams(window.location.search).get("parent");
    if (!parentParam || accounts.length === 0) return;
    prefilledRef.current = true;
    if (form.parentCode) return; // a restored draft already has a parent — respect it
    setForm((f) => ({
      ...f,
      parentCode: parentParam,
      code: f.code || suggestChildCode(parentParam, accounts),
    }));
  }, [accounts.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <FormFieldWrapper label="نطاق الحساب" hint="حساب مشترك يظهر لكل الفروع، أو حساب فرعي خاص بفرع واحد">
          <Select value={form.branchScope} onValueChange={(v) => setForm((f) => ({ ...f, branchScope: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SHARED}>مشترك على مستوى الشركة</SelectItem>
              {filteredBranches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>خاص بفرع: {b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="تصنيف الاستخدام (accountUsage)" hint="يحدّد كيف يُعامَل الحساب في طرق الدفع والترحيل (صندوق/بنك/عهدة/ذمم…). اتركه «يُورَّث من الأب» ليأخذ تصنيف الحساب الأب تلقائياً.">
          <Select value={form.accountUsage} onValueChange={(v) => setForm((f) => ({ ...f, accountUsage: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={USAGE_UNSET}>— يُورَّث من الأب / غير مصنّف —</SelectItem>
              {Object.entries(ACCOUNT_USAGE_LABELS_AR).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="سياسة استخدام الأبناء (childrenUsagePolicy)" hint="تحكم في تصنيف الحسابات الفرعية التي تُنشأ تحت هذا الحساب.">
          <Select value={form.childrenUsagePolicy} onValueChange={(v) => setForm((f) => ({ ...f, childrenUsagePolicy: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CHILDREN_USAGE_POLICY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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
