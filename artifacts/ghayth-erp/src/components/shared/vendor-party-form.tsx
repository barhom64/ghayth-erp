/**
 * VendorPartyForm — shared form body for creating a supplier-class party.
 *
 * PR-3 (#2163) — Canonical Ownership: before PR-3, `/finance/vendors/create`
 * and `/warehouse/suppliers/create` were bound to the SAME page component
 * with finance-only fields and a hard-coded POST to `/finance/vendors`.
 * The product-owner mandate (#2163 §3) is clear: vendor (finance: AP /
 * ذمم / فواتير / مدفوعات) and supplier (warehouse: تشغيلي / مشتريات /
 * توريد / مخزون) are NOT the same business path — they share the party
 * master (the `suppliers` table) but answer to different operators,
 * different audit lanes, and different field sets. The form was a UI
 * reuse, not a domain merge.
 *
 * This module is the shared UI body. The two callers — FinanceVendorCreate
 * and WarehouseSupplierCreate — wrap it with their own `intent`:
 *
 *   • title           — Arabic page heading per domain
 *   • backPath        — where Cancel/save-success returns to
 *   • postUrl         — backend endpoint (per-domain authorize() gate)
 *   • draftKey        — separate localStorage drafts (so a warehouse
 *                       half-typed supplier never accidentally lands
 *                       in the finance vendor draft slot)
 *   • showWht         — true for finance (Income Tax Law Art. 68 WHT),
 *                       false for warehouse (irrelevant to procurement)
 *   • saveSuccessMsg  — Arabic toast title on success (per domain)
 *
 * The form does NOT decide policy. It does not invent fields. It does
 * not change validation. It is the «نموذج طرف مشترك» that both wrappers
 * project through their own intent.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { todayLocal } from "@/lib/formatters";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

/**
 * WHT residency options — drives whether the payment-run / voucher
 * handlers withhold tax at payment time (Income Tax Law Art. 68).
 * Backend stored in suppliers.residencyStatus (#999 migration 208).
 * Only the FINANCE intent surfaces these (warehouse procurement has
 * no withholding decision to make at supplier-creation time).
 */
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

export interface VendorPartyFormIntent {
  title: string;
  backPath: string;
  postUrl: string;
  draftKey: string;
  showWht: boolean;
  saveSuccessMsg: string;
  saveErrorMsg: string;
  /**
   * Cache-invalidation keys the create mutation should bump on
   * success. Each domain has its own list cache, so the finance
   * wrapper bumps `vendors` and the warehouse wrapper bumps `suppliers`.
   */
  invalidateKeys: string[][];
}

const INITIAL = {
  name: "", contactPerson: "", phone: "", email: "", taxNumber: "",
  address: "", paymentTerms: "", category: "", date: todayLocal(),
  residencyStatus: "resident",
  taxResidenceCountry: "",
  defaultWhtRate: "" as string,
  whtCategoryDefault: "" as string,
};

export default function VendorPartyForm({ intent }: { intent: VendorPartyFormIntent }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation(intent.postUrl, "POST", intent.invalidateKeys);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(intent.draftKey, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  // WHT categories only loaded for the finance intent — saves a round
  // trip on the warehouse path.
  const { data: whtData } = useApiQuery<{ data: WhtCategory[] }>(
    ["wht-categories"],
    "/finance/wht-categories",
    { enabled: intent.showWht },
  );
  const whtCategories = useMemo(
    () => (whtData?.data ?? []).filter((c) => c.isActive),
    [whtData],
  );

  const isNonResident = intent.showWht && form.residencyStatus !== "resident";

  const handleSubmit = async () => {
    const rateNum = form.defaultWhtRate ? Number(form.defaultWhtRate) : null;
    const firstError = validate({
      name: form.name ? null : "الاسم مطلوب",
      email: form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
        ? "صيغة البريد الإلكتروني غير صحيحة" : null,
      phone: form.phone && form.phone.replace(/\D/g, "").length < 9
        ? "رقم الهاتف يجب أن يكون 9 أرقام على الأقل" : null,
      taxNumber: form.taxNumber && !/^\d{15}$/.test(form.taxNumber.replace(/\s/g, ""))
        ? "الرقم الضريبي يجب أن يكون 15 رقماً" : null,
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
      // Warehouse path strips WHT fields out of the payload entirely —
      // the backend zod schema there doesn't accept them, and stripping
      // them here keeps the wire shape per-domain clean.
      const corePayload = {
        name: form.name,
        contactPerson: form.contactPerson || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        taxNumber: form.taxNumber || undefined,
        address: form.address || undefined,
        paymentTerms: form.paymentTerms || undefined,
      };
      const payload = intent.showWht
        ? {
            ...corePayload,
            category: form.category || undefined,
            date: form.date || undefined,
            residencyStatus: form.residencyStatus,
            taxResidenceCountry: form.taxResidenceCountry
              ? form.taxResidenceCountry.toUpperCase().slice(0, 2)
              : undefined,
            defaultWhtRate: rateNum != null ? rateNum : undefined,
            whtCategoryDefault: form.whtCategoryDefault || undefined,
          }
        : corePayload;
      await createMut.mutateAsync(payload);
      clearDraft();
      toast({ title: intent.saveSuccessMsg });
      setLocation(intent.backPath);
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: intent.saveErrorMsg, description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title={intent.title} backPath={intent.backPath}>
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <FormFieldWrapper label="التاريخ">
          <DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
        </FormFieldWrapper>
      </div>
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
      {intent.showWht && (
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
                value={form.residencyStatus}
                onValueChange={(v) => setForm((f) => ({ ...f, residencyStatus: v }))}
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
                      {whtCategories.filter((c) => c.code).map((c) => (
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
      )}

      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation(intent.backPath)}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
