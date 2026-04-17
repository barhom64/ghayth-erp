import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Autocomplete } from "@/components/ui/autocomplete";
import { CreatePageLayout, AutoField, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

interface JournalLine {
  accountCode: string;
  description: string;
  debit: string;
  credit: string;
  costCenter?: string;
  departmentId?: string;
  projectId?: string;
}

const DRAFT_KEY = "finance_journal_create";
const INITIAL = { description: "", date: new Date().toISOString().split("T")[0] };

export default function JournalCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/journal", "POST", [["journal"]]);
  const { data: accountsData } = useApiQuery<{ data: any[] }>(["accounts-posting"], "/finance/accounts?postingOnly=true");
  const accounts = accountsData?.data || [];
  const { data: departmentsData } = useApiQuery<{ data: any[] }>(["departments-list"], "/settings/departments");
  const departments = departmentsData?.data || [];
  const { data: projectsData } = useApiQuery<{ data: any[] }>(["projects-list"], "/projects");
  const projects = projectsData?.data || [];

  const autoNumberRef = useRef(`JE-${Date.now().toString(36).toUpperCase()}`);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [lines, setLines] = useState<JournalLine[]>([
    { accountCode: "", description: "", debit: "", credit: "", costCenter: "", departmentId: "", projectId: "" },
    { accountCode: "", description: "", debit: "", credit: "", costCenter: "", departmentId: "", projectId: "" },
  ]);

  const updateLine = (idx: number, field: keyof JournalLine, value: string) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], [field]: value };
    setLines(updated);
  };

  const addLine = () => setLines([...lines, { accountCode: "", description: "", debit: "", credit: "", costCenter: "", departmentId: "", projectId: "" }]);
  const removeLine = (idx: number) => { if (lines.length > 2) setLines(lines.filter((_, i) => i !== idx)); };

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  const handleSubmit = async () => {
    if (!isBalanced) {
      toast({ variant: "destructive", title: "القيد غير متوازن - يجب أن يتساوى المدين والدائن" });
      return;
    }
    const validLines = lines.filter((l) => l.accountCode && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) {
      toast({ variant: "destructive", title: "يجب إدخال بندين على الأقل" });
      return;
    }
    try {
      await createMut.mutateAsync({
        ref: autoNumberRef.current,
        description: form.description,
        lines: validLines.map(l => ({
          accountCode: l.accountCode,
          description: l.description,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          costCenter: l.costCenter || undefined,
          departmentId: l.departmentId ? Number(l.departmentId) : undefined,
          projectId: l.projectId ? Number(l.projectId) : undefined,
        })),
      });
      clearDraft();
      toast({ title: "تم إضافة القيد بنجاح" });
      setLocation("/finance/journal");
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة القيد" });
    }
  };

  return (
    <CreatePageLayout title="قيد يومية جديد" backPath="/finance/journal">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="رقم القيد" value={autoNumberRef.current} />
        <CreationDateField />
        <div className="md:col-span-2"><Label>الوصف</Label><Input className="mt-1" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">بنود القيد</h3>
            <Button variant="outline" size="sm" onClick={addLine}><Plus className="h-4 w-4 me-1" />إضافة بند</Button>
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
                  <Input type="number" value={line.debit} onChange={(e) => updateLine(idx, "debit", e.target.value)} placeholder="0" />
                  <Input type="number" value={line.credit} onChange={(e) => updateLine(idx, "credit", e.target.value)} placeholder="0" />
                  <Button variant="ghost" size="icon" onClick={() => removeLine(idx)} disabled={lines.length <= 2}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
              <span>{totalDebit.toLocaleString("ar-SA")}</span>
              <span>{totalCredit.toLocaleString("ar-SA")}</span>
              <span></span>
            </div>
            {!isBalanced && totalDebit > 0 && (
              <p className="text-destructive text-sm">القيد غير متوازن — المدين يجب أن يساوي الدائن</p>
            )}
          </div>
        </CardContent>
      </Card>

      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/journal")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!isBalanced || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
