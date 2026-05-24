import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFormContext } from "react-hook-form";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  AutoField,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormEmailField,
  FormPhoneField,
  FormNumberField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { ClientContextCard } from "@/components/shared/client-context-card";

const schema = z.object({
  title: z.string().min(1, "يرجى إدخال عنوان الفرصة"),
  clientId: z.string().optional(),
  stage: z.enum(["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"]),
  assignedTo: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  source: z.string().optional(),
  value: z
    .string()
    .optional()
    .refine((v) => !v || Number(v) >= 0, "القيمة يجب أن تكون 0 أو أكثر"),
  probability: z
    .string()
    .refine(
      (v) => !v || (Number(v) >= 0 && Number(v) <= 100),
      "نسبة الاحتمال يجب أن تكون بين 0 و 100",
    ),
  expectedCloseDate: z.string().optional(),
  nextFollowUp: z.string().optional(),
  notes: z.string().optional(),
});

const STAGE_OPTIONS = [
  { value: "lead", label: "فرصة أولية" },
  { value: "qualified", label: "مؤهلة" },
  { value: "proposal", label: "عرض سعر" },
  { value: "negotiation", label: "تفاوض" },
  { value: "closed_won", label: "مكسوبة" },
  { value: "closed_lost", label: "خاسرة" },
];
const SOURCE_OPTIONS = [
  { value: "website", label: "الموقع" },
  { value: "referral", label: "إحالة" },
  { value: "social_media", label: "وسائل التواصل" },
  { value: "cold_call", label: "اتصال مباشر" },
  { value: "exhibition", label: "معرض" },
  { value: "other", label: "أخرى" },
];

function ClientCard() {
  const { watch } = useFormContext();
  const clientId = watch("clientId") as string;
  if (!clientId) return null;
  return (
    <div className="mt-3">
      <ClientContextCard clientId={clientId} section="opportunity" />
    </div>
  );
}

export default function CrmCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addOpp = useApiMutation(
    "/crm/opportunities",
    "POST",
    [["crm-opportunities"], ["crm-stats"], ["crm-pipeline"]],
  );
  const { data: clientsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  // CRM-003 — /crm/assignees is gated by the CRM feature; GET /employees
  // required hr.employees and 403'd for CRM-only users.
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["crm-assignees"], "/crm/assignees");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const clients = clientsData?.data || [];
  const employees = employeesData?.data || [];
  const clientOptions = clients.map((c: any) => ({ value: String(c.id), label: c.name }));
  const employeeOptions = employees.map((e: any) => ({ value: String(e.id), label: e.name }));

  return (
    <CreatePageLayout title="فرصة تجارية جديدة" backPath="/crm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="المسؤول" value={user?.name || "-"} />
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          title: "",
          clientId: "",
          stage: "lead",
          assignedTo: "",
          contactName: "",
          contactPhone: "",
          contactEmail: "",
          source: "",
          value: "",
          probability: "50",
          expectedCloseDate: "",
          nextFollowUp: "",
          notes: "",
        }}
        submitLabel={addOpp.isPending ? "جاري الإضافة..." : "إضافة"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/crm")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await addOpp.mutateAsync({
            title: values.title,
            clientId: values.clientId ? Number(values.clientId) : null,
            stage: values.stage,
            assignedTo: values.assignedTo ? Number(values.assignedTo) : null,
            contactName: values.contactName || undefined,
            contactPhone: values.contactPhone || undefined,
            contactEmail: values.contactEmail || undefined,
            source: values.source || undefined,
            value: Number(values.value) || 0,
            probability: Number(values.probability) || 50,
            expectedCloseDate: values.expectedCloseDate || undefined,
            nextFollowUp: values.nextFollowUp || undefined,
            notes: values.notes || undefined,
          });
          toast({ title: "تمت إضافة الفرصة بنجاح" });
          setLocation("/crm");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="عنوان الفرصة" required placeholder="عنوان الفرصة" />
          <div>
            <FormSelectField name="clientId" label="العميل" options={clientOptions} placeholder="بدون عميل" />
            <ClientCard />
          </div>
          <FormSelectField name="stage" label="المرحلة" options={STAGE_OPTIONS} />
          <FormSelectField name="assignedTo" label="المسند إليه" options={employeeOptions} placeholder="اختر الموظف" />
          <FormTextField name="contactName" label="جهة الاتصال" placeholder="اسم جهة الاتصال" />
          <FormPhoneField name="contactPhone" label="الهاتف" placeholder="05xxxxxxxx" />
          <FormEmailField name="contactEmail" label="البريد الإلكتروني" placeholder="email@example.com" />
          <FormSelectField name="source" label="المصدر" options={SOURCE_OPTIONS} placeholder="اختر المصدر" />
          <FormNumberField name="value" label={`القيمة المتوقعة (${getCurrencySymbol()})`} placeholder="٠" step="0.01" min="0" />
          <FormNumberField name="probability" label="نسبة الاحتمال (%)" placeholder="50" min="0" max="100" />
          <FormDateField name="expectedCloseDate" label="تاريخ الإغلاق المتوقع" />
          <FormDateField name="nextFollowUp" label="المتابعة القادمة" />
        </FormGrid>
        <FormTextareaField name="notes" label="ملاحظات" placeholder="ملاحظات حول الفرصة..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
