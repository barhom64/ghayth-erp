import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery, apiFetch } from "@/lib/api";
import { useFormContext, Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Autocomplete } from "@/components/ui/autocomplete";
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
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { ClientContextCard } from "@/components/shared/client-context-card";

const schema = z
  .object({
    title: z.string().min(1, "يرجى إدخال عنوان العقد"),
    partyName: z.string().min(1, "الطرف الآخر مطلوب"),
    partyContact: z.string().optional(),
    contractType: z.string().optional(),
    value: z
      .string()
      .optional()
      .refine((v) => !v || Number(v) >= 0, "القيمة يجب أن تكون 0 أو أكثر"),
    status: z.enum(["draft", "active"]),
    startDate: z.string().min(1, "يرجى تحديد تاريخ البداية"),
    endDate: z.string().min(1, "يرجى تحديد تاريخ النهاية"),
    notes: z.string().optional(),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.endDate > v.startDate,
    { message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية", path: ["endDate"] },
  );

const CONTRACT_TYPE_OPTIONS = [
  { value: "service", label: "عقد خدمات" },
  { value: "employment", label: "عقد توظيف" },
  { value: "rental", label: "عقد إيجار" },
  { value: "supply", label: "عقد توريد" },
  { value: "partnership", label: "عقد شراكة" },
  { value: "nda", label: "اتفاقية سرية" },
  { value: "other", label: "أخرى" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "مسودة" },
  { value: "active", label: "ساري" },
];

function PartyPicker({ clients }: { clients: any[] }) {
  const { control } = useFormContext();
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">الطرف الآخر (عميل) <span className="text-red-500 ms-1">*</span></label>
      <Controller
        name="partyName"
        control={control}
        render={({ field, fieldState }) => (
          <>
            <Autocomplete
              value={field.value ?? ""}
              onChange={(v) => field.onChange(String(v))}
              options={clients.map((c: any) => ({
                value: String(c.id),
                label: c.name,
                subtitle: c.phone || c.email || "",
              }))}
              placeholder="ابحث عن العميل..."
              emptyMessage="لا يوجد عملاء"
            />
            {fieldState.error && <p className="text-xs text-status-error-foreground mt-1">{fieldState.error.message}</p>}
          </>
        )}
      />
    </div>
  );
}

function PartyContextCard() {
  const { watch } = useFormContext();
  const partyName = watch("partyName") as string;
  if (!partyName) return null;
  return (
    <div className="md:col-span-2">
      <ClientContextCard clientId={partyName} section="contract" />
    </div>
  );
}

function CopyFromHydrator({ copyFromId }: { copyFromId: string | null }) {
  const { reset } = useFormContext();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (copyFromId && !copied) {
      apiFetch(`/legal/contracts/${copyFromId}`)
        .then((res: any) => {
          const src = res.data || res;
          setCopied(true);
          reset((prev: any) => ({
            ...prev,
            title: `${src.title || ""} (نسخة)`,
            partyName: src.partyName || "",
            partyContact: src.partyContact || "",
            contractType: src.contractType || "",
            value: src.value ? String(src.value) : "",
            startDate: "",
            endDate: "",
          }));
        })
        .catch(() => {});
    }
  }, [copyFromId, copied, reset]);
  return null;
}

export default function LegalCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const addContract = useApiMutation("/legal/contracts", "POST", [["legal-contracts"], ["legal-stats"]]);
  const { data: clientsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const search = useSearch();
  const copyFromId = new URLSearchParams(search).get("copyFrom");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const clients = clientsData?.data || [];

  return (
    <CreatePageLayout title={copyFromId ? "نسخ عقد قانوني" : "عقد قانوني جديد"} backPath="/legal">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          title: "",
          partyName: "",
          partyContact: "",
          contractType: "",
          value: "",
          status: "draft",
          startDate: "",
          endDate: "",
          notes: "",
        }}
        submitLabel={addContract.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/legal")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await addContract.mutateAsync({
            title: values.title,
            partyName: values.partyName,
            partyContact: values.partyContact || undefined,
            contractType: values.contractType || undefined,
            value: values.value ? Number(values.value) : undefined,
            status: values.status,
            startDate: values.startDate,
            endDate: values.endDate,
            notes: values.notes || undefined,
            ...(attachments.length > 0 ? { attachments } : {}),
          });
          toast({ title: "تمت إضافة العقد بنجاح" });
          setLocation("/legal");
        }}
      >
        <CopyFromHydrator copyFromId={copyFromId} />
        <FormGrid cols={2}>
          <FormTextField name="title" label="عنوان العقد" required placeholder="عنوان العقد" />
          <FormSelectField name="contractType" label="نوع العقد" options={CONTRACT_TYPE_OPTIONS} placeholder="اختر النوع" />
          <PartyPicker clients={clients} />
          <FormTextField name="partyContact" label="بيانات الاتصال" placeholder="هاتف أو بريد" />
        </FormGrid>
        <PartyContextCard />
        <FormGrid cols={2}>
          <FormNumberField name="value" label={`القيمة (${getCurrencySymbol()})`} placeholder="٠" step="0.01" min="0" />
          <FormSelectField name="status" label="الحالة" options={STATUS_OPTIONS} />
          <FormDateField name="startDate" label="من" required />
          <FormDateField name="endDate" label="إلى" required />
        </FormGrid>
        <FormTextareaField name="notes" label="ملاحظات" placeholder="ملاحظات حول العقد..." />
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات العقد" />
      </FormShell>
    </CreatePageLayout>
  );
}
