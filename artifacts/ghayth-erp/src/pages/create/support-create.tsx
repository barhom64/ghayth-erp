import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  AutoField,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormSelectField,
  FormEntitySelect,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { ClientContextCard } from "@/components/shared/client-context-card";
import { ClientSelect, EmployeeSelect } from "@/components/shared/entity-selects";

const schema = z.object({
  title: z.string().min(1, "يرجى إدخال عنوان التذكرة"),
  clientId: z.string().optional(),
  assigneeId: z.string().optional(),
  category: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  status: z.enum(["open", "in_progress"]),
  description: z.string().min(1, "يرجى إدخال وصف المشكلة"),
});

const CATEGORY_OPTIONS = [
  { value: "technical", label: "تقنية" },
  { value: "financial", label: "مالية" },
  { value: "administrative", label: "إدارية" },
  { value: "maintenance", label: "صيانة" },
  { value: "other", label: "أخرى" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "منخفضة" },
  { value: "medium", label: "متوسطة" },
  { value: "high", label: "عالية" },
  { value: "urgent", label: "عاجلة" },
];

const STATUS_OPTIONS = [
  { value: "open", label: "مفتوحة" },
  { value: "in_progress", label: "قيد المعالجة" },
];

function ClientCard() {
  const { watch } = useFormContext();
  const clientId = watch("clientId") as string;
  if (!clientId) return null;
  return (
    <div className="mt-3">
      <ClientContextCard clientId={clientId} section="ticket" />
    </div>
  );
}

export default function SupportCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const addTicket = useApiMutation("/support/tickets", "POST", [
    ["support-tickets"],
    ["support-stats"],
  ]);

  return (
    <CreatePageLayout title="تذكرة دعم جديدة" backPath="/support">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="المنشئ" value={user?.name || "-"} />
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          title: "",
          clientId: "",
          assigneeId: "",
          category: "",
          priority: "medium",
          status: "open",
          description: "",
        }}
        submitLabel={addTicket.isPending ? "جاري الإنشاء..." : "إنشاء"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/support")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await addTicket.mutateAsync({
            subject: values.title,
            title: values.title,
            clientId: values.clientId ? Number(values.clientId) : undefined,
            assigneeId: values.assigneeId ? Number(values.assigneeId) : undefined,
            category: values.category || undefined,
            priority: values.priority,
            description: values.description,
          });
          toast({ title: "تم إنشاء التذكرة بنجاح" });
          setLocation("/support");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="عنوان التذكرة" required placeholder="عنوان التذكرة" />
          <FormEntitySelect name="clientId" select={ClientSelect} label="العميل" />
          <FormEntitySelect name="assigneeId" select={EmployeeSelect} label="المسؤول عن التذكرة" />
          <FormSelectField name="category" label="الفئة" placeholder="اختر الفئة" options={CATEGORY_OPTIONS} />
          <FormSelectField name="priority" label="الأولوية" options={PRIORITY_OPTIONS} />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
        </FormGrid>
        <ClientCard />
        <FormTextareaField name="description" label="وصف المشكلة" required placeholder="وصف تفصيلي للمشكلة..." rows={4} />
      </FormShell>
    </CreatePageLayout>
  );
}
