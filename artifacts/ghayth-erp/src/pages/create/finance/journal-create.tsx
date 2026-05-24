import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Autocomplete } from "@/components/ui/autocomplete";
import {
  CreatePageLayout,
  AutoField,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { NumberField } from "@/components/shared/form-field-wrapper";
import { roundMoney, formatCurrency, todayLocal } from "@/lib/formatters";

interface JournalLine {
  accountCode: string;
  description: string;
  debit: string;
  credit: string;
  costCenter?: string;
  departmentId?: string;
  projectId?: string;
}

const schema = z.object({
  description: z.string(),
  date: z.string(),
});

export default function JournalCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/journal", "POST", [["journal"]]);
  const { data: accountsData, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["accounts-posting"],
    "/finance/accounts?postingOnly=true",
  );
  const { data: departmentsData } = useApiQuery<{ data: any[] }>(
    ["departments-list"],
    "/settings/departments",
  );
  const { data: projectsData } = useApiQuery<{ data: any[] }>(["projects-list"], "/projects");

  const autoNumberRef = useRef(`JE-${Date.now().toString(36).toUpperCase()}`);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [lines, setLines] = useState<JournalLine[]>([
    { accountCode: "", description: "", debit: "", credit: "", costCenter: "", departmentId: "", projectId: "" },
    { accountCode: "", description: "", debit: "", credit: "", costCenter: "", departmentId: "", projectId: "" },
  ]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const accounts = accountsData?.data || [];
  const departments = departmentsData?.data || [];
  const projects = projectsData?.data || [];

  const updateLine = (idx: number, field: keyof JournalLine, value: string) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], [field]: value };
    setLines(updated);
  };

  const addLine = () => setLines([...lines, { accountCode: "", description: "", debit: "", credit: "", costCenter: "", departmentId: "", projectId: "" }]);
  const removeLine = (idx: number) => { if (lines.length > 2) setLines(lines.filter((_, i) => i !== idx)); };

  const totalDebit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.debit), 0));
  const totalCredit = roundMoney(lines.reduce((s, l) => s + roundMoney(l.credit), 0));
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <CreatePageLayout title="قيد يومية جديد" backPath="/finance/journal">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="رقم القيد" value={autoNumberRef.current} />
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{ description: "", date: todayLocal() }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        disabled={!isBalanced}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/finance/journal")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          const validLines = lines.filter((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0));
          if (!isBalanced) {
            toast({ variant: "destructive", title: "القيد غير متوازن - يجب أن يتساوى المدين والدائن" });
            return;
          }
          if (validLines.length < 2) {
            toast({ variant: "destructive", title: "يجب إدخال بندين على الأقل" });
            return;
          }
          await createMut.mutateAsync({
            ref: autoNumberRef.current,
            description: values.description,
            lines: validLines.map((l) => ({
              accountCode: l.accountCode,
              description: l.description,
              debit: Number(l.debit) || 0,
              credit: Number(l.credit) || 0,
              costCenter: l.costCenter || undefined,
              departmentId: l.departmentId ? Number(l.departmentId) : undefined,
              projectId: l.projectId ? Number(l.projectId) : undefined,
            })),
          });
          toast({ title: "تم إضافة القيد بنجاح" });
          setLocation("/finance/journal");
        }}
      >
        <FormGrid cols={1}>
          <FormTextField name="description" label="الوصف" />
        </FormGrid>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">بنود القيد</h3>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 me-1" />إضافة بند
              </Button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_40px] gap-2 text-sm font-medium text-muted-foreground">
                <span>الحساب</span><span>البيان</span><span>مدين</span><span>دائن</span><span></span>
              </div>
              {lines.map((line, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_40px] gap-2">
                    <Autocomplete
                      value={line.accountCode}
                      onChange={(v) => updateLine(idx, "accountCode", String(v))}
                      options={accounts.map((a: any) => ({ value: String(a.code || a.id), label: `${a.code} - ${a.name}` }))}
                      placeholder="ابحث عن حساب..."
                      emptyMessage="لا يوجد حسابات"
                    />
                    <Input value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} placeholder="وصف البند" />
                    <NumberField label="مدين" value={line.debit} onChange={(v) => updateLine(idx, "debit", v)} placeholder="0" />
                    <NumberField label="دائن" value={line.credit} onChange={(v) => updateLine(idx, "credit", v)} placeholder="0" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(idx)} disabled={lines.length <= 2}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 ps-1">
                    <Input
                      className="h-8 text-xs"
                      value={line.costCenter || ""}
                      onChange={(e) => updateLine(idx, "costCenter", e.target.value)}
                      placeholder="مركز التكلفة (اختياري)"
                    />
                    <Select value={line.departmentId || "_none"} onValueChange={(v) => updateLine(idx, "departmentId", v === "_none" ? "" : v)}>
                      <SelectTrigger className="text-xs h-8"><SelectValue placeholder="القسم (اختياري)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">بدون قسم</SelectItem>
                        {departments.map((d: any) => (
                          <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={line.projectId || "_none"} onValueChange={(v) => updateLine(idx, "projectId", v === "_none" ? "" : v)}>
                      <SelectTrigger className="text-xs h-8"><SelectValue placeholder="المشروع (اختياري)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">بدون مشروع</SelectItem>
                        {projects.map((p: any) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name || p.title || `مشروع #${p.id}`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_40px] gap-2 pt-2 border-t font-semibold text-sm">
                <span></span>
                <span>الإجمالي</span>
                <span>{formatCurrency(totalDebit)}</span>
                <span>{formatCurrency(totalCredit)}</span>
                <span></span>
              </div>
              {!isBalanced && totalDebit > 0 && (
                <p className="text-destructive text-sm">القيد غير متوازن — المدين يجب أن يساوي الدائن</p>
              )}
            </div>
          </CardContent>
        </Card>

        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
