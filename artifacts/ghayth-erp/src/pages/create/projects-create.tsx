import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { DatePicker } from "@/components/ui/date-picker";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { ManagerWorkloadCard } from "@/components/shared/manager-workload-card";
import { TextField, TextAreaField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { ImpactPreviewButton } from "@/components/shared/impact-preview";
import { ClientSelect, EmployeeSelect } from "@/components/shared/entity-selects";

const DRAFT_KEY = "projects_create";
const INITIAL = { name: "", clientId: "", managerId: "", status: "planning", budget: "", startDate: "", endDate: "", description: "" };

export default function ProjectsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addProject = useApiMutation("/projects", "POST", [["projects"], ["projects-stats"]]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const firstError = validate({
      name: form.name ? null : "يرجى إدخال اسم المشروع",
      startDate: form.startDate ? null : "تاريخ البدء مطلوب",
      endDate: !form.endDate
        ? "تاريخ الانتهاء مطلوب"
        : form.startDate && form.endDate <= form.startDate
          ? "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء"
          : null,
      budget: form.budget && Number(form.budget) < 0 ? "الميزانية يجب أن تكون صفر أو أكثر" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
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
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء المشروع", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="مشروع جديد" backPath="/projects">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
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
          <div>
            <ClientSelect value={form.clientId} onChange={(v) => setForm((f) => ({ ...f, clientId: v }))} label="العميل" />
            {form.clientId && (
              <div className="mt-3">
                <ClientContextCard clientId={form.clientId} section="project" />
              </div>
            )}
          </div>
          <div>
            <EmployeeSelect value={form.managerId} onChange={(v) => setForm((f) => ({ ...f, managerId: v }))} label="مدير المشروع" />
            {form.managerId && (
              <div className="mt-3">
                <ManagerWorkloadCard employeeId={form.managerId} />
              </div>
            )}
          </div>
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

        {form.name && form.startDate && form.endDate && (
          <ImpactPreviewButton
            endpoint="/projects/impact-preview"
            payload={{
              managerId: form.managerId ? Number(form.managerId) : undefined,
              budget: form.budget ? Number(form.budget) : undefined,
              startDate: form.startDate,
              endDate: form.endDate,
              type: form.status,
            }}
            label="معاينة أثر المشروع"
          />
        )}

        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => setLocation("/projects")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={addProject.isPending} rateLimitAware>{addProject.isPending ? "جاري الإنشاء..." : "إنشاء"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
