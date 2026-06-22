import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { AccountSelect } from "@/components/shared/entity-selects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { LineItemsTable } from "@/components/shared/line-items-table";

interface TemplateLine {
  accountCode: string;
  description: string;
  debit: string;
  credit: string;
}

const emptyLine = (): TemplateLine => ({ accountCode: "", description: "", debit: "", credit: "" });

export default function RecurringJournalsCreatePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { fieldErrors, validate } = useFieldErrors();

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("finance_recurring_journals_create", {
    name: "",
    description: "",
    frequency: "monthly",
    startDate: todayLocal(),
    templateRef: "",
    active: true,
    lines: [emptyLine(), emptyLine()] as TemplateLine[],
  });
  const name = form.name;
  const setName = (v: string) => setForm(f => ({ ...f, name: v }));
  const description = form.description;
  const setDescription = (v: string) => setForm(f => ({ ...f, description: v }));
  const frequency = form.frequency;
  const setFrequency = (v: string) => setForm(f => ({ ...f, frequency: v }));
  const startDate = form.startDate;
  const setStartDate = (v: string) => setForm(f => ({ ...f, startDate: v }));
  const templateRef = form.templateRef;
  const setTemplateRef = (v: string) => setForm(f => ({ ...f, templateRef: v }));
  const active = form.active;
  const setActive = (v: boolean) => setForm(f => ({ ...f, active: v }));
  const lines = form.lines;
  const setLines = (updater: TemplateLine[] | ((prev: TemplateLine[]) => TemplateLine[])) => {
    setForm(f => ({ ...f, lines: typeof updater === "function" ? updater(f.lines) : updater }));
  };

  const totalDebit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.debit), 0));
  const totalCredit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.credit), 0));
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  const createMut = useApiMutation<unknown, any>(
    "/finance/recurring-journals",
    "POST",
    [["recurring-journals"]],
    {
      successMessage: "تم إنشاء القيد الدوري",
      onSuccess: () => { clearDraft(); setLocation("/finance/recurring-journals"); },
    },
  );

  function updateLine(idx: number, field: keyof TemplateLine, value: string) {
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
        description: l.description || null,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }));
    const firstError = validate({
      name: name.trim() ? null : "اسم القيد الدوري مطلوب",
      balance: !isBalanced ? "القالب غير متوازن" : null,
      lines: validLines.length < 2 ? "يجب إدخال بندين على الأقل" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate({
      name,
      description,
      frequency,
      startDate,
      active,
      templateRef: templateRef || null,
      templateDescription: description || null,
      templateLines: validLines,
    });
  }

  return (
    <CreatePageLayout title="قيد دوري جديد" backPath="/finance/recurring-journals">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <TextField label="اسم القيد" required value={name} onChange={setName} placeholder="مثال: إهلاك شهري للسيارات" className="md:col-span-2" error={fieldErrors.name} />
        <FormFieldWrapper label="التكرار" required>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">يومي</SelectItem>
              <SelectItem value="weekly">أسبوعي</SelectItem>
              <SelectItem value="monthly">شهري</SelectItem>
              <SelectItem value="quarterly">ربع سنوي</SelectItem>
              <SelectItem value="yearly">سنوي</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="تاريخ البدء" required>
          <DatePicker value={startDate} onChange={(v) => setStartDate(v)} />
        </FormFieldWrapper>
        <TextField label="الوصف" value={description} onChange={setDescription} className="md:col-span-2" />
        <TextField label="رمز المرجع للقيود المولدة" value={templateRef} onChange={setTemplateRef} placeholder="مثال: REC-DEP" />
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
            نشط — يُنفَّذ تلقائياً عند حلول موعد الاستحقاق
          </label>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <h3 className="font-semibold mb-3">قالب بنود القيد</h3>
          {/* الجدول الموحّد للإدخالات المالية — المكوّن المشترك <LineItemsTable>
              بدل شبكة CSS يدوية (نفس الأعمدة والسلوك: إضافة/حذف بند، صف الإجمالي
              مع شارة التوازن). */}
          <LineItemsTable<TemplateLine>
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
                header: "البيان",
                render: (line, idx) => (
                  <Input value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} placeholder="البيان" />
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
                <td></td>
                <td className="px-3 py-2 text-status-success-foreground">{formatCurrency(totalDebit)}</td>
                <td className="px-3 py-2 text-status-error-foreground">{formatCurrency(totalCredit)}</td>
                <td></td>
              </tr>
            )}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/recurring-journals")}>
          إلغاء
        </Button>
        <Button onClick={handleSubmit} disabled={!isBalanced || !name || createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
