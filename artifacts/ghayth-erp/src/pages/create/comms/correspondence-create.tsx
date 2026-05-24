import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormSelectField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  direction: z.enum(["outgoing", "incoming"]),
  subject: z.string().min(1, "يرجى إدخال موضوع المراسلة"),
  content: z.string().min(1, "يرجى إدخال محتوى المراسلة"),
  senderName: z.string().min(1, "يرجى إدخال اسم المرسل"),
  senderOrg: z.string().optional(),
  recipientName: z.string().min(1, "يرجى إدخال اسم المستلم"),
  recipientOrg: z.string().optional(),
  channel: z.string().optional(),
  notes: z.string().optional(),
});

const DIRECTION_OPTIONS = [
  { value: "outgoing", label: "صادر" },
  { value: "incoming", label: "وارد" },
];

const CHANNEL_OPTIONS = [
  { value: "email", label: "بريد إلكتروني" },
  { value: "fax", label: "فاكس" },
  { value: "postal", label: "بريد عادي" },
  { value: "hand", label: "تسليم يدوي" },
  { value: "electronic", label: "منصة إلكترونية" },
];

export default function CorrespondenceCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createMut = useApiMutation<unknown, z.infer<typeof schema>>(
    "/correspondence",
    "POST",
    [["correspondence"]],
  );

  return (
    <CreatePageLayout title="مراسلة جديدة" backPath="/correspondence">
      <FormShell
        schema={schema}
        defaultValues={{
          direction: "outgoing",
          subject: "",
          content: "",
          senderName: "",
          senderOrg: "",
          recipientName: "",
          recipientOrg: "",
          channel: "",
          notes: "",
        }}
        submitLabel={createMut.isPending ? "جاري الإنشاء..." : "إنشاء"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/correspondence")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync(values);
          toast({ title: "تم إنشاء المراسلة بنجاح" });
          setLocation("/correspondence");
        }}
      >
        <FormGrid cols={2}>
          <FormSelectField name="direction" label="الاتجاه" required options={DIRECTION_OPTIONS} />
          <FormSelectField name="channel" label="قناة الإرسال" options={CHANNEL_OPTIONS} placeholder="اختر القناة" />
        </FormGrid>
        <FormTextField name="subject" label="الموضوع" required placeholder="موضوع المراسلة" />
        <FormGrid cols={2}>
          <FormTextField name="senderName" label="اسم المرسل" required placeholder="اسم المرسل" />
          <FormTextField name="senderOrg" label="جهة المرسل" placeholder="المنظمة أو الجهة المرسلة" />
          <FormTextField name="recipientName" label="اسم المستلم" required placeholder="اسم المستلم" />
          <FormTextField name="recipientOrg" label="جهة المستلم" placeholder="المنظمة أو الجهة المستلمة" />
        </FormGrid>
        <FormTextareaField name="content" label="المحتوى" required placeholder="نص المراسلة..." />
        <FormTextareaField name="notes" label="ملاحظات" placeholder="ملاحظات إضافية (اختياري)..." />
      </FormShell>
    </CreatePageLayout>
  );
}
