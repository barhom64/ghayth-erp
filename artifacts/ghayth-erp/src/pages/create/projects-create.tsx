import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { ManagerWorkloadCard } from "@/components/shared/manager-workload-card";
import { ImpactPreviewButton } from "@/components/shared/impact-preview";
import { ClientSelect, EmployeeSelect } from "@/components/shared/entity-selects";

const schema = z
  .object({
    name: z.string().min(1, "يرجى إدخال اسم المشروع"),
    clientId: z.string().optional(),
    managerId: z.string().optional(),
    status: z.enum(["planning", "in_progress", "on_hold", "completed"]),
    budget: z
      .string()
      .optional()
      .refine((v) => !v || Number(v) >= 0, "الميزانية يجب أن تكون صفر أو أكثر"),
    startDate: z.string().min(1, "تاريخ البدء مطلوب"),
    endDate: z.string().min(1, "تاريخ الانتهاء مطلوب"),
    description: z.string().optional(),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate > v.startDate,
    { message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء", path: ["endDate"] },
  );

const STATUS_OPTIONS = [
  { value: "planning", label: "تخطيط" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "on_hold", label: "متوقف" },
  { value: "completed", label: "مكتمل" },
];

function ContextCards() {
  const { watch } = useFormContext();
  const clientId = watch("clientId") as string;
  const managerId = watch("managerId") as string;
  return (
    <>
      {clientId && (
        <div className="mt-2">
          <ClientContextCard clientId={clientId} section="project" />
        </div>
      )}
      {managerId && (
        <div className="mt-2">
          <ManagerWorkloadCard employeeId={managerId} />
        </div>
      )}
    </>
  );
}

function ImpactPreviewPanel() {
  const { watch } = useFormContext();
  const name = watch("name") as string;
  const startDate = watch("startDate") as string;
  const endDate = watch("endDate") as string;
  const managerId = watch("managerId") as string;
  const budget = watch("budget") as string;
  const status = watch("status") as string;
  if (!name || !startDate || !endDate) return null;
  return (
    <ImpactPreviewButton
      endpoint="/projects/impact-preview"
      payload={{
        managerId: managerId ? Number(managerId) : undefined,
        budget: budget ? Number(budget) : undefined,
        startDate,
        endDate,
        type: status,
      }}
      label="معاينة أثر المشروع"
    />
  );
}

export default function ProjectsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addProject = useApiMutation("/projects", "POST", [
    ["projects"],
    ["projects-stats"],
  ]);

  return (
    <CreatePageLayout title="مشروع جديد" backPath="/projects">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          name: "",
          clientId: "",
          managerId: "",
          status: "planning",
          budget: "",
          startDate: "",
          endDate: "",
          description: "",
        }}
        submitLabel={addProject.isPending ? "جاري الإنشاء..." : "إنشاء"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/projects")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await addProject.mutateAsync({
            name: values.name,
            clientId: values.clientId ? Number(values.clientId) : null,
            managerId: values.managerId ? Number(values.managerId) : null,
            status: values.status,
            budget: Number(values.budget) || 0,
            startDate: values.startDate || undefined,
            endDate: values.endDate || undefined,
            description: values.description || undefined,
          });
          toast({ title: "تم إنشاء المشروع بنجاح" });
          setLocation("/projects");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم المشروع" required placeholder="اسم المشروع" />
          <FormEntitySelect name="clientId" select={ClientSelect} label="العميل" />
          <FormEntitySelect name="managerId" select={EmployeeSelect} label="مدير المشروع" />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
          <FormNumberField name="budget" label={`الميزانية (${getCurrencySymbol()})`} placeholder="٠" step="0.01" min="0" />
          <FormDateField name="startDate" label="تاريخ البدء" required />
          <FormDateField name="endDate" label="تاريخ الانتهاء" required />
        </FormGrid>
        <ContextCards />
        <FormTextareaField name="description" label="الوصف" placeholder="وصف المشروع وأهدافه..." />
        <ImpactPreviewPanel />
        <FileDropZone files={attachments} onFilesChange={setAttachments} />
      </FormShell>
    </CreatePageLayout>
  );
}
