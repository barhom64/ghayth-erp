import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import { isMoneyAccount } from "@/lib/finance-account-usage";
import { LineItemsTable } from "@/components/shared/line-items-table";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { SupplierSelect, BranchSelect, AccountSelect, ProjectSelect, VehicleSelect, UnitSelect } from "@/components/shared/entity-selects";
import { NumberField, FormFieldWrapper, TextField } from "@/components/shared/form-field-wrapper";
import { ACCOUNT_PURPOSE_OPTIONS } from "@/lib/finance/account-purposes";
import { ArrowUpRight } from "lucide-react";
import { FinanceStartFromDocument } from "@/components/shared/finance-start-from-document";

/**
 * فاتورة مشتريات (مورد) — الروح التشغيلية (م٤، docs/25 §٧.٤ + §١١.٢). نفس جدول
 * البنود الموحّد مع **ربط كل بند بكيانه** + **غرض حساب لكل بند** (قائمة، لا إدخال
 * حر — الدستور §٥). المرفق إلزامي (صورة فاتورة المورد). الحفظ يمرّ على **نفس منفذ
 * فاتورة المورد القائم** POST /finance/vendor-invoices (لا refactor، لا ازدواج
 * محرّك — روحان لنفس السجل §١١.٢). آجل (ذمة المورد) أو مدفوع (مصدر صرف).
 */
type LinkType = "" | "project" | "vehicle" | "unit";
type VLine = {
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  accountPurpose: string;
  linkType: LinkType;
  linkId: string;
};

const emptyLine = (): VLine => ({ itemName: "", quantity: 1, unit: "", unitPrice: 0, accountPurpose: "", linkType: "", linkId: "" });
const lineAmount = (l: VLine) => roundMoney((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));
const LINK_DIM: Record<Exclude<LinkType, "">, string> = { project: "projectId", vehicle: "vehicleId", unit: "unitId" };

