import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, AutoField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/autocomplete";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useAppContext } from "@/contexts/app-context";
import { ClientContextCard } from "@/components/shared/client-context-card";

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
  const { data: clientsData, isLoading: clientsLoading } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
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
    date: new Date().toISOString().split("T")[0],
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

  const addLine = () => setLines([...lines, { description: "", quantity: "1", unitPrice: "" }]);
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: string, value: string) => {
    const updated = [...lines];
    (updated[idx] as any)[field] = value;
    setLines(updated);
  };

  const subtotal = lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const vatAmount = subtotal * (Number(form.vatRate) / 100);
  const total = subtotal + vatAmount;

  const handleSubmit = async () => {
    if (!form.clientId) {
      toast({ variant: "destructive", title: "يرجى اختيار العميل" });
      return;
    }
    if (!form.branchId) {
      toast({ variant: "destructive", title: "الفرع مطلوب" });
      return;
    }
    if (!form.paymentTermsDays && !form.dueDate) {
      toast({ variant: "destructive", title: "حدد شروط الدفع أو تاريخ الاستحقاق" });
      return;
    }
    if (lines.length === 0 || !lines[0].unitPrice) {
      toast({ variant: "destructive", title: "يرجى إضافة بند واحد على الأقل" });
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
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الفاتورة", description: err?.message });
    }
  };

  return (
    <CreatePageLayout title="فاتورة جديدة" backPath="/finance/invoices" isDirty={isDirty}>
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <button onClick={clearDraft} className="underline text-amber-600 hover:text-amber-800">تجاهل</button>
        </div>
      )}
      <div data-form>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="رقم الفاتورة" value={autoNumberRef.current} />
        <div>
          <Label>التاريخ <span className="text-red-500">*</span></Label>
          <Input className="mt-1" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <Label>العميل <span className="text-red-500">*</span></Label>
          <Autocomplete
            options={clientOptions}
            value={form.clientId}
            onChange={(val) => setForm(prev => ({ ...prev, clientId: String(val) }))}
            placeholder="ابحث عن عميل..."
            loading={clientsLoading}
            className="mt-1"
          />
          {form.clientId && (
            <div className="mt-3">
              <ClientContextCard clientId={form.clientId} section="invoice" />
            </div>
          )}
        </div>
        <div>
          <Label>الفرع <span className="text-red-500">*</span></Label>
          <Select value={form.branchId || "_none"} onValueChange={(v) => setForm(prev => ({ ...prev, branchId: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر الفرع</SelectItem>
              {branches.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>نسبة الضريبة %</Label>
          <Input className="mt-1" type="number" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} />
        </div>
        <div>
          <Label>شروط الدفع <span className="text-red-500">*</span></Label>
          <Select value={form.paymentTermsDays || "_none"} onValueChange={(v) => setForm(prev => ({ ...prev, paymentTermsDays: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_TERMS_OPTIONS.map(t => <SelectItem key={t.value || "_none"} value={t.value || "_none"}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>تاريخ الاستحقاق {!form.paymentTermsDays && <span className="text-red-500">*</span>}</Label>
          <div className="mt-1"><DatePicker value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} /></div>
        </div>
        <div className="md:col-span-3"><Label>الوصف</Label><Input className="mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="md:col-span-3"><Label>ملاحظات إضافية</Label><Input className="mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="ملاحظات أو تعليمات للعميل" /></div>
      </div>

      <div className="mb-4">
        <Label className="text-base font-semibold">البنود</Label>
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

      <div className="bg-muted/50 p-4 rounded-md text-sm space-y-1">
        <div className="flex justify-between"><span>المجموع الفرعي:</span><span>{subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>الضريبة ({form.vatRate}%):</span><span>{vatAmount.toFixed(2)}</span></div>
        <div className="flex justify-between font-bold"><span>الإجمالي:</span><span>{total.toFixed(2)}</span></div>
      </div>

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
              <select className="w-full border rounded-md p-2 mt-1 text-sm" value={form.invoiceTypeCode}
                onChange={(e) => setForm({ ...form, invoiceTypeCode: e.target.value })}>
                {INVOICE_TYPE_CODES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label>فئة الضريبة</Label>
              <select className="w-full border rounded-md p-2 mt-1 text-sm" value={form.taxCategoryCode}
                onChange={(e) => setForm({ ...form, taxCategoryCode: e.target.value })}>
                {TAX_CATEGORY_CODES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {(form.taxCategoryCode === "E" || form.taxCategoryCode === "Z") && (
              <div>
                <Label>سبب الإعفاء / النسبة الصفرية</Label>
                <input type="text" className="w-full border rounded-md p-2 mt-1 text-sm"
                  value={form.exemptionReason}
                  onChange={(e) => setForm({ ...form, exemptionReason: e.target.value })}
                  placeholder="أدخل سبب الإعفاء..." />
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
