import { useLocation } from "wouter";
import { useApiMutation, getErrorMessage } from "@/lib/api";
import { AccountIdSelect } from "@/components/shared/entity-selects";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CreatePageLayout } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { Switch } from "@/components/ui/switch";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

/**
 * Tax Code creator — mirrors accounts-create.tsx structure.
 *
 * Defaults to a 15% standard VAT entry (the most common Saudi case)
 * and pre-selects the inclusive-by-default flag since most operators
 * enter gross prices, not net.
 */

const TAX_TYPES = [
  { value: "standard",       label: "قياسي (15%)",          zatca: "S" },
  { value: "zero",           label: "صفري (0%)",            zatca: "Z" },
  { value: "exempt",         label: "معفى",                  zatca: "E" },
  { value: "out_of_scope",   label: "خارج النطاق",           zatca: "O" },
  { value: "reverse_charge", label: "عكس الالتزام (RCM)",    zatca: "S" },
] as const;

const DRAFT_KEY = "finance_tax_codes_create";
const INITIAL = {
  code: "",
  name: "",
  nameEn: "",
  rate: 15,
  taxType: "standard" as (typeof TAX_TYPES)[number]["value"],
  accountId: "",         // output VAT GL (credit on sale)
  inputAccountId: "",    // input VAT GL (debit on purchase)
  zatcaCategoryCode: "S",
  zatcaExemptionReason: "",
  isInclusiveDefault: true,
  isActive: true,
};

export default function TaxCodesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation(
    "/finance/tax-codes", "POST",
    [["tax-codes"]],
  );
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleTaxTypeChange = (v: string) => {
    // Snap the rate to the convention for the selected type so the
    // operator doesn't have to remember "exempt is always 0%".
    const t = TAX_TYPES.find((x) => x.value === v);
    setForm((f) => ({
      ...f,
      taxType: v as (typeof TAX_TYPES)[number]["value"],
      rate: v === "zero" || v === "exempt" || v === "out_of_scope" ? 0 : f.rate || 15,
      zatcaCategoryCode: t?.zatca ?? f.zatcaCategoryCode,
    }));
  };

  const handleSubmit = async () => {
    const firstError = validate({
      code: form.code.trim() ? null : "الرمز مطلوب",
      name: form.name.trim() ? null : "الاسم بالعربية مطلوب",
      rate: form.rate < 0 || form.rate > 100 ? "النسبة يجب أن تكون بين 0 و 100" : null,
      zatcaExemptionReason:
        (form.taxType === "exempt" || form.taxType === "out_of_scope")
          && !form.zatcaExemptionReason.trim()
          ? "سبب الإعفاء مطلوب لزاتكا"
          : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({
        ...form,
        accountId: form.accountId ? Number(form.accountId) : null,
        inputAccountId: form.inputAccountId ? Number(form.inputAccountId) : null,
        zatcaExemptionReason: form.zatcaExemptionReason.trim() || null,
        nameEn: form.nameEn.trim() || null,
      });
      clearDraft();
      toast({ title: "تم إضافة رمز الضريبة" });
      setLocation("/finance/tax-codes");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ", description: err?.fix ?? getErrorMessage(err) });
    }
  };

  const needsExemptionReason = form.taxType === "exempt" || form.taxType === "out_of_scope";

  return (
    <CreatePageLayout title="إضافة رمز ضريبة جديد" backPath="/finance/tax-codes">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField
          label="الرمز" required dir="ltr"
          value={form.code}
          onChange={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))}
          placeholder="VAT15"
          error={fieldErrors.code}
        />
        <TextField
          label="الاسم بالعربية" required
          value={form.name}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          placeholder="ضريبة قيمة مضافة 15%"
          error={fieldErrors.name}
        />
        <TextField
          label="الاسم بالإنجليزية" dir="ltr"
          value={form.nameEn}
          onChange={(v) => setForm((f) => ({ ...f, nameEn: v }))}
          placeholder="VAT 15%"
        />

        <FormFieldWrapper label="نوع الضريبة">
          <Select value={form.taxType} onValueChange={handleTaxTypeChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TAX_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>

        <FormFieldWrapper label="النسبة %" error={fieldErrors.rate}>
          <div className="flex items-center gap-2">
            <input
              type="number" min={0} max={100} step={0.01}
              value={form.rate}
              onChange={(e) => setForm((f) => ({ ...f, rate: Number(e.target.value) }))}
              dir="ltr"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={form.taxType === "zero" || form.taxType === "exempt" || form.taxType === "out_of_scope"}
            />
            <span className="text-muted-foreground text-sm">%</span>
          </div>
        </FormFieldWrapper>

        <FormFieldWrapper label="فئة زاتكا (S/Z/E/O)">
          <input
            type="text" maxLength={2} dir="ltr"
            value={form.zatcaCategoryCode}
            onChange={(e) => setForm((f) => ({ ...f, zatcaCategoryCode: e.target.value.toUpperCase() }))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
          />
        </FormFieldWrapper>

        <FormFieldWrapper label="حساب ضريبة المخرجات (دائن عند البيع)">
          <AccountIdSelect
            value={form.accountId}
            onChange={(v) => setForm((f) => ({ ...f, accountId: v }))}
            label="" allowCreate={false}
            filter={(a: any) => a.type === "liability" || String(a.code).startsWith("23")}
          />
        </FormFieldWrapper>

        <FormFieldWrapper label="حساب ضريبة المدخلات (مدين عند الشراء)">
          <AccountIdSelect
            value={form.inputAccountId}
            onChange={(v) => setForm((f) => ({ ...f, inputAccountId: v }))}
            label="" allowCreate={false}
            filter={(a: any) => a.type === "asset" || String(a.code).startsWith("11") || String(a.code).startsWith("14")}
          />
        </FormFieldWrapper>

        {needsExemptionReason && (
          <div className="md:col-span-2">
            <TextField
              label="سبب الإعفاء (مطلوب لزاتكا)" required
              value={form.zatcaExemptionReason}
              onChange={(v) => setForm((f) => ({ ...f, zatcaExemptionReason: v }))}
              placeholder="مثال: خدمات صحية معفاة وفق المادة 33"
              error={fieldErrors.zatcaExemptionReason}
            />
          </div>
        )}

        <div className="flex items-center gap-3 pt-6">
          <Switch
            checked={form.isInclusiveDefault}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isInclusiveDefault: v }))}
            id="isInclusiveDefault"
          />
          <Label htmlFor="isInclusiveDefault">
            شامل الضريبة افتراضياً (السعر يحتوي الضريبة)
          </Label>
        </div>

        <div className="flex items-center gap-3 pt-6">
          <Switch
            checked={form.isActive}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            id="isActive"
          />
          <Label htmlFor="isActive">نشط (متاح للاختيار في الفواتير)</Label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/tax-codes")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
