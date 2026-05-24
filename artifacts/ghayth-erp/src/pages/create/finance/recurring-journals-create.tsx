import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormSelectField,
  FormDateField,
  FormCheckboxField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency, roundMoney, todayLocal } from "@/lib/formatters";
import { NumberField } from "@/components/shared/form-field-wrapper";

interface TemplateLine {
  accountCode: string;
  description: string;
  debit: string;
  credit: string;
}

const emptyLine = (): TemplateLine => ({ accountCode: "", description: "", debit: "", credit: "" });

const schema = z.object({
  name: z.string().min(1, "اسم القيد الدوري مطلوب"),
  description: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]),
  startDate: z.string(),
  templateRef: z.string().optional(),
  active: z.boolean(),
});

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "يومي" },
  { value: "weekly", label: "أسبوعي" },
  { value: "monthly", label: "شهري" },
  { value: "quarterly", label: "ربع سنوي" },
  { value: "yearly", label: "سنوي" },
];

export default function RecurringJournalsCreatePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [lines, setLines] = useState<TemplateLine[]>([emptyLine(), emptyLine()]);

  const { data: accountsData, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["accounts-list"],
    "/finance/accounts",
  );

  const createMut = useApiMutation<unknown, any>(
    "/finance/recurring-journals",
    "POST",
    [["recurring-journals"]],
    {
      successMessage: "تم إنشاء القيد الدوري",
      onSuccess: () => { setLocation("/finance/recurring-journals"); },
    },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const accounts = accountsData?.data || [];

  const totalDebit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.debit), 0));
  const totalCredit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.credit), 0));
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

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

  return (
    <CreatePageLayout title="قيد دوري جديد" backPath="/finance/recurring-journals">
      <CreationDateField />
      <FormShell
        schema={schema}
        defaultValues={{
          name: "",
          description: "",
          frequency: "monthly",
          startDate: todayLocal(),
          templateRef: "",
          active: true,
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        disabled={!isBalanced}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/finance/recurring-journals")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          const validLines = lines
            .filter((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0))
            .map((l) => ({
              accountCode: l.accountCode,
              description: l.description || null,
              debit: Number(l.debit) || 0,
              credit: Number(l.credit) || 0,
            }));
          if (!isBalanced) {
            toast({ variant: "destructive", title: "القالب غير متوازن" });
            return;
          }
          if (validLines.length < 2) {
            toast({ variant: "destructive", title: "يجب إدخال بندين على الأقل" });
            return;
          }
          createMut.mutate({
            name: values.name,
            description: values.description,
            frequency: values.frequency,
            startDate: values.startDate,
            active: values.active,
            templateRef: values.templateRef || null,
            templateDescription: values.description || null,
            templateLines: validLines,
          });
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم القيد" required placeholder="مثال: إهلاك شهري للسيارات" className="md:col-span-2" />
          <FormSelectField name="frequency" label="التكرار" required options={FREQUENCY_OPTIONS} />
          <FormDateField name="startDate" label="تاريخ البدء" required />
          <FormTextField name="description" label="الوصف" className="md:col-span-2" />
          <FormTextField name="templateRef" label="رمز المرجع للقيود المولدة" placeholder="مثال: REC-DEP" />
          <FormCheckboxField
            name="active"
            label="نشط — يُنفَّذ تلقائياً عند حلول موعد الاستحقاق"
            className="pt-6"
          />
        </FormGrid>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">قالب بنود القيد</h3>
              <Button variant="outline" size="sm" type="button" onClick={addLine}>
                <Plus className="h-4 w-4 me-1" /> إضافة بند
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
                  <NumberField label="مدين" min={0} value={line.debit} onChange={(v) => updateLine(idx, "debit", v)} placeholder="0" />
                  <NumberField label="دائن" min={0} value={line.credit} onChange={(v) => updateLine(idx, "credit", v)} placeholder="0" />
                  <Button variant="ghost" size="icon" type="button" onClick={() => removeLine(idx)} disabled={lines.length <= 2}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_40px] gap-2 pt-2 border-t font-semibold text-sm">
                <span></span>
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
            </div>
          </CardContent>
        </Card>
      </FormShell>
    </CreatePageLayout>
  );
}
