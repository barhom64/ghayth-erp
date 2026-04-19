import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Upload } from "lucide-react";
import { formatCurrency, roundMoney } from "@/lib/formatters";
import { FormFieldWrapper } from "@/components/shared/form-field-wrapper";

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

export default function OpeningBalancesCreatePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: accountsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const accounts = accountsData?.data || [];

  const [periodStart, setPeriodStart] = useState<string>(firstDayOfFiscalYear());
  const [lines, setLines] = useState<OBLine[]>([emptyLine(), emptyLine()]);
  const [force, setForce] = useState(false);

  const totalDebit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.debit), 0));
  const totalCredit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.credit), 0));
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  const createMut = useApiMutation<unknown, any>(
    "/finance/opening-balances",
    "POST",
    [["opening-balances"]],
    {
      successMessage: "تم حفظ الأرصدة الافتتاحية",
      onSuccess: () => setLocation("/finance/opening-balances"),
    },
  );

  const importCsvMut = useApiMutation<unknown, any>(
    "/finance/opening-balances/import-csv",
    "POST",
    [["opening-balances"]],
    {
      successMessage: "تم استيراد الأرصدة الافتتاحية من ملف CSV",
      onSuccess: () => setLocation("/finance/opening-balances"),
    },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

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
    if (!periodStart) {
      toast({ variant: "destructive", title: "حدد تاريخ بداية الفترة" });
      return;
    }
    if (!isBalanced) {
      toast({ variant: "destructive", title: "الأرصدة غير متوازنة" });
      return;
    }
    const validLines = lines
      .filter((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l) => ({
        accountCode: l.accountCode,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }));
    if (validLines.length < 2) {
      toast({ variant: "destructive", title: "يجب إدخال بندين على الأقل" });
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
            <div className="flex gap-2">
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
              <Button variant="outline" size="sm" type="button" onClick={addLine}>
                <Plus className="h-4 w-4 me-1" />
                إضافة بند
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
                <Input
                  type="number"
                  min="0"
                  value={line.debit}
                  onChange={(e) => updateLine(idx, "debit", e.target.value)}
                  placeholder="0"
                />
                <Input
                  type="number"
                  min="0"
                  value={line.credit}
                  onChange={(e) => updateLine(idx, "credit", e.target.value)}
                  placeholder="0"
                />
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
                <Badge className={isBalanced ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                  {isBalanced ? "متوازن" : "غير متوازن"}
                </Badge>
              </span>
              <span className="text-green-700">{formatCurrency(totalDebit)}</span>
              <span className="text-red-700">{formatCurrency(totalCredit)}</span>
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

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/opening-balances")}>
          إلغاء
        </Button>
        <Button onClick={handleSubmit} disabled={!isBalanced || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
