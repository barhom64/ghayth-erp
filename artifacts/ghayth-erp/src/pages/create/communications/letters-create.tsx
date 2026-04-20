import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { TextField, TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function LettersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("letters_create", {
    subject: "", channel: "email", fromNumber: "", toNumber: "", body: "", relatedProjectId: "",
  });
  const createMut = useApiMutation<unknown, Record<string, any>>("/communications/send", "POST", [["comm-letters"]]);
  const { data: clientsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const { data: projectsData } = useApiQuery<{ data: any[] }>(["projects-list"], "/projects");
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const clients = clientsData?.data || [];
  const employees = employeesData?.data || [];
  const projects = projectsData?.data || [];

  const handleSubmit = () => {
    const firstError = validate({
      subject: form.subject ? null : "يرجى إدخال موضوع الخطاب",
      toNumber: form.toNumber ? null : "يرجى إدخال المستلم",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate({
      subject: form.subject,
      channel: form.channel,
      fromNumber: form.fromNumber || undefined,
      toNumber: form.toNumber,
      body: form.body || undefined,
      ...(form.relatedProjectId ? { relatedType: "project", relatedId: Number(form.relatedProjectId) } : {}),
    }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إنشاء الخطاب بنجاح" }); setLocation("/letters"); },
      onError: (err: any) => {
        setApiError(err);
        toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الخطاب", description: err?.fix ?? err?.message });
      },
    });
  };

  return (
    <CreatePageLayout title="خطاب جديد" backPath="/letters">
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
          <TextField label="الموضوع" required value={form.subject} onChange={(v) => setForm((f) => ({ ...f, subject: v }))} placeholder="موضوع الخطاب" error={fieldErrors.subject} />
          <FormFieldWrapper label="القناة">
            <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">بريد إلكتروني</SelectItem>
                <SelectItem value="sms">رسالة نصية</SelectItem>
                <SelectItem value="whatsapp">واتساب</SelectItem>
                <SelectItem value="letter">خطاب رسمي</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="اختر مستلم من العملاء">
            <Select value="_none" onValueChange={(v) => {
              if (v === "_none") return;
              const client = clients.find((c: any) => String(c.id) === v);
              if (client) setForm((f) => ({ ...f, toNumber: client.phone || client.email || "" }));
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— اختر عميل —</SelectItem>
                {clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.phone ? `- ${c.phone}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="أو اختر موظف">
            <Select value="_none" onValueChange={(v) => {
              if (v === "_none") return;
              const emp = employees.find((emp: any) => String(emp.id) === v);
              if (emp) setForm((f) => ({ ...f, toNumber: emp.phone || emp.email || "" }));
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— اختر موظف —</SelectItem>
                {employees.map((emp: any) => <SelectItem key={emp.id} value={String(emp.id)}>{emp.name} {emp.phone ? `- ${emp.phone}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <TextField label="من" value={form.fromNumber} onChange={(v) => setForm((f) => ({ ...f, fromNumber: v }))} placeholder="رقم أو بريد المرسل" />
          <TextField label="إلى" required value={form.toNumber} onChange={(v) => setForm((f) => ({ ...f, toNumber: v }))} placeholder="رقم أو بريد المستلم" error={fieldErrors.toNumber} />
          <FormFieldWrapper label="ربط بمشروع (اختياري)">
            <Select value={form.relatedProjectId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, relatedProjectId: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— بدون ربط —</SelectItem>
                {projects.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        </div>
        <TextAreaField label="المحتوى" value={form.body} onChange={(v) => setForm((f) => ({ ...f, body: v }))} placeholder="نص الخطاب..." rows={5} />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/letters")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
