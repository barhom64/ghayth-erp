import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Autocomplete } from "@/components/ui/autocomplete";
import { Switch } from "@/components/ui/switch";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { ACCOUNT_USAGE_LABELS_AR } from "@/lib/finance-account-usage";
import { ACCOUNT_TYPES } from "@/lib/finance-type-maps";

/**
 * Unified chart-of-accounts form (#1715 owner: «وحد نماذج الحسابات ورتبها»).
 *
 * One canonical field set + order, shared by accounts-create and accounts-edit
 * so the two forms can never drift again. The page owns data-loading + submit;
 * this component owns ONLY the field rendering. `mode` toggles the create-only
 * affordances: the code is editable on create but immutable on edit, and the
 * branch SCOPE is a create-time decision (the PATCH route doesn't move an
 * account between branches), so it's hidden on edit.
 *
 * Canonical order: الرمز → الاسم → الاسم بالإنجليزية → النوع → الحساب الأب →
 *   الطبيعة → نطاق الحساب (إنشاء فقط) → تصنيف الاستخدام → سياسة استخدام الأبناء →
 *   يقبل الترحيل / حساب تحليلي.
 */

// Re-exported from the shared map (single source — #1715 module review).
export const TYPE_LABELS = ACCOUNT_TYPES;
export const NATURE_LABELS: Record<string, string> = { debit: "مدين", credit: "دائن" };
export const CHILDREN_USAGE_POLICY_LABELS: Record<string, string> = {
  inherit_locked: "إلزام تصنيف الأب (الأبناء يرثون ولا يُغيَّر)",
  inherit_default: "وراثة افتراضية (قابلة للتغيير)",
  mixed_allowed: "السماح بتصنيفات مختلطة للأبناء",
  manual_required: "إلزام اختيار تصنيف يدوي لكل ابن",
};

export const USAGE_UNSET = "_unset";
export const SHARED = "__shared__";

export interface AccountFormState {
  code: string;
  name: string;
  nameEn: string;
  type: string;
  parentCode: string;
  nature: string;
  branchScope: string;
  accountUsage: string;
  childrenUsagePolicy: string;
  allowPosting: boolean;
  isAnalytical: boolean;
}

export const ACCOUNT_FORM_INITIAL: AccountFormState = {
  code: "", name: "", nameEn: "", type: "asset", parentCode: "", nature: "debit",
  branchScope: SHARED, accountUsage: USAGE_UNSET, childrenUsagePolicy: "inherit_default",
  allowPosting: true, isAnalytical: false,
};

/** Map a loaded account row into the unified form state (edit page). */
export function accountToFormState(a: any): AccountFormState {
  return {
    code: a?.code ?? "",
    name: a?.name ?? "",
    nameEn: a?.nameEn ?? "",
    type: a?.type ?? "asset",
    parentCode: a?.parentCode ?? "",
    nature: a?.nature ?? "debit",
    branchScope: a?.branchId ? String(a.branchId) : SHARED,
    accountUsage: a?.accountUsage ?? USAGE_UNSET,
    childrenUsagePolicy: a?.childrenUsagePolicy ?? "inherit_default",
    allowPosting: a?.allowPosting ?? true,
    isAnalytical: a?.isAnalytical ?? false,
  };
}

/** Editable subset of the form, as the PATCH route expects it (edit page). */
export function buildAccountUpdatePayload(form: AccountFormState) {
  return {
    name: form.name,
    type: form.type,
    parentCode: form.parentCode || null,
    nameEn: form.nameEn || null,
    nature: form.nature,
    accountUsage: form.accountUsage && form.accountUsage !== USAGE_UNSET ? form.accountUsage : null,
    childrenUsagePolicy: form.childrenUsagePolicy || null,
    allowPosting: form.allowPosting,
    isAnalytical: form.isAnalytical,
  };
}

