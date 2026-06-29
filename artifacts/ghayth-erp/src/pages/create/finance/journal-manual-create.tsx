import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { BranchSelect, CostCenterSelect, PostingAccountSelect } from "@/components/shared/entity-selects";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { formatCurrency, roundMoney , todayLocal } from "@/lib/formatters";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NumberField } from "@/components/shared/form-field-wrapper";
import { LineAllocationPanel, type LineAllocation, deriveAllocationStatus, buildAllocationPayload } from "@/components/shared/line-allocation-panel";
import { LineItemsTable } from "@/components/shared/line-items-table";

type JournalLine = {
  accountCode: string;
  description: string;
  debit: number;
  credit: number;
  allocation?: LineAllocation;
};

const emptyLine = (): JournalLine => ({
  accountCode: "", description: "", debit: 0, credit: 0,
  allocation: {} as LineAllocation,
});

export default function JournalManualCreatePage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("finance_journal_manual_create", {
    description: "",
    date: todayLocal(),
    branchId: "",
    costCenter: "",
    notes: "",
    lines: [emptyLine(), emptyLine()],
  });
  const { fieldErrors, validate } = useFieldErrors();

  const createMutation = useApiMutation<unknown, any>(
    "/finance/journal-manual",
    "POST",
    [["journal-manual"]],
    {
      successMessage: "تم إنشاء القيد اليدوي بحالة مسودة",
      onSuccess: () => { clearDraft(); navigate("/finance/journal-manual"); },
    },
  );


  const totalDebit = roundMoney(form.lines.reduce((s, l) => s + roundMoney(l.debit), 0));
  const totalCredit = roundMoney(form.lines.reduce((s, l) => s + roundMoney(l.credit), 0));
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, emptyLine()] }));
  }
  function removeLine(i: number) {
    if (form.lines.length <= 2) return;
    setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  }
  function updateLine(i: number, field: keyof JournalLine, val: any) {
    setForm(f => {
      const lines = [...f.lines];
      lines[i] = { ...lines[i], [field]: field === "debit" || field === "credit" ? Number(val) || 0 : val };
      return { ...f, lines };
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const firstError = validate({
      description: form.description ? null : "البيان مطلوب",
      balance: !isBalanced ? "القيد غير متوازن — يجب أن يتساوى مجموع المدين والدائن" : null,
    });
    if (firstError) { toast({ variant: "destructive", title: firstError }); return; }
    createMutation.mutate({
      ...form,
      date: form.date || undefined,
      // #2230 — multi-branch users must pick a branch (backend returns
      // BRANCH_REQUIRED); single-branch users auto-derive from scope.
      branchId: form.branchId ? Number(form.branchId) : undefined,
      lines: form.lines.map((l) => ({
        accountCode: l.accountCode,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
        ...buildAllocationPayload(l.allocation ?? {}),
      })),
    });
  }

  return (
    <CreatePageLayout
      title="إنشاء قيد يدوي جديد"
      subtitle="أنشئ قيداً يدوياً بحالة مسودة، ثم أرسله للمراجعة والاعتماد"
      backPath="/finance/journal-manual"
    >
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div dir="rtl">
        <form onSubmit={handleSubmit} className="space-y-4">
            <CreationDateField />
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">البيان *</label>
                <Input required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف القيد اليدوي" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">تاريخ القيد</label>
                <DatePicker value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} />
              </div>
              {/* #2230 — mirror the journal-create exemplar: multi-branch users
                  must pick a branch (backend BRANCH_REQUIRED); single-branch
                  auto-derives from scope. Was missing → manual journals failed. */}
              <BranchSelect
                value={form.branchId ?? ""}
                onChange={(v) => setForm(f => ({ ...f, branchId: String(v ?? "") }))}
                label="الفرع"
                allowCreate={false}
                autoSelectOwnBranch
              />
              <CostCenterSelect
                value={form.costCenter}
                onChange={(v) => setForm(f => ({ ...f, costCenter: v }))}
              />
            </div>

            {/* الجدول الموحّد للإدخالات المالية — يعتمد المكوّن المشترك
                <LineItemsTable> بدل جدول يدوي مكرّر (نفس الأعمدة والسلوك:
                إضافة/حذف سطر، لوحة الأبعاد لكل سطر، صف المجموع). */}
            <LineItemsTable
              items={form.lines}
              minItems={2}
              onAdd={addLine}
              onRemove={removeLine}
              addLabel="إضافة سطر"
              columns={[
                {
                  header: "رمز الحساب",
                  render: (line, i) => (
                    <PostingAccountSelect
                      value={line.accountCode}
                      onChange={(v) => updateLine(i, "accountCode", v)}
                      label="رمز الحساب"
                      placeholder="اختر حسابًا قابلًا للترحيل"
                      error={fieldErrors[`lines.${i}.accountCode`]}
                    />
                  ),
                },
                {
                  header: "البيان",
                  render: (line, i) => (
                    <Input value={line.description} onChange={e => updateLine(i, "description", e.target.value)} placeholder="البيان" />
                  ),
                },
                {
                  header: "مدين", width: "120px",
                  render: (line, i) => (
                    <NumberField label="مدين" hideLabel className="w-24" min={0} value={line.debit || ""} onChange={v => updateLine(i, "debit", v)} placeholder="0" />
                  ),
                },
                {
                  header: "دائن", width: "120px",
                  render: (line, i) => (
                    <NumberField label="دائن" hideLabel className="w-24" min={0} value={line.credit || ""} onChange={v => updateLine(i, "credit", v)} placeholder="0" />
                  ),
                },
              ]}
              renderExpansion={(line, i) => (
                <LineAllocationPanel
                  value={line.allocation ?? {}}
                  onChange={(next) => updateLine(i, "allocation" as any, next as any)}
                  status={deriveAllocationStatus(line.allocation ?? {})}
                />
              )}
              renderTotals={() => (
                <tr className="bg-surface-subtle font-semibold border-t">
                  <td colSpan={2} className="px-3 py-2 text-muted-foreground">المجموع</td>
                  <td className={`px-3 py-2 ${isBalanced ? "text-status-success-foreground" : "text-status-error-foreground"}`}>{formatCurrency(totalDebit)}</td>
                  <td className={`px-3 py-2 ${isBalanced ? "text-status-success-foreground" : "text-status-error-foreground"}`}>{formatCurrency(totalCredit)}</td>
                  <td></td>
                </tr>
              )}
            />

            {!isBalanced && totalDebit > 0 && (
              <div className="text-sm text-status-error-foreground bg-status-error-surface border border-status-error-surface rounded-lg px-3 py-2">
                القيد غير متوازن — الفرق: {formatCurrency(Math.abs(totalDebit - totalCredit))}
              </div>
            )}
            {isBalanced && (
              <div className="text-sm text-status-success-foreground bg-status-success-surface border border-status-success-surface rounded-lg px-3 py-2">
                القيد متوازن
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">ملاحظات</label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات اختيارية" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate("/finance/journal-manual")}>إلغاء</Button>
              <Button type="submit" disabled={createMutation.isPending || !isBalanced} rateLimitAware>
                {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء القيد"}
              </Button>
            </div>
          </form>
      </div>
    </CreatePageLayout>
  );
}
