import { useState } from "react";
import { todayLocal } from "@/lib/formatters";
import { useApiQuery, asList, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Plus, CheckCircle, Star } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@workspace/ui-core";
import { PropertyTabsNav } from "@/components/shared/property-tabs-nav";
import { PageStatusBadge, resolveStatus } from "@/components/page-status-badge";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import {
  FormShell,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormTextareaField,
  FormGrid,
} from "@/components/form-shell";

const TYPES: Record<string, string> = {
  move_in: "دخول مستأجر",
  move_out: "خروج مستأجر",
  routine: "دوري",
  maintenance: "صيانة",
};

const inspectionSchema = z.object({
  unitId: z.string().min(1, "الوحدة مطلوبة"),
  type: z.string().min(1, "النوع مطلوب"),
  scheduledDate: z.string(),
  inspectorName: z.string().trim(),
  conditionRating: z.string(),
  notes: z.string().trim(),
});
type InspectionForm = z.infer<typeof inspectionSchema>;

// Status filter options — label lookup only. Actual chip rendering
// goes through PageStatusBadge (shared domain falls back to the trip
// domain for "scheduled" via `resolveStatus`'s last-resort scan).

export default function InspectionsPage() {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  // Holds the inspection row id we're completing. Closing the dialog
  // (esc / cancel) sets it back to null without sending the PATCH.
  // Used to live as two consecutive native prompt() calls — see the
  // CompleteInspectionDialog below for the migration target.
  const [completingId, setCompletingId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["inspections", statusFilter],
    `/properties/inspections${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`
  );
  const inspections = asList(data?.data || data);

  const { data: units } = useApiQuery<any>(["property-units"], "/properties/units?limit=200");
  const unitList = asList(units?.data || units);

  const createMut = useApiMutation<unknown, Record<string, unknown>>(
    "/properties/inspections",
    "POST",
    [["inspections"]],
    {
      successMessage: "تم جدولة الفحص",
      onSuccess: () => { setShowForm(false); refetch(); },
    },
  );

  const handleSave = async (values: InspectionForm) => {
    await createMut.mutateAsync({
      unitId: Number(values.unitId),
      type: values.type,
      scheduledDate: values.scheduledDate,
      inspectorName: values.inspectorName,
      conditionRating: values.conditionRating ? Number(values.conditionRating) : null,
      notes: values.notes,
    });
  };

  // PATCH the inspection row to status=completed with the operator-
  // supplied rating + notes. Validation is in zod (see schema below
  // in CompleteInspectionDialog) so an out-of-range rating never
  // reaches the server.
  const submitCompletion = async (
    id: number,
    values: { conditionRating: number; notes: string },
  ) => {
    try {
      await apiFetch(`/properties/inspections/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "completed",
          inspectionDate: todayLocal(),
          conditionRating: values.conditionRating,
          notes: values.notes || null,
        }),
      });
      refetch();
      toast({ title: "تم إكمال الفحص" });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="فحص الوحدات العقارية"
      subtitle="جدولة وتتبع عمليات فحص الوحدات"
      breadcrumbs={[{ href: "/properties/dashboard", label: "إدارة الأملاك" }, { label: "فحص الوحدات العقارية" }]}
      actions={
        <GuardedButton perm="properties:create" onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="w-4 h-4 me-1" /> جدولة فحص
        </GuardedButton>
      }
    >
      <PropertyTabsNav />
      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">جدولة فحص جديد</CardTitle></CardHeader>
          <CardContent>
            <FormShell
              schema={inspectionSchema}
              defaultValues={{
                unitId: "",
                type: "routine",
                scheduledDate: "",
                inspectorName: "",
                conditionRating: "",
                notes: "",
              }}
              submitLabel="حفظ"
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values) => {
                await handleSave(values);
              }}
            >
              <FormGrid cols={3}>
                <FormSelectField
                  name="unitId"
                  label="الوحدة"
                  required
                  options={[
                    { value: "", label: "اختر وحدة" },
                    ...unitList.map((u: any) => ({
                      value: String(u.id),
                      label: `${u.unitNumber} — ${u.buildingName}`,
                    })),
                  ]}
                />
                <FormSelectField
                  name="type"
                  label="نوع الفحص"
                  required
                  options={Object.entries(TYPES).map(([value, label]) => ({ value, label }))}
                />
                <FormDateField name="scheduledDate" label="تاريخ الفحص" />
                <FormTextField name="inspectorName" label="اسم المفتش" placeholder="اسم المفتش" />
                <FormNumberField name="conditionRating" label="التقييم الأولي (1-5)" />
                <FormTextField name="notes" label="ملاحظات" />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        {["all", "scheduled", "completed", "cancelled"].map((s) => (
          <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}>
            {s === "all" ? "الكل" : resolveStatus(s)?.label ?? s}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {inspections.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">لا توجد عمليات فحص</CardContent></Card>
        ) : inspections.map((insp: any) => (
          <Card key={insp.id} className="hover:shadow-md">
            <CardContent className="p-4 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{insp.unitNumber} — {insp.buildingName}</span>
                  <PageStatusBadge status={insp.status} />
                  <Badge className="bg-surface-subtle text-muted-foreground">{TYPES[insp.type] || insp.type}</Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                  {insp.inspectorName && <p>المفتش: {insp.inspectorName}</p>}
                  <p>
                    {insp.status === "scheduled" ? "موعد الفحص:" : "تاريخ الفحص:"}
                    {" "}{(insp.inspectionDate || insp.scheduledDate)?.split("T")[0]}
                  </p>
                  {insp.notes && <p>{insp.notes}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {insp.conditionRating && (
                  <div className="flex items-center gap-1 text-status-warning">
                    <Star className="w-4 h-4 fill-current" />
                    <span className="text-sm font-medium">{insp.conditionRating}/5</span>
                  </div>
                )}
                {insp.status === "scheduled" && (
                  <GuardedButton perm="properties:create" size="sm" onClick={() => setCompletingId(insp.id)}>
                    <CheckCircle className="w-3.5 h-3.5 me-1" /> إتمام
                  </GuardedButton>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CompleteInspectionDialog
        open={completingId !== null}
        onClose={() => setCompletingId(null)}
        onSubmit={async (values) => {
          if (completingId == null) return;
          await submitCompletion(completingId, values);
          setCompletingId(null);
        }}
      />
    </PageShell>
  );
}

// ─── Inspection-completion dialog ────────────────────────────────────────────
// Replaces the back-to-back `prompt("تقييم...")` + `prompt("ملاحظات...")`
// pair the page used to fire from the "إتمام" button. The native flow
// blocked the event loop, allowed any string to land in `conditionRating`
// (we then `Number(...)`-coerced server-side), and showed an OS-default UI
// that didn't match RTL/dark mode. The dialog uses the shared FormShell so
// the rating is validated as an integer 1-5 BEFORE the PATCH is sent.

// `z.coerce.number()` because `<input type="number">` + react-hook-form's
// register() flow values as strings. Coercion turns "3" → 3 before the
// int/min/max checks run.
const completionSchema = z.object({
  conditionRating: z.coerce
    .number({ invalid_type_error: "أدخل رقمًا صحيحًا" })
    .int("يجب أن يكون عددًا صحيحًا")
    .min(1, "أدنى تقييم 1")
    .max(5, "أعلى تقييم 5"),
  notes: z.string(),
});
type CompletionForm = z.infer<typeof completionSchema>;

function CompleteInspectionDialog(props: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: CompletionForm) => void | Promise<void>;
}) {
  // Use the dialog's `open` to mount/unmount the form so FormShell's
  // defaultValues are reset on each re-open.
  return (
    <AlertDialog open={props.open} onOpenChange={(next) => { if (!next) props.onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>إتمام الفحص</AlertDialogTitle>
          <AlertDialogDescription>
            أدخل تقييم حالة الوحدة وأي ملاحظات. التقييم رقم من 1 إلى 5.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {props.open && (
          <FormShell
            schema={completionSchema}
            defaultValues={{ conditionRating: 3 as number, notes: "" }}
            submitLabel="حفظ وإتمام"
            secondaryActions={
              <Button type="button" variant="ghost" onClick={props.onClose}>
                إلغاء
              </Button>
            }
            onSubmit={async (values) => {
              await props.onSubmit(values);
            }}
          >
            <FormGrid cols={1}>
              <FormNumberField
                name="conditionRating"
                label="تقييم حالة الوحدة (1-5)"
                required
                placeholder="3"
              />
              <FormTextareaField name="notes" label="ملاحظات الفحص" rows={3} />
            </FormGrid>
          </FormShell>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
