import { useMemo } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FormShell, FormTextField, FormSelectField, FormGrid } from "@workspace/ui-core";

export const branchFormSchema = z.object({
  name: z.string().trim().min(1, "اسم الفرع مطلوب"),
  nameEn: z.string().trim(),
  city: z.string().trim(),
  phone: z.string().trim(),
  companyId: z.string().min(1, "اختر شركة"),
});
export type BranchFormValues = z.infer<typeof branchFormSchema>;

export interface BranchFormProps {
  /** Called with the freshly-created branch row after a successful create. */
  onCreated?: (created: any) => void;
  /** Called after any successful save (create OR edit) — host refetch/reset. */
  onSaved?: () => void;
  /** Called when the operator cancels (إلغاء). */
  onCancel: () => void;
  /** Edit mode (the settings tab only); omit/undefined for create (drawer). */
  editingId?: number | null;
  /** Initial values, used when editing an existing branch. */
  initialValues?: Partial<BranchFormValues>;
}

/**
 * The unified branch create/edit form body — shared by the Settings «الفروع»
 * tab (BranchesTab) and the inline `AllowCreateDrawer` opened from
 * `BranchSelect`. Owns its own state + mutation so an inline create is the
 * FULL form — crucially including the **required** `companyId` that the old
 * truncated quick-add dropped (which produced half-created branches).
 */
export function BranchForm({
  onCreated,
  onSaved,
  onCancel,
  editingId = null,
  initialValues,
}: BranchFormProps) {
  const { toast } = useToast();
  const { data: companiesResp } = useApiQuery<any>(["settings-companies"], "/settings/companies");
  const companies = asList(companiesResp);
  const createMut = useApiMutation("/settings/branches", "POST", [["settings-branches"]]);

  const companyOptions = useMemo(
    () => companies.map((c: any) => ({ value: String(c.id), label: c.name })),
    [companies],
  );

  // On create, default to the first company once the list loads; on edit, keep
  // the branch's stored company. The FormShell key includes firstCompanyId so
  // it re-seeds the default the moment companies arrive.
  const firstCompanyId = companies[0]?.id != null ? String(companies[0].id) : "";
  const defaultValues: BranchFormValues = {
    name: initialValues?.name ?? "",
    nameEn: initialValues?.nameEn ?? "",
    city: initialValues?.city ?? "",
    phone: initialValues?.phone ?? "",
    companyId: initialValues?.companyId ?? (editingId ? "" : firstCompanyId),
  };

  const handleSave = async (values: BranchFormValues) => {
    try {
      if (editingId) {
        await apiFetch(`/settings/branches/${editingId}`, { method: "PUT", body: JSON.stringify(values) });
        toast({ title: "تم التعديل", description: "تم تعديل الفرع بنجاح" });
      } else {
        const res: any = await createMut.mutateAsync(values);
        const row = res?.data && res.data.id ? res.data : res;
        toast({ title: "تمت الإضافة", description: "تمت إضافة الفرع بنجاح" });
        onCreated?.(row);
      }
      onSaved?.();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشلت العملية", variant: "destructive" });
    }
  };

  return (
    <FormShell
      key={`${editingId ?? "new"}:${firstCompanyId}`}
      schema={branchFormSchema}
      defaultValues={defaultValues}
      submitLabel={editingId ? "تحديث الفرع" : "إضافة الفرع"}
      secondaryActions={
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          إلغاء
        </Button>
      }
      onSubmit={async (values) => { await handleSave(values); }}
    >
      <FormGrid cols={2}>
        <FormSelectField name="companyId" label="الشركة" required options={companyOptions} />
        <FormTextField name="name" label="اسم الفرع (عربي)" required placeholder="مثال: الفرع الرئيسي - الرياض" />
        <FormTextField name="nameEn" label="اسم الفرع (إنجليزي)" placeholder="الفرع الرئيسي — الرياض" />
        <FormTextField name="city" label="المدينة" placeholder="الرياض" />
        <FormTextField name="phone" label="الهاتف" placeholder="+966 11 xxx xxxx" />
      </FormGrid>
    </FormShell>
  );
}
