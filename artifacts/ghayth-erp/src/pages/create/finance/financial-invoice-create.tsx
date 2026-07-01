import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import { LineItemsTable } from "@/components/shared/line-items-table";
import { ClientSelect, BranchSelect, ProjectSelect, VehicleSelect, UnitSelect } from "@/components/shared/entity-selects";
import { NumberField, FormFieldWrapper, TextField } from "@/components/shared/form-field-wrapper";
import { ArrowDownLeft } from "lucide-react";
import { FinanceStartFromDocument } from "@/components/shared/finance-start-from-document";

/**
 * فاتورة مبيعات — الروح التشغيلية (م٤، docs/25 §٧.٤ + §١١.٢). نفس جدول البنود
 * الموحّد، لكن مع **ربط كل بند بكيانه** (مشروع/مركبة/وحدة) — وهو ما لا توفّره صفحة
 * الفاتورة الكلاسيكية (ربط على مستوى المستند فقط). الحفظ يمرّ على **نفس منفذ
 * الفاتورة القائم** POST /finance/invoices (لا refactor، لا ازدواج محرّك — روحان
 * لنفس السجل §١١.٢). البنود تحمل أبعادها فتُحسب الربحية لكل كيان عند الاعتماد.
 */
type LinkType = "" | "project" | "vehicle" | "unit";
type InvLine = {
  itemName: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  linkType: LinkType;
  linkId: string;
};

const emptyLine = (): InvLine => ({ itemName: "", description: "", quantity: 1, unit: "", unitPrice: 0, linkType: "", linkId: "" });
const lineNet = (l: InvLine) => roundMoney((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));

// نوع الربط → عمود البُعد على سطر الفاتورة (invoice_lines، يدعمها المنفذ القائم).
const LINK_DIM: Record<Exclude<LinkType, "">, string> = { project: "projectId", vehicle: "vehicleId", unit: "unitId" };

