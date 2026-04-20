import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, AutoField, CreationDateField } from "@/components/create-page-layout";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/autocomplete";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useAppContext } from "@/contexts/app-context";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { TextField, NumberField, FormFieldWrapper, fieldErrorClass } from "@/components/shared/form-field-wrapper";
import { ImpactPreviewButton } from "@/components/shared/impact-preview";

const INVOICE_TYPE_CODES = [
  { value: "388", label: "فاتورة ضريبية (388)" },
  { value: "381", label: "إشعار دائن (381)" },
  { value: "383", label: "إشعار مدين (383)" },
];

const TAX_CATEGORY_CODES = [
  { value: "S", label: "خاضع للضريبة (S)" },
  { value: "Z", label: "نسبة صفرية (Z)" },
  { value: "E", label: "معفى (E)" },
  { value: "O", label: "خارج نطاق الضريبة (O)" },
];

const PAYMENT_TERMS_OPTIONS = [
  { value: "", label: "اختر شروط الدفع" },
  { value: "0", label: "فوري (عند الاستلام)" },
  { value: "7", label: "7 أيام" },
  { value: "15", label: "15 يوم" },
  { value: "30", label: "30 يوم" },
  { value: "45", label: "45 يوم" },
  { value: "60", label: "60 يوم" },
  { value: "90", label: "90 يوم" },
];

