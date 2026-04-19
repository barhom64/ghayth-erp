import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

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

  const { data: accountsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const accounts = accountsData?.data || [];

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [templateRef, setTemplateRef] = useState("");
  const [active, setActive] = useState(true);
  const [lines, setLines] = useState<TemplateLine[]>([emptyLine(), emptyLine()]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  const createMut = useApiMutation<unknown, any>(
    "/finance/recurring-journals",
    "POST",
    [["recurring-journals"]],
    {
      successMessage: "تم إنشاء القيد الدوري",
      onSuccess: () => setLocation("/finance/recurring-journals"),
    },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

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
    if (!name.trim()) {
      toast({ variant: "destructive", title: "اسم القيد الدوري مطلوب" });
      return;
    }
    if (!isBalanced) {
      toast({ variant: "destructive", title: "القالب غير متوازن" });
      return;
    }
    const validLines = lines
      .filter((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l) => ({
        accountCode: l.accountCode,
        description: l.description || null,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }));
    if (validLines.length < 2) {
      toast({ variant: "destructive", title: "يجب إدخال بندين على الأقل" });
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
      <CreationDateField />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <TextField label="اسم القيد" required value={name} onChange={setName} placeholder="مثال: إهلاك شهري للسيارات" className="md:col-span-2" />
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">قالب بنود القيد</h3>
            <Button variant="outline" size="sm" type="button" onClick={addLine}>
              <Plus className="h-4 w-4 me-1" />
              إضافة بند
            </Button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_40px] gap-2 text-sm font-medium text-muted-foreground">
              <span>الحساب</span>
              <span>البيان</span>
              <span>مدين</span>
              <span>دائن</span>
              <span></span>
            </div>
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1.5fr_1fr_1fr_40px] gap-2">
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
                <Input value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} placeholder="البيان" />
                <Input type="number" min="0" value={line.debit} onChange={(e) => updateLine(idx, "debit", e.target.value)} placeholder="0" />
                <Input type="number" min="0" value={line.credit} onChange={(e) => updateLine(idx, "credit", e.target.value)} placeholder="0" />
                <Button variant="ghost" size="icon" type="button" onClick={() => removeLine(idx)} disabled={lines.length <= 2}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_40px] gap-2 pt-2 border-t font-semibold text-sm">
              <span></span>
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
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/recurring-journals")}>
          إلغاء
        </Button>
        <Button onClick={handleSubmit} disabled={!isBalanced || !name || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
