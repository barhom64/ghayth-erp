import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import { useFormContext } from "react-hook-form";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormDateField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { CostCenterSelect } from "@/components/shared/entity-selects";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/shared/form-field-wrapper";

type JournalLine = { accountCode: string; description: string; debit: number; credit: number };

const emptyLine = (): JournalLine => ({ accountCode: "", description: "", debit: 0, credit: 0 });

const schema = z.object({
  description: z.string().min(1, "البيان مطلوب"),
  date: z.string(),
  costCenter: z.string().optional(),
  notes: z.string().optional(),
});

function BalanceBanner({ lines }: { lines: JournalLine[] }) {
  const totalDebit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.debit), 0));
  const totalCredit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.credit), 0));
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  if (totalDebit <= 0) return null;
  if (isBalanced) {
    return (
      <div className="text-sm text-status-success-foreground bg-status-success-surface border border-status-success-surface rounded-lg px-3 py-2">
        القيد متوازن
      </div>
    );
  }
  return (
    <div className="text-sm text-status-error-foreground bg-status-error-surface border border-status-error-surface rounded-lg px-3 py-2">
      القيد غير متوازن — الفرق: {formatCurrency(Math.abs(totalDebit - totalCredit))}
    </div>
  );
}

export default function JournalManualCreatePage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()]);

  const { data: coaData, isLoading, isError } = useApiQuery<any>(
    ["chart-of-accounts"],
    `/finance/chart-of-accounts${scopeSuffix}`,
  );

  const createMutation = useApiMutation<unknown, any>(
    "/finance/journal-manual",
    "POST",
    [["journal-manual"]],
    {
      successMessage: "تم إنشاء القيد اليدوي بحالة مسودة",
      onSuccess: () => { navigate("/finance/journal-manual"); },
    },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const coa = coaData?.data ?? coaData ?? [];

  const totalDebit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.debit), 0));
  const totalCredit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.credit), 0));
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  function addLine() {
    setLines([...lines, emptyLine()]);
  }
  function removeLine(i: number) {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, idx) => idx !== i));
  }
  function updateLine(i: number, field: keyof JournalLine, val: any) {
    setLines((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: field === "debit" || field === "credit" ? Number(val) || 0 : val };
      return next;
    });
  }

  return (
    <CreatePageLayout
      title="إنشاء قيد يدوي جديد"
      subtitle="أنشئ قيداً يدوياً بحالة مسودة، ثم أرسله للمراجعة والاعتماد"
      backPath="/finance/journal-manual"
    >
      <CreationDateField />
      <FormShell
        schema={schema}
        defaultValues={{ description: "", date: todayLocal(), costCenter: "", notes: "" }}
        submitLabel={createMutation.isPending ? "جاري الإنشاء..." : "إنشاء القيد"}
        disabled={!isBalanced}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => navigate("/finance/journal-manual")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          createMutation.mutate({ ...values, lines, date: values.date || undefined });
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="description" label="البيان" required placeholder="وصف القيد اليدوي" className="md:col-span-2" />
          <FormDateField name="date" label="التاريخ" />
          <FormEntitySelect name="costCenter" select={CostCenterSelect} label="مركز التكلفة" />
        </FormGrid>

        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-3 py-2 text-right">رمز الحساب</th>
                <th className="px-3 py-2 text-right">البيان</th>
                <th className="px-3 py-2 text-right">مدين</th>
                <th className="px-3 py-2 text-right">دائن</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1">
                    <Input
                      list={`coa-list-${i}`}
                      value={line.accountCode}
                      onChange={(e) => updateLine(i, "accountCode", e.target.value)}
                      placeholder="الحساب"
                    />
                    <datalist id={`coa-list-${i}`}>
                      {(Array.isArray(coa) ? coa : []).map((a: any) => (
                        <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                      ))}
                    </datalist>
                  </td>
                  <td className="px-2 py-1">
                    <Input value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="البيان" />
                  </td>
                  <td className="px-2 py-1">
                    <NumberField label="مدين" className="w-24" min={0} value={line.debit || ""} onChange={(v) => updateLine(i, "debit", v)} placeholder="0" />
                  </td>
                  <td className="px-2 py-1">
                    <NumberField label="دائن" className="w-24" min={0} value={line.credit || ""} onChange={(v) => updateLine(i, "credit", v)} placeholder="0" />
                  </td>
                  <td className="px-2 py-1">
                    <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-status-error-foreground text-lg leading-none">&times;</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-subtle font-semibold">
              <tr>
                <td colSpan={2} className="px-3 py-2 text-muted-foreground">المجموع</td>
                <td className={`px-3 py-2 ${isBalanced ? "text-status-success-foreground" : "text-status-error-foreground"}`}>{formatCurrency(totalDebit)}</td>
                <td className={`px-3 py-2 ${isBalanced ? "text-status-success-foreground" : "text-status-error-foreground"}`}>{formatCurrency(totalCredit)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <BalanceBanner lines={lines} />

        <Button type="button" variant="outline" size="sm" onClick={addLine}>+ إضافة سطر</Button>

        <FormTextareaField name="notes" label="ملاحظات" rows={2} placeholder="ملاحظات اختيارية" />
      </FormShell>
    </CreatePageLayout>
  );
}
