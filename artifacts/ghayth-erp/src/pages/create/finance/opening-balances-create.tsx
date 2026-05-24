import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormDateField,
  FormSelectField,
  FormCheckboxField,
} from "@workspace/ui-core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Upload } from "lucide-react";
import { formatCurrency, roundMoney } from "@/lib/formatters";
import { NumberField } from "@/components/shared/form-field-wrapper";

interface OBLine {
  accountCode: string;
  debit: string;
  credit: string;
}

const emptyLine = (): OBLine => ({ accountCode: "", debit: "", credit: "" });

function firstDayOfFiscalYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}

const schema = z.object({
  periodStart: z.string().min(1, "حدد تاريخ بداية الفترة"),
  force: z.boolean(),
});

export default function OpeningBalancesCreatePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [lines, setLines] = useState<OBLine[]>([emptyLine(), emptyLine()]);

  const { data: accountsData, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["accounts-list"],
    "/finance/accounts",
  );

  const createMut = useApiMutation<unknown, any>(
    "/finance/opening-balances",
    "POST",
    [["opening-balances"]],
    {
      successMessage: "تم حفظ الأرصدة الافتتاحية",
      onSuccess: () => { setLocation("/finance/opening-balances"); },
    },
  );

  const importCsvMut = useApiMutation<unknown, any>(
    "/finance/opening-balances/import-csv",
    "POST",
    [["opening-balances"]],
    {
      successMessage: "تم استيراد الأرصدة الافتتاحية من ملف CSV",
      onSuccess: () => { setLocation("/finance/opening-balances"); },
    },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const accounts = accountsData?.data || [];

  const totalDebit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.debit), 0));
  const totalCredit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.credit), 0));
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

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

  function handleCsvFile(file: File, periodStart: string, force: boolean) {
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
      <CreationDateField />
      <FormShell
        schema={schema}
        defaultValues={{ periodStart: firstDayOfFiscalYear(), force: false }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        disabled={!isBalanced}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/finance/opening-balances")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          const validLines = lines
            .filter((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0))
            .map((l) => ({
              accountCode: l.accountCode,
              debit: Number(l.debit) || 0,
              credit: Number(l.credit) || 0,
            }));
          if (!isBalanced) {
            toast({ variant: "destructive", title: "الأرصدة غير متوازنة" });
            return;
          }
          if (validLines.length < 2) {
            toast({ variant: "destructive", title: "يجب إدخال بندين على الأقل" });
            return;
          }
          createMut.mutate({ periodStart: values.periodStart, lines: validLines, force: values.force });
        }}
      >
        <FormGrid cols={2}>
          <FormDateField name="periodStart" label="تاريخ بداية الفترة" required />
          <FormCheckboxField name="force" label="استبدال أي قيد موجود لنفس الفترة" className="pt-6" />
        </FormGrid>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">بنود الأرصدة الافتتاحية</h3>
              <div className="flex gap-2">
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const periodStart = (document.querySelector('input[name="periodStart"]') as HTMLInputElement)?.value || firstDayOfFiscalYear();
                        const force = (document.querySelector('input[name="force"]') as HTMLInputElement)?.checked || false;
                        handleCsvFile(file, periodStart, force);
                      }
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
                    <Upload className="h-4 w-4 me-1" /> استيراد CSV
                  </Button>
                </label>
                <Button variant="outline" size="sm" type="button" onClick={addLine}>
                  <Plus className="h-4 w-4 me-1" /> إضافة بند
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[2fr_1fr_1fr_40px] gap-2 text-sm font-medium text-muted-foreground">
                <span>الحساب</span>
                <span>مدين</span>
                <span>دائن</span>
                <span></span>
              </div>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-[2fr_1fr_1fr_40px] gap-2">
                  <Select
                    value={line.accountCode || "_none"}
                    onValueChange={(v) => updateLine(idx, "accountCode", v === "_none" ? "" : v)}
                  >
                    <SelectTrigger className="text-sm h-9">
                      <SelectValue placeholder="اختر الحساب" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">اختر الحساب</SelectItem>
                      {accounts.map((a: any) => (
                        <SelectItem key={a.code || a.id} value={String(a.code || a.id)}>
                          {a.code} - {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <NumberField label="مدين" min={0} value={line.debit} onChange={(v) => updateLine(idx, "debit", v)} placeholder="0" />
                  <NumberField label="دائن" min={0} value={line.credit} onChange={(v) => updateLine(idx, "credit", v)} placeholder="0" />
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() => removeLine(idx)}
                    disabled={lines.length <= 2}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}

              <div className="grid grid-cols-[2fr_1fr_1fr_40px] gap-2 pt-2 border-t font-semibold text-sm">
                <span className="flex items-center gap-2">
                  الإجمالي
                  <Badge className={isBalanced ? "bg-status-success-surface text-status-success-foreground" : "bg-status-error-surface text-status-error-foreground"}>
                    {isBalanced ? "متوازن" : "غير متوازن"}
                  </Badge>
                </span>
                <span className="text-status-success-foreground">{formatCurrency(totalDebit)}</span>
                <span className="text-status-error-foreground">{formatCurrency(totalCredit)}</span>
                <span></span>
              </div>

              {!isBalanced && totalDebit > 0 && (
                <p className="text-destructive text-sm">
                  فرق: {formatCurrency(Math.abs(totalDebit - totalCredit))}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </FormShell>
    </CreatePageLayout>
  );
}
