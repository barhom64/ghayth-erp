import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Autocomplete } from "@/components/ui/autocomplete";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { DatePicker } from "@/components/ui/date-picker";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const DRAFT_KEY = "projects_create";
const INITIAL = { name: "", clientId: "", managerId: "", status: "planning", budget: "", startDate: "", endDate: "", description: "" };

export default function ProjectsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addProject = useApiMutation("/projects", "POST", [["projects"], ["projects-stats"]]);
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
    if (!form.name) localErrors.name = "يرجى إدخال اسم المشروع";
    if (!form.startDate) localErrors.startDate = "تاريخ البدء مطلوب";
    if (!form.endDate) localErrors.endDate = "تاريخ الانتهاء مطلوب";
    if (form.budget && Number(form.budget) < 0) localErrors.budget = "الميزانية يجب أن تكون صفر أو أكثر";
    if (form.startDate && form.endDate && form.endDate <= form.startDate) localErrors.endDate = "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
      return;
    }
    try {
      await addProject.mutateAsync({
        name: form.name,
        clientId: form.clientId ? Number(form.clientId) : null,
        managerId: form.managerId ? Number(form.managerId) : null,
        status: form.status,
        budget: Number(form.budget) || 0,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        description: form.description || undefined,
      });
      clearDraft();
      toast({ title: "تم إنشاء المشروع بنجاح" });
      setLocation("/projects");
    } catch (err: any) {
      if (err?.field) setFieldErrors((prev) => ({ ...prev, [err.field]: err.message ?? "خطأ" }));
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء المشروع", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="مشروع جديد" backPath="/projects">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="اسم المشروع"
            required
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="اسم المشروع"
            error={fieldErrors.name}
          />
          <FormFieldWrapper label="العميل">
            <Autocomplete
              value={form.clientId}
              onChange={(v) => setForm((f) => ({ ...f, clientId: String(v) }))}
              options={clients.map((c: any) => ({ value: String(c.id), label: c.name }))}
              placeholder="ابحث عن عميل..."
              emptyMessage="لا يوجد عملاء"
            />
            {form.clientId && (
              <div className="mt-3">
                <ClientContextCard clientId={form.clientId} section="project" />
              </div>
            )}
          </FormFieldWrapper>
          <FormFieldWrapper label="مدير المشروع">
            <Autocomplete
              value={form.managerId}
              onChange={(v) => setForm((f) => ({ ...f, managerId: String(v) }))}
              options={employees.map((e: any) => ({ value: String(e.id), label: e.name }))}
              placeholder="ابحث عن مدير..."
              emptyMessage="لا يوجد موظفين"
            />
          </FormFieldWrapper>
          <FormFieldWrapper label="الحالة">
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">تخطيط</SelectItem>
                <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                <SelectItem value="on_hold">متوقف</SelectItem>
                <SelectItem value="completed">مكتمل</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <NumberField label={`الميزانية (${getCurrencySymbol()})`} value={form.budget} onChange={(v) => setForm((f) => ({ ...f, budget: v }))} placeholder="٠" step={0.01} min={0} error={fieldErrors.budget} />
          <FormFieldWrapper label="تاريخ البدء" required error={fieldErrors.startDate}>
            <DatePicker value={form.startDate} onChange={(v) => setForm((f) => ({ ...f, startDate: v }))} />
          </FormFieldWrapper>
          <FormFieldWrapper label="تاريخ الانتهاء" required error={fieldErrors.endDate}>
            <DatePicker value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} />
          </FormFieldWrapper>
        </div>
        <TextAreaField label="الوصف" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="وصف المشروع وأهدافه..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/projects")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addProject.isPending}>{addProject.isPending ? "جاري الإنشاء..." : "إنشاء"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