export default function FinancialVendorInvoiceCreate({ embedded = false }: { embedded?: boolean } = {}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [supplierId, setSupplierId] = useState("");
  const [ref, setRef] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayLocal());
  const [dueDate, setDueDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const [vatRate, setVatRate] = useState(15);
  const [description, setDescription] = useState("");
  const [paid, setPaid] = useState(false);
  const [sourceAccountCode, setSourceAccountCode] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [lines, setLines] = useState<VLine[]>([emptyLine()]);

  // البند ٣ (فاتورة المورد) — تعبئة مسبقة من فاتورة OCR ممسوحة: لا إنشاء آلي للمستند
  // المالي؛ فقط نملأ النموذج (المبلغ/التاريخ/الرقم) ونطابق المورّد بالرقم الضريبي على
  // الفاتورة (تفاصيلها تحدّد المورّد). البشر يراجع ويختار/يؤكّد ويحفظ عبر المسار المُدقَّق.
  const { data: vendorsData } = useApiQuery<{ data: Array<{ id: number; taxNumber?: string | null }> }>(["vendors-list"], "/finance/vendors");
  const [ocrPrefilled, setOcrPrefilled] = useState(false);
  const [ocrSupplierMatched, setOcrSupplierMatched] = useState<boolean | null>(null);
  useEffect(() => {
    if (ocrPrefilled || !vendorsData) return; // انتظر الموردين ثم عبّئ مرة واحدة (للمطابقة)
    const p = new URLSearchParams(window.location.search);
    const invNo = p.get("ocrInvoiceNo");
    const amount = Number(p.get("ocrAmount") || "") || 0;
    const vat = Number(p.get("ocrVat") || "") || 0;
    const date = p.get("ocrDate");
    const tax = (p.get("ocrTaxNumber") || "").replace(/\s/g, "");
    if (!invNo && !amount && !tax) return; // لا بيانات OCR في الرابط
    if (invNo) setRef(invNo);
    if (date) setInvoiceDate(date);
    if (amount > 0) {
      const net = vat > 0 && amount > vat ? roundMoney(amount - vat) : amount;
      setLines([{ ...emptyLine(), itemName: "بند من فاتورة ممسوحة (راجع المبلغ)", quantity: 1, unitPrice: net }]);
      if (vat > 0 && net > 0) setVatRate(Math.round((vat / net) * 100) || 15);
    }
    if (tax) {
      const match = vendorsData.data?.find((v) => (v.taxNumber || "").replace(/\s/g, "") === tax);
      if (match) { setSupplierId(String(match.id)); setOcrSupplierMatched(true); }
      else setOcrSupplierMatched(false);
    }
    setOcrPrefilled(true);
  }, [vendorsData, ocrPrefilled]);

  const attachmentUrl = attachments[0]?.dataUrl ?? "";

  const createMut = useApiMutation<{ id: number }, any>("/finance/vendor-invoices", "POST", [["expenses"], ["vendor-invoices"]], {
    successMessage: "تم تسجيل فاتورة المورد",
    onSuccess: () => navigate("/finance/expenses"),
  });

  const totalNet = roundMoney(lines.reduce((s, l) => s + lineAmount(l), 0));
  const totalVat = roundMoney(totalNet * ((Number(vatRate) || 0) / 100));
  const grandTotal = roundMoney(totalNet + totalVat);

  function setLine(i: number, field: keyof VLine, val: any) {
    setLines((prev) => {
      const next = [...prev];
      const numeric = field === "quantity" || field === "unitPrice";
      const row = { ...next[i], [field]: numeric ? Number(val) || 0 : val };
      if (field === "linkType") row.linkId = "";
      next[i] = row;
      return next;
    });
  }
  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const removeLine = (i: number) => setLines((p) => (p.length <= 1 ? p : p.filter((_, idx) => idx !== i)));

  function validate(): string | null {
    if (!supplierId) return "اختر المورد";
    if (!ref.trim()) return "أدخل رقم فاتورة المورد";
    if (!attachmentUrl) return "المرفق إلزامي — أرفق صورة فاتورة المورد";
    const valid = lines.filter((l) => lineAmount(l) > 0);
    if (valid.length === 0) return "أدخل بندًا واحدًا على الأقل بكمية وسعر";
    if (valid.some((l) => !l.accountPurpose)) return "حدّد غرض الحساب لكل بند";
    if (paid && !sourceAccountCode) return "اختر مصدر الصرف للفاتورة المدفوعة";
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { toast({ variant: "destructive", title: err }); return; }
    const rate = Number(vatRate) || 0;
    createMut.mutate({
      supplierId: Number(supplierId),
      paid,
      sourceAccountCode: paid ? sourceAccountCode : undefined,
      invoiceNo: ref,
      invoiceDate: invoiceDate || undefined,
      dueDate: dueDate || undefined,
      description: description || undefined,
      branchId: branchId ? Number(branchId) : undefined,
      attachmentUrl,
      attachmentType: "invoice",
      lines: lines
        .filter((l) => lineAmount(l) > 0)
        .map((l) => {
          const amount = lineAmount(l);
          const dim = l.linkType && l.linkId ? { [LINK_DIM[l.linkType]]: Number(l.linkId) } : {};
          return {
            itemName: l.itemName || undefined,
            quantity: Number(l.quantity) || 0,
            unitPrice: Number(l.unitPrice) || 0,
            amount,
            vatAmount: roundMoney(amount * (rate / 100)),
            accountPurpose: l.accountPurpose,
            ...dim,
          };
        }),
    });
  }

  function renderLink(l: VLine, i: number) {
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
    <div dir="rtl">
      {ocrPrefilled && (
        <div className="mb-4 rounded-lg border border-status-info-foreground bg-status-info-surface px-4 py-2 text-sm text-status-info-foreground">
          عُبّئ النموذج من فاتورة ممسوحة (OCR){" "}
          {ocrSupplierMatched === true
            ? "— وطُوبق المورّد بالرقم الضريبي."
            : ocrSupplierMatched === false
              ? "— لم يُطابَق المورّد بالرقم الضريبي، اختره يدويًّا."
              : "."}{" "}
          راجع المبلغ والضريبة والمورّد قبل الحفظ.
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* اختصار «ابدأ من مستند» — مكوّن مشترك (DRY، مطابق لصفحة الواقعة). */}
        <FinanceStartFromDocument />

          {/* لافتة الاتجاه — مشتريات = صرف (التزام للمورّد)، بنفس نمط الواقعة. */}
          <div className="flex items-start gap-2 rounded-lg border border-status-warning-foreground/30 bg-status-warning-surface px-3 py-2 text-sm text-status-warning-foreground">
            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0" />
            <span>صرف — فاتورة مشتريات (التزام للمورّد). تُسجّل ما تستحقه على المورّد؛ والنظام يجعل ذمة المورّد دائنة عند الاعتماد.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <SupplierSelect value={supplierId} onChange={(v) => setSupplierId(String(v ?? ""))} label="المورد" required allowCreate={false} />
            <TextField label="رقم فاتورة المورد" required value={ref} onChange={setRef} placeholder="رقم الفاتورة الورقية" />
            <FormFieldWrapper label="تاريخ الفاتورة"><DatePicker value={invoiceDate} onChange={setInvoiceDate} /></FormFieldWrapper>
            <FormFieldWrapper label="تاريخ الاستحقاق"><DatePicker value={dueDate} onChange={setDueDate} /></FormFieldWrapper>
          </div>

          {/* آجل (ذمة المورد) أو مدفوع (مصدر صرف) */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border overflow-hidden">
              {([["credit", "آجل (على ذمة المورد)"], ["paid", "مدفوعة (صرف فوري)"]] as const).map(([k, lbl]) => (
                <button key={k} type="button" onClick={() => setPaid(k === "paid")}
                  className={`px-4 py-2 text-sm ${(k === "paid") === paid ? "bg-primary text-primary-foreground" : "bg-surface-subtle"}`}>
                  {lbl}
                </button>
              ))}
            </div>
            {paid && (
              <div className="min-w-[260px]">
                <AccountSelect value={sourceAccountCode} onChange={setSourceAccountCode} label="مصدر الصرف (الخزنة / البنك)" required placeholder="اختر الخزنة أو البنك..." filter={(a: any) => isMoneyAccount(a)} />
              </div>
            )}
            <BranchSelect value={branchId} onChange={(v) => setBranchId(String(v ?? ""))} label="الفرع" allowCreate={false} autoSelectOwnBranch />
          </div>

          <LineItemsTable
            items={lines}
            minItems={1}
            onAdd={addLine}
            onRemove={removeLine}
            addLabel="إضافة بند"
            columns={[
              { header: "الصنف / الخدمة", render: (l, i) => <Input value={l.itemName} onChange={(e) => setLine(i, "itemName", e.target.value)} placeholder="مثال: قطع غيار" /> },
              { header: "غرض الحساب", render: (l, i) => (
                <Select value={l.accountPurpose || ""} onValueChange={(v) => setLine(i, "accountPurpose", v)}>
                  <SelectTrigger className="min-w-[160px] h-9"><SelectValue placeholder="اختر الغرض..." /></SelectTrigger>
                  <SelectContent>{ACCOUNT_PURPOSE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              ) },
              { header: "الكمية", width: "90px", render: (l, i) => <NumberField label="الكمية" hideLabel className="w-20" min={0} value={l.quantity || ""} onChange={(v) => setLine(i, "quantity", v)} placeholder="0" /> },
              { header: "الوحدة", width: "90px", render: (l, i) => <Input className="w-20" value={l.unit} onChange={(e) => setLine(i, "unit", e.target.value)} placeholder="قطعة" /> },
              { header: "سعر الوحدة", width: "110px", render: (l, i) => <NumberField label="سعر الوحدة" hideLabel className="w-24" min={0} value={l.unitPrice || ""} onChange={(v) => setLine(i, "unitPrice", v)} placeholder="0.00" /> },
              { header: "الإجمالي", width: "110px", render: (l) => <span className="font-mono text-sm">{formatCurrency(lineAmount(l))}</span> },
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
            <NumberField label="نسبة الضريبة % (على الفاتورة)" min={0} max={100} value={vatRate} onChange={(v) => setVatRate(Number(v) || 0)} />
            <TextField label="البيان (اختياري)" value={description} onChange={setDescription} placeholder="ملاحظات الفاتورة" />
          </div>

          <FormFieldWrapper label="مرفق فاتورة المورد (إلزامي)" required>
            <FileDropZone files={attachments} onFilesChange={setAttachments} label="أرفق صورة/ملف فاتورة المورد" maxSizeMB={5} />
          </FormFieldWrapper>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate("/finance/expenses")}>إلغاء</Button>
            <Button type="submit" disabled={createMut.isPending} rateLimitAware>
              {createMut.isPending ? "جاري الحفظ..." : "حفظ فاتورة المورد"}
            </Button>
          </div>
        </form>
    </div>
  );
  // مضمّن داخل الصفحة الموحّدة (FinanceCreatePage يوفّر القشرة + التبويبات)، أو مستقلًّا.
  return embedded ? inner : (
    <CreatePageLayout title="فاتورة مشتريات (تسجيل واقعة)" subtitle="نفس جدول البنود الموحّد، مع ربط كل بند بكيانه وغرض حسابه — تمرّ على محرّك فاتورة المورد القائم" backPath="/finance/expenses">
      {inner}
    </CreatePageLayout>
  );
}