export default function FinancialInvoiceCreate({ embedded = false }: { embedded?: boolean } = {}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("finance_sales_invoice_create", {
    clientId: "",
    date: todayLocal(),
    dueDate: "",
    branchId: "",
    vatRate: 15,
    description: "",
    lines: [emptyLine()] as InvLine[],
  });

  const saveMut = useApiMutation<{ id: number }, any>("/finance/invoices", "POST", [["invoices"]], {
    successMessage: "تم إنشاء فاتورة المبيعات (مسودة)",
    onSuccess: () => { clearDraft(); navigate("/finance/invoices"); },
  });

  // قبض من فاتورة ممسوحة (OCR) — تعبئة مسبقة من رابط «قراءة المستندات». نظير صفحة
  // فاتورة المورد (صرف): لا إنشاء آلي؛ فقط نملأ النموذج (المبلغ/التاريخ/الرقم) ليراجعه
  // البشر ويختار العميل ويحفظ عبر منفذ الفاتورة المُدقَّق. يعمل مرة واحدة عند وجود وسائط.
  const [ocrPrefilled, setOcrPrefilled] = useState(false);
  useEffect(() => {
    if (ocrPrefilled) return;
    const p = new URLSearchParams(window.location.search);
    const invNo = p.get("ocrInvoiceNo");
    const amount = Number(p.get("ocrAmount") || "") || 0;
    const vat = Number(p.get("ocrVat") || "") || 0;
    const date = p.get("ocrDate");
    if (!invNo && !amount) return; // لا بيانات OCR في الرابط
    setForm((f) => {
      const net = vat > 0 && amount > vat ? roundMoney(amount - vat) : amount;
      return {
        ...f,
        date: date || f.date,
        description: invNo ? `فاتورة مبيعات ممسوحة رقم ${invNo}` : f.description,
        vatRate: vat > 0 && net > 0 ? (Math.round((vat / net) * 100) || 15) : f.vatRate,
        lines: amount > 0
          ? [{ ...emptyLine(), itemName: "بند من فاتورة ممسوحة (راجع المبلغ)", quantity: 1, unitPrice: net }]
          : f.lines,
      };
    });
    setOcrPrefilled(true);
  }, [ocrPrefilled, setForm]);

  const totalNet = roundMoney(form.lines.reduce((s, l) => s + lineNet(l), 0));
  const totalVat = roundMoney(totalNet * ((Number(form.vatRate) || 0) / 100));
  const grandTotal = roundMoney(totalNet + totalVat);

  function setLine(i: number, field: keyof InvLine, val: any) {
    setForm((f) => {
      const lines = [...f.lines];
      const numeric = field === "quantity" || field === "unitPrice";
      const next = { ...lines[i], [field]: numeric ? Number(val) || 0 : val };
      if (field === "linkType") next.linkId = ""; // تغيير النوع يصفّر الكيان
      lines[i] = next;
      return { ...f, lines };
    });
  }
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));
  const removeLine = (i: number) => setForm((f) => (f.lines.length <= 1 ? f : { ...f, lines: f.lines.filter((_, idx) => idx !== i) }));

  function validate(): string | null {
    if (!form.clientId) return "اختر العميل";
    if (!form.dueDate) return "حدّد تاريخ الاستحقاق";
    if (!form.lines.some((l) => Number(l.quantity) > 0 && Number(l.unitPrice) > 0)) return "أدخل بندًا واحدًا على الأقل بكمية وسعر";
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { toast({ variant: "destructive", title: err }); return; }
    saveMut.mutate({
      clientId: Number(form.clientId),
      date: form.date || undefined,
      dueDate: form.dueDate || undefined,
      branchId: form.branchId ? Number(form.branchId) : undefined,
      vatRate: Number(form.vatRate) || 0,
      description: form.description || undefined,
      lines: form.lines
        .filter((l) => Number(l.quantity) > 0 && Number(l.unitPrice) > 0)
        .map((l) => {
          const dim = l.linkType && l.linkId ? { [LINK_DIM[l.linkType]]: Number(l.linkId) } : {};
          return {
            description: l.itemName ? (l.description ? `${l.itemName} — ${l.description}` : l.itemName) : l.description || undefined,
            quantity: Number(l.quantity) || 0,
            unitPrice: Number(l.unitPrice) || 0,
            ...dim,
          };
        }),
    });
  }

  function renderLink(l: InvLine, i: number) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">ربط البند بكيان (اختياري):</span>
        <Select value={l.linkType || "none"} onValueChange={(v) => setLine(i, "linkType", v === "none" ? "" : v)}>
          <SelectTrigger className="w-36 h-8"><SelectValue placeholder="بلا ربط" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— بلا ربط —</SelectItem>
            <SelectItem value="project">مشروع</SelectItem>
            <SelectItem value="vehicle">مركبة</SelectItem>
            <SelectItem value="unit">وحدة عقارية</SelectItem>
          </SelectContent>
        </Select>
        {l.linkType === "project" && <ProjectSelect value={l.linkId} onChange={(v) => setLine(i, "linkId", String(v ?? ""))} label="المشروع" hideLabel allowCreate={false} />}
        {l.linkType === "vehicle" && <VehicleSelect value={l.linkId} onChange={(v) => setLine(i, "linkId", String(v ?? ""))} label="المركبة" hideLabel allowCreate={false} />}
        {l.linkType === "unit" && <UnitSelect value={l.linkId} onChange={(v) => setLine(i, "linkId", String(v ?? ""))} label="الوحدة" hideLabel allowCreate={false} />}
      </div>
    );
  }

  const inner = (
    <>
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div dir="rtl">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* اختصار «ابدأ من مستند» — مكوّن مشترك (DRY، مطابق لصفحة الواقعة). */}
          <FinanceStartFromDocument />

          {/* لافتة الاتجاه — مبيعات = قبض (إيراد على العميل)، بنفس نمط الواقعة. */}
          <div className="flex items-start gap-2 rounded-lg border border-status-success-foreground/30 bg-status-success-surface px-3 py-2 text-sm text-status-success-foreground">
            <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0" />
            <span>قبض — فاتورة مبيعات (إيراد على العميل). تُسجّل ما تطالب به العميل؛ والنظام يجعل ذمة العميل مدينة عند الاعتماد.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <ClientSelect value={form.clientId} onChange={(v) => setForm((f) => ({ ...f, clientId: String(v ?? "") }))} label="العميل" required allowCreate={false} />
            <FormFieldWrapper label="التاريخ"><DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} /></FormFieldWrapper>
            <FormFieldWrapper label="تاريخ الاستحقاق" required><DatePicker value={form.dueDate} onChange={(v) => setForm((f) => ({ ...f, dueDate: v }))} /></FormFieldWrapper>
            <BranchSelect value={form.branchId} onChange={(v) => setForm((f) => ({ ...f, branchId: String(v ?? "") }))} label="الفرع" allowCreate={false} autoSelectOwnBranch />
          </div>

          <LineItemsTable
            items={form.lines}
            minItems={1}
            onAdd={addLine}
            onRemove={removeLine}
            addLabel="إضافة بند"
            columns={[
              { header: "الصنف / الخدمة", render: (l, i) => <Input value={l.itemName} onChange={(e) => setLine(i, "itemName", e.target.value)} placeholder="مثال: استشارة" /> },
              { header: "الوصف", render: (l, i) => <Input value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} placeholder="وصف اختياري" /> },
              { header: "الكمية", width: "90px", render: (l, i) => <NumberField label="الكمية" hideLabel className="w-20" min={0} value={l.quantity || ""} onChange={(v) => setLine(i, "quantity", v)} placeholder="0" /> },
              { header: "الوحدة", width: "90px", render: (l, i) => <Input className="w-20" value={l.unit} onChange={(e) => setLine(i, "unit", e.target.value)} placeholder="قطعة/ساعة" /> },
              { header: "سعر الوحدة", width: "110px", render: (l, i) => <NumberField label="سعر الوحدة" hideLabel className="w-24" min={0} value={l.unitPrice || ""} onChange={(v) => setLine(i, "unitPrice", v)} placeholder="0.00" /> },
              { header: "الإجمالي", width: "110px", render: (l) => <span className="font-mono text-sm">{formatCurrency(lineNet(l))}</span> },
            ]}
            renderExpansion={(l, i) => renderLink(l, i)}
            renderTotals={() => (
              <tr className="bg-surface-subtle font-semibold border-t">
                <td colSpan={5} className="px-3 py-2 text-muted-foreground">الإجمالي (صافٍ {formatCurrency(totalNet)} + ضريبة {formatCurrency(totalVat)})</td>
                <td className="px-3 py-2 font-mono">{formatCurrency(grandTotal)}</td>
                <td />
              </tr>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NumberField label="نسبة الضريبة % (على الفاتورة)" min={0} max={100} value={form.vatRate} onChange={(v) => setForm((f) => ({ ...f, vatRate: Number(v) || 0 }))} />
            <TextField label="البيان (اختياري)" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="ملاحظات الفاتورة" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate("/finance/invoices")}>إلغاء</Button>
            <Button type="submit" disabled={saveMut.isPending} rateLimitAware>
              {saveMut.isPending ? "جاري الحفظ..." : "حفظ الفاتورة (مسودة)"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
  // مضمّن داخل الصفحة الموحّدة (FinanceCreatePage يوفّر القشرة + التبويبات)، أو مستقلًّا.
  return embedded ? inner : (
    <CreatePageLayout title="فاتورة مبيعات (تسجيل واقعة)" subtitle="نفس جدول البنود الموحّد، مع ربط كل بند بكيانه — تمرّ على محرّك الفاتورة القائم" backPath="/finance/invoices">
      {inner}
    </CreatePageLayout>
  );
}
