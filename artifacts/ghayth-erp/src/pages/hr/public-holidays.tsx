import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, X } from "lucide-react";
import {
  PageShell,
  FormShell,
  FormTextField,
  FormSelectField,
  FormDateField,
  FormGrid,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { HOLIDAY_TYPES, HOLIDAY_COLORS, MONTHS_AR } from "@/lib/hr-type-maps";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";

// HOLIDAY_TYPES has a fixed set of keys — `national`, `religious`,
// `company`, etc. Use them as the closed enum source. type stays a
// string in the schema (rather than z.enum) because the labels come
// from a Record<string,string> and we don't want to duplicate the keys.
const holidaySchema = z.object({
  name: z.string().trim().min(1, "اسم العطلة مطلوب"),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  endDate: z.string(),
  type: z.string().min(1, "النوع مطلوب"),
  description: z.string().trim(),
  isRecurring: z.boolean(),
});
type HolidayForm = z.infer<typeof holidaySchema>;
const defaultHolidayForm: HolidayForm = {
  name: "", startDate: "", endDate: "", type: "national", description: "", isRecurring: false,
};

export default function PublicHolidaysPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // Seed values passed to FormShell.defaultValues. When the operator
  // clicks "تعديل" on an existing holiday, handleEdit updates this AND
  // the FormShell remounts via `key={editingId ?? "new"}` so the new
  // defaults take effect.
  const [formInitial, setFormInitial] = useState<HolidayForm>(defaultHolidayForm);
  // Deletion dialog state (replaces window.confirm). Tracks the
  // holiday being deleted so ConfirmDeleteDialog can render its name +
  // fetch /impact-preview for it.
  const [deletingHoliday, setDeletingHoliday] = useState<{ id: number; name: string } | null>(null);

  const { data, isLoading, isError } = useApiQuery<any>(["public-holidays", String(year)], `/hr/public-holidays?year=${year}`);
  const holidays = asList(data?.data || data);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormInitial(defaultHolidayForm);
  };

  const updateMut = useApiMutation<any, HolidayForm & { id: number }>(
    (body) => `/hr/public-holidays/${body.id}`,
    "PATCH",
    [["public-holidays"]],
    { successMessage: "تم تحديث العطلة", onSuccess: resetForm }
  );
  const createMut = useApiMutation<any, HolidayForm>(
    "/hr/public-holidays",
    "POST",
    [["public-holidays"]],
    { successMessage: "تم إضافة العطلة", onSuccess: resetForm }
  );
  const handleSave = async (values: HolidayForm) => {
    if (editingId) {
      await updateMut.mutateAsync({ ...values, id: editingId });
    } else {
      await createMut.mutateAsync(values);
    }
  };

  // Open the confirm dialog. The actual DELETE fires from inside
  // ConfirmDeleteDialog via the deletePath it's handed below.
  const openDeleteDialog = (h: any) => {
    setDeletingHoliday({ id: h.id, name: h.name || "—" });
  };

  const handleEdit = (h: any) => {
    setEditingId(h.id);
    setFormInitial({
      name: h.name,
      startDate: h.startDate?.split("T")[0] || "",
      endDate: h.endDate?.split("T")[0] || "",
      type: h.type || "national",
      description: h.description || "",
      isRecurring: h.isRecurring || false,
    });
    setShowForm(true);
  };

  const groupedByMonth = MONTHS_AR.reduce((acc, m, idx) => {
    const monthNum = idx + 1;
    const items = holidays.filter((h: any) => {
      const d = new Date(h.startDate);
      return d.getMonth() + 1 === monthNum;
    });
    if (items.length > 0) acc[m] = items;
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <PageShell
      title="تقويم الإجازات الرسمية"
      subtitle="إدارة العطل الرسمية والأيام المميزة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "تقويم الإجازات الرسمية" }]}
      loading={isLoading}
      actions={
        <>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <GuardedButton perm="hr:create" onClick={() => { setShowForm(!showForm); setEditingId(null); setFormInitial(defaultHolidayForm); }} size="sm">
            <Plus className="w-4 h-4 me-1" /> إضافة عطلة
          </GuardedButton>
        </>
      }
    >
      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{editingId ? "تعديل عطلة" : "إضافة عطلة جديدة"}</CardTitle>
          </CardHeader>
          <CardContent>
            <FormShell
              key={editingId ?? "new"}
              schema={holidaySchema}
              defaultValues={formInitial}
              submitLabel={editingId ? "تحديث العطلة" : "إضافة العطلة"}
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>
                  <X className="w-4 h-4 me-1" /> إلغاء
                </Button>
              }
              onSubmit={async (values) => {
                await handleSave(values);
              }}
            >
              <FormGrid cols={2}>
                <FormTextField name="name" label="اسم العطلة" required placeholder="مثال: اليوم الوطني" />
                <FormSelectField
                  name="type"
                  label="النوع"
                  required
                  options={Object.entries(HOLIDAY_TYPES).map(([value, label]) => ({ value, label }))}
                />
                <FormDateField name="startDate" label="تاريخ البداية" required />
                <FormDateField name="endDate" label="تاريخ النهاية" />
                <FormTextField name="description" label="الوصف" placeholder="وصف اختياري" className="col-span-2" />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorState />
      ) : holidays.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">لا توجد عطل لهذا العام</CardContent></Card>
      ) : (
        Object.entries(groupedByMonth).map(([month, items]) => (
          <Card key={month}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{month}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((h: any) => {
                const start = new Date(h.startDate);
                const end = new Date(h.endDate || h.startDate);
                const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1);
                return (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-subtle hover:bg-surface-subtle">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {start.getDate()}
                      </div>
                      <div>
                        <div className="font-medium">{h.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {h.startDate?.split("T")[0]} {h.endDate && h.endDate !== h.startDate ? `← ${h.endDate?.split("T")[0]}` : ""} ({days} {days === 1 ? "يوم" : "أيام"})
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={HOLIDAY_COLORS[h.type] || "bg-surface-subtle text-status-neutral-foreground"}>{HOLIDAY_TYPES[h.type] || h.type}</Badge>
                      {h.isRecurring && <Badge className="bg-orange-100 text-orange-700">سنوي</Badge>}
                      <button onClick={() => handleEdit(h)} className="p-1 text-muted-foreground hover:text-primary"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => openDeleteDialog(h)} className="p-1 text-muted-foreground hover:text-status-error"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}

      <ConfirmDeleteDialog
        open={deletingHoliday !== null}
        onOpenChange={(v) => { if (!v) setDeletingHoliday(null); }}
        entity={{
          type: "public_holiday",
          id: deletingHoliday?.id ?? 0,
          name: deletingHoliday?.name ?? "",
        }}
        deletePath={`/hr/public-holidays/${deletingHoliday?.id}`}
        invalidateKeys={[["public-holidays"]]}
        successMessage="تم الحذف"
        onDeleted={() => setDeletingHoliday(null)}
      />
    </PageShell>
  );
}
