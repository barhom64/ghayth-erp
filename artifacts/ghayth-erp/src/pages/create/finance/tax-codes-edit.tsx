import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiMutation, useApiQuery, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Autocomplete } from "@/components/ui/autocomplete";
import { CreatePageLayout } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

/**
 * Tax Code editor — mirrors tax-codes-create.tsx structure but
 * loads the existing row from PATCH /finance/tax-codes/:id.
 */

const TAX_TYPES = [
  { value: "standard",       label: "قياسي (15%)",          zatca: "S" },
  { value: "zero",           label: "صفري (0%)",            zatca: "Z" },
  { value: "exempt",         label: "معفى",                  zatca: "E" },
  { value: "out_of_scope",   label: "خارج النطاق",           zatca: "O" },
  { value: "reverse_charge", label: "عكس الالتزام (RCM)",    zatca: "S" },
] as const;

interface TaxCodeRow {
  id: number;
  code: string;
  name: string;
  nameEn: string | null;
  rate: number | string;
  taxType: "standard" | "zero" | "exempt" | "out_of_scope" | "reverse_charge";
  accountId: number | null;
  inputAccountId: number | null;
  zatcaCategoryCode: string | null;
  zatcaExemptionReason: string | null;
  isInclusiveDefault: boolean;
  isActive: boolean;
}

export default function TaxCodesEdit() {
  const [, params] = useRoute("/finance/tax-codes/:id/edit");
  const id = params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: existing, isLoading, isError } = useApiQuery<TaxCodeRow>(
    ["tax-code-detail", id ?? ""],
    id ? `/finance/tax-codes/${id}` : null,
    !!id,
  );

  const patchMut = useApiMutation(
    `/finance/tax-codes/${id}`, "PATCH",
    [["tax-codes"], ["tax-code-detail", id ?? ""]],
  );

  const [form, setForm] = useState({
    code: "",
    name: "",
    nameEn: "",
    rate: 15,
    taxType: "standard" as TaxCodeRow["taxType"],
    accountId: "",
    inputAccountId: "",
    zatcaCategoryCode: "S",
    zatcaExemptionReason: "",
    isInclusiveDefault: true,
    isActive: true,
  });

  // Hydrate the form when the row arrives.
  useEffect(() => {
    if (!existing) return;
    setForm({
      code: existing.code ?? "",
      name: existing.name ?? "",
      nameEn: existing.nameEn ?? "",
      rate: Number(existing.rate ?? 0),
      taxType: existing.taxType ?? "standard",
      accountId: existing.accountId != null ? String(existing.accountId) : "",
      inputAccountId: existing.inputAccountId != null ? String(existing.inputAccountId) : "",
      zatcaCategoryCode: existing.zatcaCategoryCode ?? "S",
      zatcaExemptionReason: existing.zatcaExemptionReason ?? "",
      isInclusiveDefault: existing.isInclusiveDefault ?? true,
      isActive: existing.isActive ?? true,
    });
  }, [existing]);

  const { data: accountsData } = useApiQuery<{ data: any[] }>(
    ["accounts-list"], "/finance/accounts",
  );
  const accounts = accountsData?.data ?? [];
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError || !existing) return <ErrorState />;

  const handleTaxTypeChange = (v: string) => {
    const t = TAX_TYPES.find((x) => x.value === v);
    setForm((f) => ({
      ...f,
      taxType: v as TaxCodeRow["taxType"],
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
      await patchMut.mutateAsync({
        ...form,
        accountId: form.accountId ? Number(form.accountId) : null,
        inputAccountId: form.inputAccountId ? Number(form.inputAccountId) : null,
        zatcaExemptionReason: form.zatcaExemptionReason.trim() || null,
        nameEn: form.nameEn.trim() || null,
      });
      toast({ title: "تم حفظ التعديلات" });
      setLocation("/finance/tax-codes");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ", description: err?.fix ?? getErrorMessage(err) });
    }
  };

  const needsExemptionReason = form.taxType === "exempt" || form.taxType === "out_of_scope";

  return (
    <CreatePageLayout title={`تعديل رمز الضريبة — ${existing.code}`} backPath="/finance/tax-codes">
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
          error={fieldErrors.name}
        />
        <TextField
          label="الاسم بالإنجليزية" dir="ltr"
          value={form.nameEn}
          onChange={(v) => setForm((f) => ({ ...f, nameEn: v }))}
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
          <Autocomplete
            value={form.accountId}
            onChange={(v) => setForm((f) => ({ ...f, accountId: String(v) }))}
            options={accounts
              .filter((a: any) => a.type === "liability" || String(a.code).startsWith("23"))
              .map((a: any) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            placeholder="ابحث عن حساب الخصوم..."
            emptyMessage="لا توجد حسابات"
          />
        </FormFieldWrapper>

        <FormFieldWrapper label="حساب ضريبة المدخلات (مدين عند الشراء)">
          <Autocomplete
            value={form.inputAccountId}
            onChange={(v) => setForm((f) => ({ ...f, inputAccountId: String(v) }))}
            options={accounts
              .filter((a: any) => a.type === "asset" || String(a.code).startsWith("11") || String(a.code).startsWith("14"))
              .map((a: any) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            placeholder="ابحث عن حساب الأصول..."
            emptyMessage="لا توجد حسابات"
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
        <Button onClick={handleSubmit} disabled={patchMut.isPending} rateLimitAware>
          {patchMut.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
