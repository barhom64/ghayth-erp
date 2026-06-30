import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, AutoField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import { isMoneyAccount } from "@/lib/finance-account-usage";
import { LineItemsTable } from "@/components/shared/line-items-table";
import { LineAllocationsEditor, type LineAllocation } from "@/components/shared/line-allocations-editor";
import { DocumentAttachmentsPanel, type DocAttachment } from "@/components/shared/document-attachments-panel";
import { BranchSelect, AccountSelect } from "@/components/shared/entity-selects";
import { NumberField, FormFieldWrapper, TextField } from "@/components/shared/form-field-wrapper";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { FinanceStartFromDocument } from "@/components/shared/finance-start-from-document";

/**
 * تسجيل واقعة مالية — م١-ب. الواجهة تشغيلية: يدخل المستخدم (الكيان/الطرف + ما حدث +
 * البنود + الحساب البنكي)، والنظام يشتقّ القيد خلفيًا. تبويبا قبض/صرف تصنيف لا إلزام
 * (docs/25 §٢.١). يُرسل إلى POST /finance/documents (الذي يُعيد استخدام محرّك القيد).
 * م١-ب الواجهة: الهيكل + جدول البنود (بالوحدة) + توزيع السطر على عدة كيانات +
 * المرفقات الموسومة بمستويين + معاينة القيد المشتقّ. القديم (vouchers/expenses) يبقى عاملًا.
 */
type DocLine = {
  itemName: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRatePercent: number;
  allocations: LineAllocation[];
};

const emptyLine = (): DocLine => ({
  itemName: "", description: "", quantity: 1, unit: "", unitPrice: 0, taxRatePercent: 0, allocations: [],
});

const lineNet = (l: DocLine) => roundMoney((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));
const lineVat = (l: DocLine) => roundMoney(lineNet(l) * ((Number(l.taxRatePercent) || 0) / 100));
const lineTotal = (l: DocLine) => roundMoney(lineNet(l) + lineVat(l));

type PreviewLeg = { accountCode: string; debit: number; credit: number };

