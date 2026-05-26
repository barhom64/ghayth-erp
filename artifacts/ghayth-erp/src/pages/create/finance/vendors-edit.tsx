import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiMutation, useApiQuery, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const RESIDENCY_OPTIONS = [
  { value: "resident", label: "مقيم — لا استقطاع" },
  { value: "non_resident_gcc", label: "غير مقيم — دول الخليج" },
  { value: "non_resident_treaty", label: "غير مقيم — معاهدة (DTAA)" },
  { value: "non_resident_other", label: "غير مقيم — أخرى" },
];

interface WhtCategory {
  id: number;
  code: string;
  name: string;
  rate: number | string;
  appliesTo: string;
  isActive: boolean;
}

interface VendorRow {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  taxNumber: string | null;
  address: string | null;
  paymentTerms: string | null;
  residencyStatus: "resident" | "non_resident_gcc" | "non_resident_treaty" | "non_resident_other" | null;
  taxResidenceCountry: string | null;
  defaultWhtRate: number | string | null;
  whtCategoryDefault: string | null;
}

export default function VendorsEdit() {
  const [, params] = useRoute("/finance/vendors/:id/edit");
  const id = params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: existing, isLoading, isError } = useApiQuery<VendorRow>(
    ["vendor", id ?? ""],
    id ? `/finance/vendors/${id}` : null,
    !!id,
  );

  const patchMut = useApiMutation(
    `/finance/vendors/${id}`, "PATCH",
    [["vendors"], ["vendor", id ?? ""]],
  );

  const { data: whtData } = useApiQuery<{ data: WhtCategory[] }>(
    ["wht-categories"], "/finance/wht-categories",
  );
  const whtCategories = useMemo(
    () => (whtData?.data ?? []).filter((c) => c.isActive),
    [whtData],
  );

  const [form, setForm] = useState({
    name: "", contactPerson: "", phone: "", email: "", taxNumber: "",
    address: "", paymentTerms: "",
    residencyStatus: "resident" as VendorRow["residencyStatus"],
    taxResidenceCountry: "",
    defaultWhtRate: "" as string,
    whtCategoryDefault: "" as string,
  });

  useEffect(() => {
    if (!existing) return;
    setForm({
      name: existing.name ?? "",
      contactPerson: existing.contactPerson ?? "",
      phone: existing.phone ?? "",
      email: existing.email ?? "",
      taxNumber: existing.taxNumber ?? "",
      address: existing.address ?? "",
      paymentTerms: existing.paymentTerms ?? "",
      residencyStatus: existing.residencyStatus ?? "resident",
      taxResidenceCountry: existing.taxResidenceCountry ?? "",
      defaultWhtRate: existing.defaultWhtRate != null ? String(existing.defaultWhtRate) : "",
      whtCategoryDefault: existing.whtCategoryDefault ?? "",
    });
  }, [existing]);

  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError || !existing) return <ErrorState />;

  const isNonResident = form.residencyStatus !== "resident";

  const handleSubmit = async () => {
    const rateNum = form.defaultWhtRate ? Number(form.defaultWhtRate) : null;
    const firstError = validate({
      name: form.name ? null : "اسم المورد مطلوب",
      email: form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? "صيغة البريد الإلكتروني غير صحيحة" : null,
      phone: form.phone && form.phone.replace(/\D/g, "").length < 9 ? "رقم الهاتف يجب أن يكون 9 أرقام على الأقل" : null,
      taxNumber: form.taxNumber && !/^\d{15}$/.test(form.taxNumber.replace(/\s/g, "")) ? "الرقم الضريبي يجب أن يكون 15 رقماً" : null,
      taxResidenceCountry: isNonResident && !form.taxResidenceCountry.trim()
        ? "بلد الإقامة الضريبية مطلوب للموردين غير المقيمين" : null,
      defaultWhtRate: rateNum != null && (rateNum < 0 || rateNum > 100)
        ? "النسبة يجب أن تكون بين 0 و 100" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await patchMut.mutateAsync({
        name: form.name,
        contactPerson: form.contactPerson || null,
        phone: form.phone || null,
        email: form.email || null,
        taxNumber: form.taxNumber || null,
        address: form.address || null,
        paymentTerms: form.paymentTerms || null,
        residencyStatus: form.residencyStatus,
        taxResidenceCountry: isNonResident
          ? (form.taxResidenceCountry.toUpperCase().slice(0, 2) || null)
          : null,
        defaultWhtRate: isNonResident && rateNum != null ? rateNum : null,
        whtCategoryDefault: isNonResident ? (form.whtCategoryDefault || null) : null,
      });
      toast({ title: "تم حفظ التعديلات" });
      setLocation(`/finance/vendors/${id}`);
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ", description: err?.fix ?? getErrorMessage(err) });
    }
  };

  return (
    <CreatePageLayout title={`تعديل المورد — ${existing.name}`} backPath={`/finance/vendors/${id}`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TextField label="الاسم" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={fieldErrors.name} />
        <TextField label="جهة الاتصال" value={form.contactPerson} onChange={(v) => setForm((f) => ({ ...f, contactPerson: v }))} />
        <TextField label="الهاتف" type="tel" inputMode="tel" dir="ltr" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} error={fieldErrors.phone} />
        <TextField label="البريد" type="email" dir="ltr" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} error={fieldErrors.email} />
        <TextField label="الرقم الضريبي" dir="ltr" value={form.taxNumber} onChange={(v) => setForm((f) => ({ ...f, taxNumber: v }))} error={fieldErrors.taxNumber} />
        <TextField label="العنوان" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
        <FormFieldWrapper label="شروط الدفع">
          <Select value={form.paymentTerms || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, paymentTerms: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر</SelectItem>
              <SelectItem value="net_30">صافي 30 يوم</SelectItem>
              <SelectItem value="net_60">صافي 60 يوم</SelectItem>
              <SelectItem value="net_90">صافي 90 يوم</SelectItem>
              <SelectItem value="cod">الدفع عند التسليم</SelectItem>
              <SelectItem value="advance">مقدماً</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
      </div>

      <div className="mt-6 border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            استقطاع ضريبة الدخل (WHT) — وفق نظام ضريبة الدخل السعودي (المادة 68)
          </h3>
          {isNonResident && (
            <Badge className="bg-amber-100 text-status-warning-foreground">
              سيتم استقطاع الضريبة عند الدفع
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormFieldWrapper label="حالة الإقامة الضريبية" required>
            <Select
              value={form.residencyStatus ?? "resident"}
              onValueChange={(v) => setForm((f) => ({ ...f, residencyStatus: v as VendorRow["residencyStatus"] }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESIDENCY_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormFieldWrapper>

          {isNonResident && (
            <>
              <TextField
                label="بلد الإقامة الضريبية (ISO-2)"
                required
                dir="ltr"
                value={form.taxResidenceCountry}
                onChange={(v) => setForm((f) => ({ ...f, taxResidenceCountry: v.toUpperCase().slice(0, 2) }))}
                placeholder="AE"
                error={fieldErrors.taxResidenceCountry}
              />

              <FormFieldWrapper label="فئة الاستقطاع الافتراضية">
                <Select
                  value={form.whtCategoryDefault || "_none"}
                  onValueChange={(v) => {
                    const code = v === "_none" ? "" : v;
                    const cat = whtCategories.find((c) => c.code === code);
                    setForm((f) => ({
                      ...f,
                      whtCategoryDefault: code,
                      defaultWhtRate: cat ? String(Number(cat.rate)) : f.defaultWhtRate,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر فئة..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— بدون فئة محددة —</SelectItem>
                    {whtCategories.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} ({Number(c.rate).toFixed(0)}%) — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormFieldWrapper>

              <FormFieldWrapper
                label="نسبة استقطاع افتراضية % (تتجاوز الفئة)"
                error={fieldErrors.defaultWhtRate}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={100} step={0.01}
                    value={form.defaultWhtRate}
                    onChange={(e) => setForm((f) => ({ ...f, defaultWhtRate: e.target.value }))}
                    placeholder="15"
                    dir="ltr"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </FormFieldWrapper>
            </>
          )}
        </div>
        {isNonResident && (
          <p className="text-xs text-muted-foreground mt-2">
            ⓘ عند دفع هذا المورد، سيقوم النظام تلقائياً بـ:
            خصم النسبة الافتراضية من المبلغ، إرسال الصافي للمورد، وقيد المستقطع
            على حساب "زاتكا — ضريبة استقطاع" (افتراضي 2330) ليُسدّد في الإقرار الشهري.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation(`/finance/vendors/${id}`)}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={patchMut.isPending} rateLimitAware>
          {patchMut.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
