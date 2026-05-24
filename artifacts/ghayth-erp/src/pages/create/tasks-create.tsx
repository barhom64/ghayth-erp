import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFormContext, Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CreatePageLayout,
  AutoField,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormSelectField,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { Link2 } from "lucide-react";
import { Autocomplete } from "@/components/ui/autocomplete";

const ENTITY_TYPE_OPTIONS = [
  { value: "maintenance_request", label: "طلب صيانة" },
  { value: "property_unit", label: "وحدة عقارية" },
  { value: "vehicle", label: "مركبة" },
  { value: "client", label: "عميل" },
  { value: "contract", label: "عقد" },
  { value: "project", label: "مشروع" },
  { value: "legal_case", label: "قضية قانونية" },
];

const TYPE_OPTIONS = [
  { value: "task", label: "مهمة عامة" },
  { value: "meeting", label: "اجتماع" },
  { value: "call", label: "مكالمة" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "منخفضة" },
  { value: "medium", label: "متوسطة" },
  { value: "high", label: "عالية" },
];

const schema = z.object({
  title: z.string().min(1, "يرجى إدخال عنوان المهمة"),
  description: z.string().optional(),
  type: z.enum(["task", "meeting", "call"]),
  priority: z.enum(["low", "medium", "high"]),
  scheduledStart: z.string().optional(),
  clientName: z.string().optional(),
  linkedEntityType: z.string().optional(),
  linkedEntityId: z.string().optional(),
});

function EntityPicker() {
  const { control, watch } = useFormContext();
  const linkedEntityType = watch("linkedEntityType") as string;
  const [entitySearch, setEntitySearch] = useState("");
  const { data: entityResults, isLoading: entityLoading } = useApiQuery<any>(
    ["entity-search", linkedEntityType, entitySearch],
    `/tasks/entity-search?type=${linkedEntityType}&q=${encodeURIComponent(entitySearch)}`,
    !!linkedEntityType,
  );
  const entityOptions = (Array.isArray(entityResults) ? entityResults : []).map((item: any) => ({
    value: String(item.id),
    label: item.name || item.unitNumber || item.title || item.plateNumber || item.ref || item.description || `#${item.id}`,
    subtitle: item.category || item.email || item.phone || undefined,
  }));
  if (!linkedEntityType) return null;
  return (
    <Controller
      control={control}
      name="linkedEntityId"
      render={({ field }) => (
        <div className="space-y-1.5">
          <Label htmlFor="linkedEntityId">اختر الكيان</Label>
          <Autocomplete
            options={entityOptions}
            value={(field.value as string) ?? ""}
            onChange={(val) => field.onChange(String(val || ""))}
            placeholder="ابحث عن الكيان..."
            loading={entityLoading}
            emptyMessage={entityLoading ? "جاري التحميل..." : "لا توجد نتائج"}
          />
        </div>
      )}
    />
  );
}

function EntityTypeBadge() {
  const { watch } = useFormContext();
  const linkedEntityType = watch("linkedEntityType") as string;
  if (!linkedEntityType) return null;
  return (
    <Badge variant="secondary" className="text-xs">
      {ENTITY_TYPE_OPTIONS.find((o) => o.value === linkedEntityType)?.label}
    </Badge>
  );
}

export default function TasksCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const createMut = useApiMutation("/tasks", "POST", [["tasks"]]);
  const { data: clientsData, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["clients-list"],
    "/clients",
  );
  const clients = clientsData?.data || [];
  const searchStr = useSearch();
  const searchParams = new URLSearchParams(searchStr);

  // Initial values can come from a `?copy=...` JSON blob (when the
  // user clicks "duplicate task" from a list) or from individual
  // query-string fields when launched from a link.
  const getInitial = () => {
    const copy = searchParams.get("copy");
    if (copy) {
      try {
        const data = JSON.parse(copy);
        return {
          title: data.title || "",
          description: data.description || "",
          type: (data.type || "task") as "task" | "meeting" | "call",
          priority: (data.priority || "medium") as "low" | "medium" | "high",
          scheduledStart: "",
          clientName: data.clientName || "",
          linkedEntityType: "",
          linkedEntityId: "",
        };
      } catch {
        /* ignore */
      }
    }
    return {
      title: searchParams.get("title") || "",
      description: "",
      type: (searchParams.get("type") || "task") as "task" | "meeting" | "call",
      priority: (searchParams.get("priority") || "medium") as "low" | "medium" | "high",
      scheduledStart: "",
      clientName: "",
      linkedEntityType: searchParams.get("linkedEntityType") || "",
      linkedEntityId: searchParams.get("linkedEntityId") || "",
    };
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const clientOptions = clients.map((c: any) => ({ value: c.name, label: c.name }));

  return (
    <CreatePageLayout title="مهمة جديدة" backPath="/tasks">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="المنشئ" value={user?.name || "-"} />
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={getInitial()}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/tasks")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          const payload: any = { ...values, assignedTo: user?.name || "" };
          if (!payload.linkedEntityType) {
            delete payload.linkedEntityType;
            delete payload.linkedEntityId;
          } else if (payload.linkedEntityId) {
            payload.linkedEntityId = Number(payload.linkedEntityId);
            if (!Number.isFinite(payload.linkedEntityId) || payload.linkedEntityId <= 0) {
              toast({ variant: "destructive", title: "يرجى اختيار الكيان المرتبط" });
              return;
            }
          } else {
            toast({
              variant: "destructive",
              title: "يرجى اختيار الكيان المرتبط أو إزالة نوع الربط",
            });
            return;
          }
          await createMut.mutateAsync(payload);
          toast({ title: "تم إنشاء المهمة بنجاح" });
          setLocation("/tasks");
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="العنوان" required />
          <FormSelectField name="type" label="النوع" options={TYPE_OPTIONS} />
          <FormSelectField name="priority" label="الأولوية" options={PRIORITY_OPTIONS} />
          <FormTextField name="scheduledStart" label="الموعد" type="datetime-local" />
          <FormSelectField name="clientName" label="العميل" placeholder="— بدون عميل —" options={clientOptions} />
        </FormGrid>
        <FormTextareaField name="description" label="الوصف" rows={3} />

        <div className="border-t pt-4 mt-2">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <Label className="text-base font-semibold">ربط بكيان (اختياري)</Label>
            <EntityTypeBadge />
          </div>
          <FormGrid cols={2}>
            <FormSelectField
              name="linkedEntityType"
              label="نوع الكيان"
              placeholder="— بدون ربط —"
              options={ENTITY_TYPE_OPTIONS}
            />
            <EntityPicker />
          </FormGrid>
        </div>
      </FormShell>
    </CreatePageLayout>
  );
}
