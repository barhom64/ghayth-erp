import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, AutoField, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "support_create";
const INITIAL = { title: "", clientId: "", assigneeId: "", category: "", priority: "medium", status: "open", description: "" };

export default function SupportCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addTicket = useApiMutation("/support/tickets", "POST", [["support-tickets"], ["support-stats"]]);
  const { data: clientsData, isLoading: loadingC, isError: errorC } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const { data: employeesData, isLoading: loadingE, isError: errorE } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const clients = clientsData?.data || [];
  const employees = employeesData?.data || [];
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (loadingC || loadingE) return <LoadingSpinner />;
  if (errorC || errorE) return <ErrorState onRetry={() => window.location.reload()} />;

  const handleSubmit = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.title) localErrors.title = "يرجى إدخال عنوان التذكرة";
    if (!form.description) localErrors.description = "يرجى إدخال وصف المشكلة";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
      return;
    }
    try {
      await addTicket.mutateAsync({
        subject: form.title,
        title: form.title,
        clientId: form.clientId ? Number(form.clientId) : undefined,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : undefined,
        category: form.category || undefined,
        priority: form.priority,
        description: form.description,
      });
      clearDraft();
      toast({ title: "تم إنشاء التذكرة بنجاح" });
      setLocation("/support");
    } catch (err: any) {
      if (err?.field) setFieldErrors((prev) => ({ ...prev, [err.field]: err.message ?? "خطأ" }));
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء التذكرة", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="تذكرة دعم جديدة" backPath="/support">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="المنشئ" value={user?.name || "-"} />
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="عنوان التذكرة"
            required
            value={form.title}
            onChange={(v) => setForm((f) => ({ ...f, title: v }))}
            placeholder="عنوان التذكرة"
            error={fieldErrors.title}
          />
          <FormFieldWrapper label="العميل">
            <Select value={form.clientId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, clientId: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="بدون عميل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">بدون عميل</SelectItem>
                {clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {form.clientId && (
              <div className="mt-3">
                <ClientContextCard clientId={form.clientId} section="ticket" />
              </div>
            )}
          </FormFieldWrapper>
          <FormFieldWrapper label="المسؤول عن التذكرة">
            <Select value={form.assigneeId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, assigneeId: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="— غير محدد —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— غير محدد —</SelectItem>
                {employees.map((emp: any) => (
                  <SelectItem key={emp.id} value={String(emp.id)}>{emp.name} - {emp.jobTitle || emp.department || ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الفئة">
            <Select value={form.category || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, category: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="اختر الفئة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر الفئة</SelectItem>
                <SelectItem value="technical">تقنية</SelectItem>
                <SelectItem value="financial">مالية</SelectItem>
                <SelectItem value="administrative">إدارية</SelectItem>
                <SelectItem value="maintenance">صيانة</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الأولوية">
            <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">منخفضة</SelectItem>
                <SelectItem value="medium">متوسطة</SelectItem>
                <SelectItem value="high">عالية</SelectItem>
                <SelectItem value="urgent">عاجلة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="الحالة">
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">مفتوحة</SelectItem>
                <SelectItem value="in_progress">قيد المعالجة</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>
        <TextAreaField
          label="وصف المشكلة"
          required
          value={form.description}
          onChange={(v) => setForm((f) => ({ ...f, description: v }))}
          placeholder="وصف تفصيلي للمشكلة..."
          rows={4}
          error={fieldErrors.description}
        />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/support")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addTicket.isPending}>{addTicket.isPending ? "جاري الإنشاء..." : "إنشاء"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
