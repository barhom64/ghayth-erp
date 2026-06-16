import { useState } from "react";
import { useLocation, Link } from "wouter";
import { z } from "zod";
import { apiFetch, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormPhoneField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const pilgrimSchema = z.object({
  fullName: z.string().min(1, "الاسم الكامل مطلوب"),
  passportNumber: z.string().min(1, "رقم الجواز مطلوب"),
  visaNumber: z.string().optional(),
  nuskNumber: z.string().optional(),
  nationality: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  phone: z.string().optional(),
  seasonId: z.string().optional(),
  agentId: z.string().optional(),
  subAgentId: z.string().optional(),
  groupId: z.string().optional(),
  packageId: z.string().optional(),
  arrivalDate: z.string().optional(),
  departureDate: z.string().optional(),
  hotelName: z.string().optional(),
  roomNumber: z.string().optional(),
  notes: z.string().optional(),
});
type PilgrimForm = z.infer<typeof pilgrimSchema>;

const EMPTY: PilgrimForm = {
  fullName: "",
  passportNumber: "",
  visaNumber: "",
  nuskNumber: "",
  nationality: "",
  gender: "",
  dateOfBirth: "",
  phone: "",
  seasonId: "",
  agentId: "",
  subAgentId: "",
  groupId: "",
  packageId: "",
  arrivalDate: "",
  departureDate: "",
  hotelName: "",
  roomNumber: "",
  notes: "",
};

const GENDER_OPTIONS = [
  { value: "male", label: "ذكر" },
  { value: "female", label: "أنثى" },
];

export default function PilgrimCreate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { data: seasons } = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const { data: agents } = useApiQuery<any>(["umrah-agents"], "/umrah/agents");
  const { data: subAgents } = useApiQuery<any>(["umrah-sub-agents"], "/umrah/sub-agents");
  const { data: groups } = useApiQuery<any>(["umrah-groups"], "/umrah/groups");
  const { data: packages } = useApiQuery<any>(["umrah-packages"], "/umrah/packages");

  return (
    <CreatePageLayout
      title="إضافة معتمر جديد"
      backPath="/umrah/pilgrims"
      backLabel="المعتمرون"
      breadcrumbs={[{ href: "/dashboard", label: "لوحة التحكم" }, { href: "/umrah", label: "العمرة" }, { href: "/umrah/pilgrims", label: "المعتمرون" }]}
    >
      <FormShell
            schema={pilgrimSchema}
            defaultValues={EMPTY}
            submitLabel="حفظ"
            secondaryActions={
              <Button asChild type="button" variant="outline"><Link href="/umrah/pilgrims">إلغاء</Link></Button>
            }
            onSubmit={async (values) => {
              try {
                await apiFetch("/umrah/pilgrims", {
                  method: "POST",
                  body: JSON.stringify({
                    ...values,
                    seasonId: values.seasonId ? Number(values.seasonId) : undefined,
                    agentId: values.agentId ? Number(values.agentId) : undefined,
                    subAgentId: values.subAgentId ? Number(values.subAgentId) : undefined,
                    groupId: values.groupId ? Number(values.groupId) : undefined,
                    nuskNumber: values.nuskNumber || undefined,
                    packageId: values.packageId ? Number(values.packageId) : undefined,
                    ...(attachments.length > 0 ? { attachments } : {}),
                  }),
                });
                toast({ title: "تم إضافة المعتمر بنجاح" });
                navigate("/umrah/pilgrims");
              } catch (err: any) {
                toast({ variant: "destructive", title: err?.error || "خطأ في الحفظ" });
              }
            }}
          >
            <FormGrid cols={3}>
              <FormTextField name="fullName" label="الاسم الكامل" required />
              <FormTextField name="passportNumber" label="رقم الجواز" required />
              <FormTextField name="nuskNumber" label="رقم المعتمر (نسك)" />
              <FormTextField name="visaNumber" label="رقم التأشيرة" />
              <FormTextField name="nationality" label="الجنسية" />
              <FormSelectField name="gender" label="الجنس" options={GENDER_OPTIONS} placeholder="اختر" />
              <FormDateField name="dateOfBirth" label="تاريخ الميلاد" />
              <FormPhoneField name="phone" label="الهاتف" />
              <FormSelectField
                name="seasonId"
                label="الموسم"
                options={(seasons?.data || []).map((s: any) => ({ value: String(s.id), label: s.title }))}
                placeholder="اختر الموسم"
              />
              <FormSelectField
                name="agentId"
                label="الوكيل"
                options={(agents?.data || []).map((a: any) => ({ value: String(a.id), label: a.name }))}
                placeholder="اختر الوكيل"
              />
              <FormSelectField
                name="subAgentId"
                label="المكتب (الوكيل الفرعي)"
                options={(subAgents?.data || []).map((s: any) => ({ value: String(s.id), label: s.name }))}
                placeholder="اختر المكتب"
              />
              <FormSelectField
                name="groupId"
                label="المجموعة"
                options={(groups?.data || []).map((g: any) => ({ value: String(g.id), label: g.name || g.title || `#${g.id}` }))}
                placeholder="اختر المجموعة"
              />
              <FormSelectField
                name="packageId"
                label="الباقة"
                options={(packages?.data || []).map((p: any) => ({ value: String(p.id), label: p.name }))}
                placeholder="اختر الباقة"
              />
              <FormDateField name="arrivalDate" label="تاريخ الوصول" />
              <FormDateField name="departureDate" label="تاريخ المغادرة" />
              <FormTextField name="hotelName" label="الفندق" />
              <FormTextField name="roomNumber" label="رقم الغرفة" />
            </FormGrid>
            <FormTextareaField name="notes" label="ملاحظات" rows={3} />
            <FileDropZone files={attachments} onFilesChange={setAttachments} />
          </FormShell>
    </CreatePageLayout>
  );
}