export default function FinancialEventCreate({ embedded = false }: { embedded?: boolean } = {}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [preview, setPreview] = useState<PreviewLeg[] | null>(null);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("finance_event_create", {
    direction: "payment" as "receipt" | "payment",
    date: todayLocal(),
    branchId: "",
    cashAccountCode: "",
    reference: "",
    description: "",
    lines: [emptyLine()] as DocLine[],
    attachments: [] as DocAttachment[],
  });

  const saveMut = useApiMutation<{ journalId: number }, any>("/finance/documents", "POST", [["vouchers"], ["journal-manual"]], {
    successMessage: "تم تسجيل الواقعة المالية",
    onSuccess: () => { clearDraft(); navigate("/finance/vouchers"); },
  });
  const previewMut = useApiMutation<{ lines: PreviewLeg[]; totals?: any }, any>("/finance/documents", "POST", []);

  const isReceipt = form.direction === "receipt";
  const totalNet = roundMoney(form.lines.reduce((s, l) => s + lineNet(l), 0));
  const totalVat = roundMoney(form.lines.reduce((s, l) => s + lineVat(l), 0));
  const grandTotal = roundMoney(totalNet + totalVat);

  function setLine(i: number, field: keyof DocLine, val: any) {
    setForm((f) => {
      const lines = [...f.lines];
      const passthrough = field === "itemName" || field === "description" || field === "unit" || field === "allocations";
      lines[i] = { ...lines[i], [field]: passthrough ? val : Number(val) || 0 };
      return { ...f, lines };
    });
  }
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));
  const removeLine = (i: number) => setForm((f) => (f.lines.length <= 1 ? f : { ...f, lines: f.lines.filter((_, idx) => idx !== i) }));

  function buildPayload(extra?: Record<string, unknown>) {
    return {
      direction: form.direction,
      cashAccountCode: form.cashAccountCode,
      date: form.date || undefined,
      branchId: form.branchId ? Number(form.branchId) : undefined,
      reference: form.reference || undefined,
      description: form.description || undefined,
      lines: form.lines
        .filter((l) => Number(l.quantity) > 0 && Number(l.unitPrice) > 0)
        .map((l) => {
          const allocs = l.allocations.filter((a) => a.entityId);
          return {
            itemName: l.itemName || undefined,
            description: l.description || undefined,
            quantity: Number(l.quantity) || 0,
            unit: l.unit || undefined,
            unitPrice: Number(l.unitPrice) || 0,
            taxRatePercent: Number(l.taxRatePercent) || 0,
            allocations: allocs.length > 0
              ? allocs.map((a) => ({
                  entityType: a.entityType,
                  entityId: Number(a.entityId),
                  allocationType: "percent" as const,
                  percent: Number(a.percent) || 0,
                  costBearer: a.costBearer || undefined,
                }))
              : undefined,
          };
        }),
      attachments: form.attachments.length > 0
        ? form.attachments.map((a) => ({
            url: a.url, fileName: a.fileName, mimeType: a.mimeType,
            documentType: a.documentType, lineNo: a.lineNo,
          }))
        : undefined,
      ...extra,
    };
  }

  function validate(): string | null {
    if (!form.cashAccountCode) return "حدّد الخزنة / البنك (مصدر أو وجهة المال)";
    if (!form.lines.some((l) => Number(l.quantity) > 0 && Number(l.unitPrice) > 0)) return "أدخل بندًا واحدًا على الأقل بكمية وسعر";
    return null;
  }

  async function handlePreview() {
    const err = validate();
    if (err) { toast({ variant: "destructive", title: err }); return; }
    try {
      const res = await previewMut.mutateAsync(buildPayload({ dryRun: true }));
      setPreview(res.lines ?? []);
    } catch (e: any) {
      setPreview(null);
      toast({ variant: "destructive", title: "تعذّرت المعاينة", description: e?.fix ?? e?.message ?? "" });
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { toast({ variant: "destructive", title: err }); return; }
    saveMut.mutate(buildPayload());
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
          {/* اختصار «ابدأ من مستند» (قراءة ضوئية OCR + استيراد Excel/CSV) — مكوّن مشترك (DRY). */}
          <FinanceStartFromDocument />

          {/* النوع: تصنيف/اختصار لا إلزام — لكن الاتجاه واضح بصريًّا (لون + سهم + لافتة)
              فلا يلتبس قبض (مال داخل) بصرف (مال خارج). النظام يضع القيد في اتجاهه تلقائيًّا. */}
          <div className="space-y-2">
            <div className="inline-flex rounded-lg border overflow-hidden">
              {(["payment", "receipt"] as const).map((dir) => {
                const active = form.direction === dir;
                const isRcpt = dir === "receipt";
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, direction: dir }))}
                    className={cn(
                      "flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors",
                      active
                        ? isRcpt
                          ? "bg-status-success-surface text-status-success-foreground"
                          : "bg-status-warning-surface text-status-warning-foreground"
                        : "bg-surface-subtle text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {isRcpt ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    {isRcpt ? "قبض (مال داخل)" : "صرف (مال خارج)"}
                  </button>
                );
              })}
            </div>
            {/* لافتة الاتجاه — تشرح حركة المال بالعربية البسيطة فلا يلتبس القبض بالصرف */}
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                isReceipt
                  ? "border-status-success-foreground/30 bg-status-success-surface text-status-success-foreground"
                  : "border-status-warning-foreground/30 bg-status-warning-surface text-status-warning-foreground",
              )}
            >
              {isReceipt
                ? <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0" />
                : <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>
                {isReceipt
                  ? "قبض — المال يدخل خزنتك. تُسجّل مبلغًا استلمته (من عميل أو جهة)، والنظام يجعل الخزنة/البنك مدينًا تلقائيًّا."
                  : "صرف — المال يخرج من خزنتك. تُسجّل مبلغًا دفعته (لمورّد أو مصروف)، والنظام يجعل الخزنة/البنك دائنًا تلقائيًّا."}
              </span>
            </div>
          </div>

          {/* م٣ — تحصيل العميل: «قبض» على فواتير عميل مفتوحة (مطابقة آلية FIFO). */}
          {isReceipt && (
            <p className="text-xs text-muted-foreground">
              لتحصيل دفعة من عميل على فواتيره المفتوحة (مطابقة آلية، الأقدم أولًا):{" "}
              <button type="button" className="text-primary hover:underline" onClick={() => navigate("/finance/collect")}>
                تحصيل من عميل ←
              </button>
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormFieldWrapper label="التاريخ" required>
              <DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
            </FormFieldWrapper>
            <BranchSelect value={form.branchId} onChange={(v) => setForm((f) => ({ ...f, branchId: String(v ?? "") }))} label="الفرع" allowCreate={false} autoSelectOwnBranch />
            <AccountSelect
              value={form.cashAccountCode}
              onChange={(v) => setForm((f) => ({ ...f, cashAccountCode: v }))}
              label={isReceipt ? "وجهة المال (الخزنة / البنك)" : "مصدر المال (الخزنة / البنك)"}
              required
              placeholder="اختر الخزنة أو البنك..."
              filter={(a: any) => isMoneyAccount(a)}
            />
          </div>

          <LineItemsTable
            items={form.lines}
            minItems={1}
            onAdd={addLine}
            onRemove={removeLine}
            addLabel="إضافة بند"
            columns={[
              { header: "الصنف / الخدمة", render: (l, i) => <Input value={l.itemName} onChange={(e) => setLine(i, "itemName", e.target.value)} placeholder="مثال: وقود" /> },
              { header: "الوصف", render: (l, i) => <Input value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} placeholder="وصف اختياري" /> },
              { header: "الكمية", width: "90px", render: (l, i) => <NumberField label="الكمية" hideLabel className="w-20" min={0} value={l.quantity || ""} onChange={(v) => setLine(i, "quantity", v)} placeholder="0" /> },
              { header: "الوحدة", width: "90px", render: (l, i) => <Input className="w-20" value={l.unit} onChange={(e) => setLine(i, "unit", e.target.value)} placeholder="لتر/قطعة" /> },
              { header: "سعر الوحدة", width: "110px", render: (l, i) => <NumberField label="سعر الوحدة" hideLabel className="w-24" min={0} value={l.unitPrice || ""} onChange={(v) => setLine(i, "unitPrice", v)} placeholder="0.00" /> },
              { header: "ضريبة %", width: "80px", render: (l, i) => <NumberField label="ضريبة" hideLabel className="w-16" min={0} value={l.taxRatePercent || ""} onChange={(v) => setLine(i, "taxRatePercent", v)} placeholder="0" /> },
              { header: "الإجمالي", width: "110px", render: (l) => <span className="font-mono text-sm">{formatCurrency(lineTotal(l))}</span> },
            ]}
            renderExpansion={(l, i) => (
              <LineAllocationsEditor value={l.allocations} onChange={(next) => setLine(i, "allocations", next)} />
            )}
            renderTotals={() => (
              <tr className="bg-surface-subtle font-semibold border-t">
                <td colSpan={6} className="px-3 py-2 text-muted-foreground">الإجمالي (صافٍ {formatCurrency(totalNet)} + ضريبة {formatCurrency(totalVat)})</td>
                <td className="px-3 py-2 font-mono">{formatCurrency(grandTotal)}</td>
                <td />
              </tr>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField label="رقم المرجع (اختياري)" value={form.reference} onChange={(v) => setForm((f) => ({ ...f, reference: v }))} placeholder="رقم الفاتورة / العقد / الشيك" />
            <TextField label="البيان (اختياري)" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="يُولّد تلقائيًا إن تُرك فارغًا" />
          </div>

          <DocumentAttachmentsPanel
            value={form.attachments}
            onChange={(v) => setForm((f) => ({ ...f, attachments: v }))}
            lineCount={form.lines.length}
          />

          {preview && preview.length > 0 && (
            <div className="border rounded-lg p-3 bg-muted/30">
              <p className="text-xs font-semibold mb-2">معاينة القيد المشتقّ (قبل الحفظ)</p>
              <DataTable<PreviewLeg>
                noToolbar
                pageSize={0}
                className="text-xs font-mono"
                data={preview}
                rowKey={(_l, i) => i}
                columns={[
                  { key: "accountCode", header: "الحساب", render: (l) => l.accountCode },
                  { key: "debit", header: "مدين", align: "end", render: (l) => <span className="text-orange-700">{l.debit ? formatCurrency(l.debit) : ""}</span> },
                  { key: "credit", header: "دائن", align: "end", render: (l) => <span className="text-emerald-700">{l.credit ? formatCurrency(l.credit) : ""}</span> },
                ] satisfies DataTableColumn<PreviewLeg>[]}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate("/finance/vouchers")}>إلغاء</Button>
            <Button type="button" variant="outline" onClick={handlePreview} disabled={previewMut.isPending} rateLimitAware>
              {previewMut.isPending ? "جاري المعاينة..." : "معاينة القيد"}
            </Button>
            <Button type="submit" disabled={saveMut.isPending} rateLimitAware>
              {saveMut.isPending ? "جاري الحفظ..." : "حفظ الواقعة"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
  // مضمّن داخل الصفحة الموحّدة (FinanceCreatePage يوفّر القشرة + التبويبات)، أو مستقلًّا.
  return embedded ? inner : (
    <CreatePageLayout title="تسجيل واقعة مالية" subtitle="أدخل ما حدث والبنود، والنظام يشتقّ القيد تلقائيًا" backPath="/finance/vouchers">
      {inner}
    </CreatePageLayout>
  );
}
