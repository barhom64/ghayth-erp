import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { Textarea } from "@/components/ui/textarea";

const APPLIES_TO = [
  { value: "royalties",          label: "إتاوات",          defaultRate: 15 },
  { value: "technical_services", label: "خدمات فنية",      defaultRate: 15 },
  { value: "management_fees",    label: "أتعاب إدارة",     defaultRate: 20 },
  { value: "dividends",          label: "أرباح موزعة",     defaultRate:  5 },
  { value: "interest",           label: "فوائد",            defaultRate:  5 },
  { value: "rent_movable",       label: "تأجير منقولات",   defaultRate:  5 },
  { value: "telecommunications", label: "اتصالات",          defaultRate:  5 },
  { value: "air_tickets",        label: "تذاكر طيران",     defaultRate:  5 },
  { value: "freight",            label: "شحن",              defaultRate:  5 },
  { value: "insurance_premium",  label: "أقساط تأمين",     defaultRate:  5 },
  { value: "other",              label: "أخرى",             defaultRate:  5 },
] as const;
type AppliesTo = (typeof APPLIES_TO)[number]["value"];

interface WhtCategoryRow {
  id: number;
  code: string;
  name: string;
  nameEn: string | null;
  rate: number | string;
  appliesTo: AppliesTo;
  payableAccountId: number | null;
  description: string | null;
  isActive: boolean;
}

export default function WhtCategoriesEdit() {
  const [, params] = useRoute("/finance/wht-categories/:id/edit");
  const id = params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: existing, isLoading, isError } = useApiQuery<WhtCategoryRow>(
    ["wht-category-detail", id ?? ""],
    id ? `/finance/accounts/wht-categories/${id}` : null,
    !!id,
  );

  const patchMut = useApiMutation(
    `/finance/accounts/wht-categories/${id}`, "PATCH",
    [["wht-categories"], ["wht-category-detail", id ?? ""]],
  );

  const [form, setForm] = useState({
    code: "",
    name: "",
    nameEn: "",
    rate: 15,
    appliesTo: "technical_services" as AppliesTo,
    payableAccountId: "",
    description: "",
    isActive: true,
  });

  useEffect(() => {
    if (!existing) return;
    setForm({
      code: existing.code ?? "",
      name: existing.name ?? "",
      nameEn: existing.nameEn ?? "",
      rate: Number(existing.rate ?? 0),
      appliesTo: existing.appliesTo ?? "technical_services",
      payableAccountId: existing.payableAccountId != null ? String(existing.payableAccountId) : "",
      description: existing.description ?? "",
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

  const handleAppliesToChange = (v: string) => {
    const cfg = APPLIES_TO.find((x) => x.value === v);
    setForm((f) => ({
      ...f,
      appliesTo: v as AppliesTo,
      rate: cfg?.defaultRate ?? f.rate,
    }));
  };

  const handleSubmit = async () => {
    const firstError = validate({
      code: form.code.trim() ? null : "الرمز مطلوب",
      name: form.name.trim() ? null : "الاسم بالعربية مطلوب",
      rate: form.rate < 0 || form.rate > 100 ? "النسبة يجب أن تكون بين 0 و 100" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await patchMut.mutateAsync({
        ...form,
        payableAccountId: form.payableAccountId ? Number(form.payableAccountId) : null,
        nameEn: form.nameEn.trim() || null,
        description: form.description.trim() || null,
      });
      toast({ title: "تم حفظ التعديلات" });
      setLocation("/finance/wht-categories");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ", description: err?.fix ?? getErrorMessage(err) });
    }
  };

  return (
    <CreatePageLayout title={`تعديل فئة الاستقطاع — ${existing.code}`} backPath="/finance/wht-categories">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField
          label="الرمز" required dir="ltr"
          value={form.code}
          onChange={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))}
          placeholder="WHT-TEC15"
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

        <FormFieldWrapper label="ينطبق على">
          <Select value={form.appliesTo} onValueChange={handleAppliesToChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {APPLIES_TO.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label} ({a.defaultRate}%)
                </SelectItem>
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
            />
            <span className="text-muted-foreground text-sm">%</span>
          </div>
        </FormFieldWrapper>

        <FormFieldWrapper label="حساب الاستقطاع المستحق لزاتكا (دائن)">
          <Autocomplete
            value={form.payableAccountId}
            onChange={(v) => setForm((f) => ({ ...f, payableAccountId: String(v) }))}
            options={accounts
              .filter((a: any) => a.type === "liability" || String(a.code).startsWith("23"))
              .map((a: any) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            placeholder="ابحث عن حساب الخصوم..."
            emptyMessage="لا توجد حسابات"
          />
        </FormFieldWrapper>

        <div className="md:col-span-2">
          <FormFieldWrapper label="الوصف">
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
            />
          </FormFieldWrapper>
        </div>

        <div className="flex items-center gap-3 pt-6">
          <Switch
            checked={form.isActive}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            id="isActive"
          />
          <Label htmlFor="isActive">نشط</Label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/wht-categories")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={patchMut.isPending} rateLimitAware>
          {patchMut.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
