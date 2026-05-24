import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
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

// Inline picker that updates the `toNumber` field via setValue when a
// quick-pick employee / client is selected.
function QuickPicker({
  label,
  options,
  onPick,
}: {
  label: string;
  options: { value: string; label: string; pick: string }[];
  onPick: (val: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <select
        className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        onChange={(e) => {
          const item = options.find((o) => o.value === e.target.value);
          if (item) onPick(item.pick);
          e.currentTarget.value = "";
        }}
      >
        <option value="">— اختر —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ClientEmployeePickers({
  clients,
  employees,
}: {
  clients: any[];
  employees: any[];
}) {
  const { setValue } = useFormContext();
  return (
    <>
      <QuickPicker
        label="اختر مستلم من العملاء"
        options={clients.map((c: any) => ({
          value: String(c.id),
          label: `${c.name}${c.phone ? ` - ${c.phone}` : ""}`,
          pick: c.phone || c.email || "",
        }))}
        onPick={(v) => setValue("toNumber", v)}
      />
      <QuickPicker
        label="أو اختر موظف"
        options={employees.map((emp: any) => ({
          value: String(emp.id),
          label: `${emp.name}${emp.phone ? ` - ${emp.phone}` : ""}`,
          pick: emp.phone || emp.email || "",
        }))}
        onPick={(v) => setValue("toNumber", v)}
      />
    </>
  );
}

export default function LettersCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const createMut = useApiMutation<unknown, Record<string, any>>(
    "/correspondence",
    "POST",
    [["correspondence"]],
  );
  const { data: clientsData, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["clients-list"],
    "/clients",
  );
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const { data: projectsData } = useApiQuery<{ data: any[] }>(["projects-list"], "/projects");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const clients = clientsData?.data || [];
  const employees = employeesData?.data || [];
  const projects = projectsData?.data || [];

  const projectOptions = projects.map((p: any) => ({ value: String(p.id), label: p.name }));

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
          <ClientEmployeePickers clients={clients} employees={employees} />
          <FormTextField name="fromNumber" label="من" placeholder="رقم أو بريد المرسل" />
          <FormTextField name="toNumber" label="إلى" required placeholder="رقم أو بريد المستلم" />
          <FormSelectField
            name="relatedProjectId"
            label="ربط بمشروع (اختياري)"
            placeholder="— بدون ربط —"
            options={projectOptions}
          />
        </FormGrid>
        <FormTextareaField name="body" label="المحتوى" placeholder="نص الخطاب..." rows={5} />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
