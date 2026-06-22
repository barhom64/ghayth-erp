import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { AccountSelect } from "@/components/shared/entity-selects";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { Upload } from "lucide-react";
import { formatCurrency, roundMoney, currentYearRiyadh } from "@/lib/formatters";
import { FormFieldWrapper, NumberField } from "@/components/shared/form-field-wrapper";
import { LineItemsTable } from "@/components/shared/line-items-table";

interface OBLine {
  accountCode: string;
  debit: string;
  credit: string;
}

const emptyLine = (): OBLine => ({ accountCode: "", debit: "", credit: "" });

function firstDayOfFiscalYear(): string {
  return `${currentYearRiyadh()}-01-01`;
}

export default function OpeningBalancesCreatePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { fieldErrors, validate } = useFieldErrors();


  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("finance_opening_balances_create", {
    periodStart: firstDayOfFiscalYear(),
    lines: [emptyLine(), emptyLine()] as OBLine[],
    force: false,
  });
  const periodStart = form.periodStart;
  const setPeriodStart = (v: string) => setForm(f => ({ ...f, periodStart: v }));
  const lines = form.lines;
  const setLines = (updater: OBLine[] | ((prev: OBLine[]) => OBLine[])) => {
    setForm(f => ({ ...f, lines: typeof updater === "function" ? updater(f.lines) : updater }));
  };
  const force = form.force;
  const setForce = (v: boolean) => setForm(f => ({ ...f, force: v }));

  const totalDebit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.debit), 0));
  const totalCredit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.credit), 0));
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  const createMut = useApiMutation<unknown, any>(
    "/finance/opening-balances",
    "POST",
    [["opening-balances"]],
    {
      successMessage: "تم حفظ الأرصدة الافتتاحية",
      onSuccess: () => { clearDraft(); setLocation("/finance/opening-balances"); },
    },
  );

  const importCsvMut = useApiMutation<unknown, any>(
    "/finance/opening-balances/import-csv",
    "POST",
    [["opening-balances"]],
    {
      successMessage: "تم استيراد الأرصدة الافتتاحية من ملف CSV",
      onSuccess: () => { clearDraft(); setLocation("/finance/opening-balances"); },
    },
  );


  function updateLine(idx: number, field: keyof OBLine, value: string) {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }
  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const removeLine = (idx: number) =>
    setLines((p) => (p.length > 2 ? p.filter((_, i) => i !== idx) : p));

  function handleSubmit() {
    const validLines = lines
      .filter((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l) => ({
        accountCode: l.accountCode,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }));
    const firstError = validate({
      periodStart: periodStart ? null : "حدد تاريخ بداية الفترة",
      balance: !isBalanced ? "الأرصدة غير متوازنة" : null,
      lines: validLines.length < 2 ? "يجب إدخال بندين على الأقل" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate({ periodStart, lines: validLines, force });
  }

  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const csv = String(reader.result || "");
      importCsvMut.mutate({ periodStart, csv, force });
    };
    reader.onerror = () => toast({ variant: "destructive", title: "تعذر قراءة الملف" });
    reader.readAsText(file);
  }

  return (
    <CreatePageLayout title="أرصدة افتتاحية جديدة" backPath="/finance/opening-balances">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <FormFieldWrapper label="تاريخ بداية الفترة" required>
          <DatePicker value={periodStart} onChange={(v) => setPeriodStart(v)} />
        </FormFieldWrapper>
        <div className="flex items-end gap-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <Checkbox
              checked={force}
              onCheckedChange={(v) => setForce(v === true)}
            />
            استبدال أي قيد موجود لنفس الفترة
          </label>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">بنود الأرصدة الافتتاحية</h3>
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCsvFile(file);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={(e) => {
                  const input = (e.currentTarget.previousSibling as HTMLInputElement) || null;
                  input?.click();
                }}
              >
                <Upload className="h-4 w-4 me-1" />
                استيراد CSV
              </Button>
            </label>
          </div>

          {/* الجدول الموحّد للإدخالات المالية — المكوّن المشترك <LineItemsTable>
              بدل شبكة CSS يدوية (نفس الأعمدة والسلوك: إضافة/حذف بند، صف الإجمالي
              مع شارة التوازن). */}
          <LineItemsTable
            items={lines}
            minItems={2}
            onAdd={addLine}
            onRemove={removeLine}
            addLabel="إضافة بند"
            columns={[
              {
                header: "الحساب",
                render: (line, idx) => (
                  <AccountSelect
                    value={line.accountCode}
                    onChange={(v) => updateLine(idx, "accountCode", v)}
                    label="" allowCreate={false}
                  />
                ),
              },
              {
                header: "مدين", width: "120px",
                render: (line, idx) => (
                  <NumberField label="مدين" hideLabel min={0} value={line.debit} onChange={(v) => updateLine(idx, "debit", v)} placeholder="0" />
                ),
              },
              {
                header: "دائن", width: "120px",
                render: (line, idx) => (
                  <NumberField label="دائن" hideLabel min={0} value={line.credit} onChange={(v) => updateLine(idx, "credit", v)} placeholder="0" />
                ),
              },
            ]}
            renderTotals={() => (
              <tr className="bg-surface-subtle font-semibold border-t text-sm">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    الإجمالي
                    <Badge className={isBalanced ? "bg-status-success-surface text-status-success-foreground" : "bg-status-error-surface text-status-error-foreground"}>
                      {isBalanced ? "متوازن" : "غير متوازن"}
                    </Badge>
                  </span>
                </td>
                <td className="px-3 py-2 text-status-success-foreground">{formatCurrency(totalDebit)}</td>
                <td className="px-3 py-2 text-status-error-foreground">{formatCurrency(totalCredit)}</td>
                <td></td>
              </tr>
            )}
            footer={!isBalanced && totalDebit > 0 ? (
              <p className="text-destructive text-sm">
                فرق: {formatCurrency(Math.abs(totalDebit - totalCredit))}
              </p>
            ) : undefined}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/opening-balances")}>
          إلغاء
        </Button>
        <Button onClick={handleSubmit} disabled={!isBalanced || createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