interface Props {
  form: AccountFormState;
  setForm: (updater: (f: AccountFormState) => AccountFormState) => void;
  mode: "create" | "edit";
  /** Parent-account options: [{ code, name }]. */
  accounts: Array<{ code: string; name: string }>;
  /** Branches for the create-only scope field. */
  branches?: Array<{ id: number; name: string }>;
  fieldErrors?: Record<string, string>;
}

export function AccountFormFields({ form, setForm, mode, accounts, branches = [], fieldErrors = {} }: Props) {
  const set = (patch: Partial<AccountFormState>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {mode === "edit" ? (
        <FormFieldWrapper label="الرمز" hint="رمز الحساب غير قابل للتعديل بعد الإنشاء">
          <Input value={form.code} disabled dir="ltr" />
        </FormFieldWrapper>
      ) : (
        <TextField label="الرمز" required dir="ltr" value={form.code} onChange={(v) => set({ code: v })} placeholder="1100" error={fieldErrors.code} />
      )}
      <TextField label="الاسم" required value={form.name} onChange={(v) => set({ name: v })} error={fieldErrors.name} />
      <TextField label="الاسم بالإنجليزية" dir="ltr" value={form.nameEn} onChange={(v) => set({ nameEn: v })} placeholder="مثال: Current Assets" />

      <FormFieldWrapper label="النوع">
        <Select value={form.type} onValueChange={(v) => set({ type: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormFieldWrapper>

      <FormFieldWrapper label="الحساب الأب">
        <Autocomplete
          value={form.parentCode}
          onChange={(v) => set({ parentCode: String(v) })}
          options={accounts.map((a) => ({ value: String(a.code), label: `${a.code} - ${a.name}` }))}
          placeholder="ابحث عن حساب أب..."
          emptyMessage="لا توجد حسابات"
        />
      </FormFieldWrapper>

      <FormFieldWrapper label="الطبيعة">
        <Select value={form.nature} onValueChange={(v) => set({ nature: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(NATURE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormFieldWrapper>

      {mode === "create" && (
        <FormFieldWrapper label="نطاق الحساب" hint="حساب مشترك يظهر لكل الفروع، أو حساب فرعي خاص بفرع واحد">
          <Select value={form.branchScope} onValueChange={(v) => set({ branchScope: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SHARED}>مشترك على مستوى الشركة</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>خاص بفرع: {b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
      )}

      <FormFieldWrapper label="تصنيف الاستخدام (accountUsage)" hint="يحدّد كيف يُعامَل الحساب في طرق الدفع والترحيل (صندوق/بنك/عهدة/ذمم…). اتركه «يُورَّث من الأب» ليأخذ تصنيف الحساب الأب تلقائياً.">
        <Select value={form.accountUsage} onValueChange={(v) => set({ accountUsage: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={USAGE_UNSET}>— يُورَّث من الأب / غير مصنّف —</SelectItem>
            {Object.entries(ACCOUNT_USAGE_LABELS_AR).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormFieldWrapper>

      <FormFieldWrapper label="سياسة استخدام الأبناء (childrenUsagePolicy)" hint="تحكم في تصنيف الحسابات الفرعية التي تُنشأ تحت هذا الحساب.">
        <Select value={form.childrenUsagePolicy} onValueChange={(v) => set({ childrenUsagePolicy: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(CHILDREN_USAGE_POLICY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormFieldWrapper>

      <div className="flex items-center gap-3 pt-6">
        <Switch checked={form.allowPosting} onCheckedChange={(v) => set({ allowPosting: v })} id="allowPosting" />
        <Label htmlFor="allowPosting">يقبل الحركة (ترحيل)</Label>
      </div>
      <div className="flex items-center gap-3 pt-6">
        <Switch checked={form.isAnalytical} onCheckedChange={(v) => set({ isAnalytical: v })} id="isAnalytical" />
        <Label htmlFor="isAnalytical">حساب تحليلي</Label>
      </div>
    </div>
  );
}