export default function InvoicesCreate() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const copyFromId = new URLSearchParams(searchStr).get("copyFrom");
  const { toast } = useToast();
  const { selectedBranchId, selectedCompanyIds } = useAppContext();
  const createMut = useApiMutation("/finance/invoices", "POST", [["invoices"]]);
  const { data: clientsData, isLoading: clientsLoading, isError } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const { data: branchesData } = useApiQuery<{ data: any[] }>(["branches-list"], "/settings/branches");
  const clients = clientsData?.data || [];
  const branches = branchesData?.data || [];
  const { data: copySource } = useApiQuery<any>(["invoice-copy", copyFromId || ""], `/finance/invoices/${copyFromId}`, !!copyFromId);

  const clientOptions: AutocompleteOption[] = clients.map((c: any) => ({
    value: String(c.id),
    label: c.name,
    subtitle: c.email || c.phone || undefined,
  }));

  const copyDefaults = (() => {
    const params = new URLSearchParams(window.location.search);
    const copy = params.get("copy");
    if (copy) { try { return JSON.parse(copy); } catch { /* ignore */ } }
    return null;
  })();
  const { form, setForm, clearDraft, isDirty, hasDraft } = useAutoDraft("invoice-create", {
    clientId: copyDefaults?.clientId ? String(copyDefaults.clientId) : "",
    description: copyDefaults?.description || "",
    date: todayLocal(),
    dueDate: "",
    vatRate: copyDefaults?.vatRate ? String(copyDefaults.vatRate) : "15",
    branchId: selectedBranchId ? String(selectedBranchId) : "",
    companyId: selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : "",
    paymentTermsDays: "",
    notes: copyDefaults?.notes || "",
    isTaxLinked: false,
    invoiceTypeCode: "388",
    taxCategoryCode: "S",
    exemptionReason: "",
  });
  const [lines, setLines] = useState([{ description: "", quantity: "1", unitPrice: "" }]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [copied, setCopied] = useState(false);
  const { fieldErrors, validate, setApiError } = useFieldErrors();


  useEffect(() => {
    if (copySource && !copied) {
      setCopied(true);
      setForm((prev) => ({
        ...prev,
        clientId: String(copySource.clientId || ""),
        description: copySource.description || "",
        dueDate: "",
        vatRate: String(copySource.vatRate ?? "15"),
        branchId: copySource.branchId ? String(copySource.branchId) : prev.branchId,
        companyId: copySource.companyId ? String(copySource.companyId) : prev.companyId,
        paymentTermsDays: "",
        notes: copySource.notes || "",
      }));
      if (copySource.lines?.length) {
        setLines(copySource.lines.map((l: any) => ({ description: l.description || "", quantity: String(l.quantity || 1), unitPrice: String(l.unitPrice || "") })));
      }
    }
  }, [copySource, copied]);
  const autoNumberRef = useRef(`INV-${Date.now().toString(36).toUpperCase()}`);

  if (clientsLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const addLine = () => setLines([...lines, { description: "", quantity: "1", unitPrice: "" }]);
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: string, value: string) => {
    const updated = [...lines];
    (updated[idx] as any)[field] = value;
    setLines(updated);
  };

  const subtotal = roundMoney(lines.reduce((sum, l) => sum + roundMoney(Number(l.quantity || 0) * Number(l.unitPrice || 0)), 0));
  const vatAmount = roundMoney(subtotal * (Number(form.vatRate) / 100));
  const total = roundMoney(subtotal + vatAmount);

  const handleSubmit = async () => {
    const firstError = validate({
      clientId: form.clientId ? null : "يرجى اختيار العميل",
      dueDate: !form.dueDate && !form.paymentTermsDays ? "حدد شروط الدفع أو تاريخ الاستحقاق" : null,
      lines: lines.length === 0 || !lines[0].unitPrice ? "يرجى إضافة بند واحد على الأقل بسعر" : null,
      totalAmount: total <= 0 ? "إجمالي الفاتورة يجب أن يكون أكبر من صفر" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    if (!form.branchId) {
      toast({ variant: "destructive", title: "الفرع مطلوب" });
      return;
    }
    try {
      await createMut.mutateAsync({
        clientId: Number(form.clientId),
        description: form.description || undefined,
        date: form.date || undefined,
        dueDate: form.dueDate || undefined,
        vatRate: Number(form.vatRate),
        subtotal,
        total,
        branchId: form.branchId ? Number(form.branchId) : undefined,
        companyId: form.companyId ? Number(form.companyId) : undefined,
        paymentTermsDays: form.paymentTermsDays ? Number(form.paymentTermsDays) : undefined,
        notes: form.notes || undefined,
        isTaxLinked: form.isTaxLinked,
        invoiceTypeCode: form.isTaxLinked ? form.invoiceTypeCode : undefined,
        taxCategoryCode: form.isTaxLinked ? form.taxCategoryCode : undefined,
        exemptionReason: form.isTaxLinked && form.exemptionReason ? form.exemptionReason : undefined,
        lines: lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          total: Number(l.quantity) * Number(l.unitPrice),
        })),
      });
      toast({ title: "تم إنشاء الفاتورة بنجاح" });
      clearDraft();
      setLocation("/finance/invoices");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الفاتورة", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="فاتورة جديدة" backPath="/finance/invoices" isDirty={isDirty}>
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div data-form>
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="رقم الفاتورة" value={autoNumberRef.current} />
        <FormFieldWrapper label="التاريخ" required>
          <DatePicker value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        </FormFieldWrapper>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <FormFieldWrapper label="العميل" required error={fieldErrors.clientId}>
          <Autocomplete
            options={clientOptions}
            value={form.clientId}
            onChange={(val) => setForm(prev => ({ ...prev, clientId: String(val) }))}
            placeholder="ابحث عن عميل..."
            loading={clientsLoading}
            className={fieldErrorClass(fieldErrors.clientId)}
          />
          {form.clientId && (
            <div className="mt-3">
              <ClientContextCard clientId={form.clientId} section="invoice" />
            </div>
          )}
        </FormFieldWrapper>
        <FormFieldWrapper label="الفرع" required>
          <Select value={form.branchId || "_none"} onValueChange={(v) => setForm(prev => ({ ...prev, branchId: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر الفرع</SelectItem>
              {branches.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <NumberField label="نسبة الضريبة %" value={form.vatRate} onChange={(v) => setForm({ ...form, vatRate: v })} min={0} max={100} step={0.01} />
        <FormFieldWrapper label="شروط الدفع" required>
          <Select value={form.paymentTermsDays || "_none"} onValueChange={(v) => setForm(prev => ({ ...prev, paymentTermsDays: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_TERMS_OPTIONS.map(t => <SelectItem key={t.value || "_none"} value={t.value || "_none"}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label={`تاريخ الاستحقاق ${!form.paymentTermsDays ? "*" : ""}`} error={fieldErrors.dueDate}>
          <DatePicker value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} />
        </FormFieldWrapper>
        <TextField label="الوصف" value={form.description} onChange={(v) => setForm({ ...form, description: v })} className="md:col-span-3" />
        <TextField label="ملاحظات إضافية" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="ملاحظات أو تعليمات للعميل" className="md:col-span-3" />
      </div>

      <div className="mb-4">
        <Label className="text-base font-semibold">البنود</Label>
        {fieldErrors.lines && <p className="text-xs text-red-600 mt-1">{fieldErrors.lines}</p>}
        {lines.map((line, idx) => (
          <div key={idx} className="grid grid-cols-4 gap-2 mt-2 items-end">
            <div><Label className="text-xs">الوصف</Label><Input value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} /></div>
            <div><Label className="text-xs">الكمية</Label><Input type="number" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", e.target.value)} /></div>
            <div><Label className="text-xs">سعر الوحدة</Label><Input type="number" value={line.unitPrice} onChange={(e) => updateLine(idx, "unitPrice", e.target.value)} /></div>
            <Button type="button" variant="destructive" size="sm" onClick={() => removeLine(idx)} disabled={lines.length <= 1}>حذف</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addLine}>+ إضافة بند</Button>
      </div>

      <div className={`bg-muted/50 p-4 rounded-md text-sm space-y-1 ${fieldErrorClass(fieldErrors.totalAmount)}`}>
        <div className="flex justify-between"><span>المجموع الفرعي:</span><span>{formatCurrency(subtotal)}</span></div>
        <div className="flex justify-between"><span>الضريبة ({form.vatRate}%):</span><span>{formatCurrency(vatAmount)}</span></div>
        <div className="flex justify-between font-bold"><span>الإجمالي:</span><span>{formatCurrency(total)}</span></div>
      </div>
      {fieldErrors.totalAmount && <p className="text-xs text-red-600 mt-1">{fieldErrors.totalAmount}</p>}

      {form.clientId && subtotal > 0 && (
        <ImpactPreviewButton
          endpoint="/finance/invoices/impact-preview"
          payload={{
            clientId: Number(form.clientId),
            taxRate: Number(form.vatRate),
            lines: lines.map((l) => ({
              quantity: Number(l.quantity || 0),
              unitPrice: Number(l.unitPrice || 0),
            })),
          }}
          label="معاينة أثر الفاتورة"
        />
      )}

      <FileDropZone files={attachments} onFilesChange={setAttachments} />

      <div className="border rounded-lg p-4 mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
            <span className="text-green-600">🏛</span>
            ربط مع هيئة الزكاة والضريبة والجمارك
          </h3>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setForm({ ...form, isTaxLinked: !form.isTaxLinked })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.isTaxLinked ? "bg-green-600" : "bg-gray-300"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.isTaxLinked ? "translate-x-6" : "translate-x-1"}`} />
            </div>
            <span className="text-sm font-medium">{form.isTaxLinked ? "مفعّل" : "غير مفعّل"}</span>
          </label>
        </div>
        {form.isTaxLinked && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
            <div>
              <Label>نوع الفاتورة الضريبية</Label>
              <Select value={form.invoiceTypeCode} onValueChange={(v) => setForm((f) => ({ ...f, invoiceTypeCode: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVOICE_TYPE_CODES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>فئة الضريبة</Label>
              <Select value={form.taxCategoryCode} onValueChange={(v) => setForm((f) => ({ ...f, taxCategoryCode: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAX_CATEGORY_CODES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(form.taxCategoryCode === "E" || form.taxCategoryCode === "Z") && (
              <div>
                <Label>سبب الإعفاء / النسبة الصفرية</Label>
                <Input className="mt-1" value={form.exemptionReason} onChange={(e) => setForm((f) => ({ ...f, exemptionReason: e.target.value }))} placeholder="أدخل سبب الإعفاء..." />
              </div>
            )}
            <div className="md:col-span-3 flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
              <span className="text-green-600 text-xs mt-0.5">✓</span>
              <p className="text-xs text-green-700">سيتم ربط هذه الفاتورة مع منظومة الفوترة الإلكترونية لهيئة الزكاة والضريبة وتوليد رمز استجابة سريعة متوافق عند الإرسال للهيئة.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/invoices")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
      </div>
    </CreatePageLayout>
  );
}
