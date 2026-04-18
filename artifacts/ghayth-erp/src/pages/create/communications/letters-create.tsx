import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

export default function LettersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("letters_create", {
    subject: "", channel: "email", fromNumber: "", toNumber: "", body: "",
  });
  const createMut = useApiMutation<unknown, Record<string, string | undefined>>("/communications/send", "POST", [["comm-letters"]]);
  const { data: clientsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const clients = clientsData?.data || [];
  const employees = employeesData?.data || [];

  const handleSubmit = () => {
    if (!form.subject) {
      toast({ variant: "destructive", title: "يرجى إدخال موضوع الخطاب" });
      return;
    }
    createMut.mutate({
      subject: form.subject,
      channel: form.channel,
      fromNumber: form.fromNumber || undefined,
      toNumber: form.toNumber,
      body: form.body || undefined,
    }, {
      onSuccess: () => { clearDraft(); toast({ title: "تم إنشاء الخطاب بنجاح" }); setLocation("/letters"); },
      onError: (err) => toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء الخطاب", description: err.message }),
    });
  };

  return (
    <CreatePageLayout title="خطاب جديد" backPath="/letters">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <button onClick={clearDraft} className="underline text-amber-600 hover:text-amber-800">تجاهل</button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>الموضوع <span className="text-red-500">*</span></Label><Input className="mt-1" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="موضوع الخطاب" /></div>
          <div>
            <Label>القناة</Label>
            <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">بريد إلكتروني</SelectItem>
                <SelectItem value="sms">رسالة نصية</SelectItem>
                <SelectItem value="whatsapp">واتساب</SelectItem>
                <SelectItem value="letter">خطاب رسمي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>اختر مستلم من العملاء</Label>
            <Select value="_none" onValueChange={(v) => {
              if (v === "_none") return;
              const client = clients.find((c: any) => String(c.id) === v);
              if (client) setForm((f) => ({ ...f, toNumber: client.phone || client.email || "" }));
            }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— اختر عميل —</SelectItem>
                {clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.phone ? `- ${c.phone}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>أو اختر موظف</Label>
            <Select value="_none" onValueChange={(v) => {
              if (v === "_none") return;
              const emp = employees.find((emp: any) => String(emp.id) === v);
              if (emp) setForm((f) => ({ ...f, toNumber: emp.phone || emp.email || "" }));
            }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— اختر موظف —</SelectItem>
                {employees.map((emp: any) => <SelectItem key={emp.id} value={String(emp.id)}>{emp.name} {emp.phone ? `- ${emp.phone}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>من</Label><Input className="mt-1" value={form.fromNumber} onChange={(e) => setForm((f) => ({ ...f, fromNumber: e.target.value }))} placeholder="رقم أو بريد المرسل" /></div>
          <div><Label>إلى <span className="text-red-500">*</span></Label><Input className="mt-1" value={form.toNumber} onChange={(e) => setForm((f) => ({ ...f, toNumber: e.target.value }))} placeholder="رقم أو بريد المستلم" /></div>
        </div>
        <div><Label>المحتوى</Label><Textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="نص الخطاب..." className="min-h-[120px]" /></div>
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/letters")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>{createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}</Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
