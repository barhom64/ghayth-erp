import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useFormContext } from "react-hook-form";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormSelectField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const schema = z.object({
  subject: z.string().min(1, "يرجى إدخال موضوع الخطاب"),
  channel: z.enum(["email", "sms", "whatsapp", "letter"]),
  fromNumber: z.string().optional(),
  toNumber: z.string().min(1, "يرجى إدخال المستلم"),
  body: z.string().optional(),
  relatedProjectId: z.string().optional(),
});

const CHANNEL_OPTIONS = [
  { value: "email", label: "بريد إلكتروني" },
  { value: "sms", label: "رسالة نصية" },
  { value: "whatsapp", label: "واتساب" },
  { value: "letter", label: "خطاب رسمي" },
];

function RecipientPickers({
  clients,
  employees,
}: {
  clients: any[];
  employees: any[];
}) {
  const { setValue } = useFormContext();
  return (
    <>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">اختر مستلم من العملاء</label>
        <Select
          value="_none"
          onValueChange={(v) => {
            if (v === "_none") return;
            const client = clients.find((c: any) => String(c.id) === v);
            if (client) setValue("toNumber", client.phone || client.email || "");
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">— اختر عميل —</SelectItem>
            {clients.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name} {c.phone ? `- ${c.phone}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">أو اختر موظف</label>
        <Select
          value="_none"
          onValueChange={(v) => {
            if (v === "_none") return;
            const emp = employees.find((e: any) => String(e.id) === v);
            if (emp) setValue("toNumber", emp.phone || emp.email || "");
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">— اختر موظف —</SelectItem>
            {employees.map((emp: any) => (
              <SelectItem key={emp.id} value={String(emp.id)}>
                {emp.name} {emp.phone ? `- ${emp.phone}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

export default function LettersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // COM-003 — official letters are correspondence records, not dispatchable
  // messages. POST /communications/send rejects channel "letter"; the letter
  // is created in the correspondence module instead.
  const createMut = useApiMutation<unknown, Record<string, any>>(
    "/correspondence",
    "POST",
    [["correspondence"]],
  );
  const { data: clientsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const { data: projectsData } = useApiQuery<{ data: any[] }>(["projects-list"], "/projects");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const clients = clientsData?.data || [];
  const employees = employeesData?.data || [];
  const projects = projectsData?.data || [];

  const projectOptions = projects.map((p: any) => ({
    value: String(p.id),
    label: p.name,
  }));

  return (
    <CreatePageLayout title="خطاب جديد" backPath="/correspondence">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          subject: "",
          channel: "letter",
          fromNumber: "",
          toNumber: "",
          body: "",
          relatedProjectId: "",
        }}
        submitLabel={createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/correspondence")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            direction: "outgoing",
            subject: values.subject,
            channel: values.channel,
            content: values.body || undefined,
            senderName: values.fromNumber || undefined,
            recipientName: values.toNumber,
            ...(values.relatedProjectId
              ? { entityType: "project", entityId: Number(values.relatedProjectId) }
              : {}),
            ...(attachments.length > 0 ? { attachments } : {}),
          });
          toast({ title: "تم إنشاء الخطاب بنجاح" });
          setLocation("/correspondence");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="subject" label="الموضوع" required placeholder="موضوع الخطاب" />
          <FormSelectField name="channel" label="القناة" options={CHANNEL_OPTIONS} />
          <RecipientPickers clients={clients} employees={employees} />
          <FormTextField name="fromNumber" label="من" placeholder="رقم أو بريد المرسل" />
          <FormTextField name="toNumber" label="إلى" required placeholder="رقم أو بريد المستلم" />
          <FormSelectField
            name="relatedProjectId"
            label="ربط بمشروع (اختياري)"
            options={projectOptions}
            placeholder="— بدون ربط —"
          />
        </FormGrid>
        <FormTextareaField name="body" label="المحتوى" placeholder="نص الخطاب..." rows={5} />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
