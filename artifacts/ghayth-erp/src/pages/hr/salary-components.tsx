import { useState } from "react";
import { z } from "zod";
import { formatCurrency } from "@/lib/formatters";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { SALARY_COMPONENT_TYPES, SALARY_CATEGORIES } from "@/lib/hr-type-maps";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Plus, DollarSign, TrendingUp, Percent, FileText, Pencil, Trash2, Power } from "lucide-react";
import { KpiGrid } from "@/components/shared/kpi-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  FormShell,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormGrid,
} from "@/components/form-shell";

// Zod schema enforces what the old `disabled={!form.name || ...}` guard
// only half-checked. value is coerced from the <input type="number">
// string back to a number (same pattern as inspections/deposits #287).
const salaryComponentSchema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب"),
  calculationType: z.enum(["fixed", "percentage", "formula"]),
  type: z.enum(["earning", "deduction", "benefit"]),
  value: z.coerce
    .number({ invalid_type_error: "أدخل رقمًا صحيحًا" })
    .min(0, "القيمة يجب أن تكون 0 أو أكثر"),
  taxable: z.boolean(),
});
type SalaryComponentForm = z.infer<typeof salaryComponentSchema>;
const defaultSalaryComponent: SalaryComponentForm = {
  name: "",
  calculationType: "fixed",
  type: "earning",
  value: 0,
  taxable: true,
};

export default function SalaryComponentsPage() {
  const { data, isLoading, isError } = useApiQuery<any>(["salary-components"], "/hr/salary-components");
  // The DB row carries `isActive` (boolean); the table + filter key on a
  // string `status`. Derive it once so the status badge and the status
  // filter both reflect reality instead of always reading "inactive".
  const items = (data?.data || []).map((c: any) => ({
    ...c,
    status: c.isActive === false ? "inactive" : "active",
  }));
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);

  const closeForm = () => { setShowForm(false); setEditing(null); };

  const createMut = useApiMutation<unknown, SalaryComponentForm>(
    "/hr/salary-components",
    "POST",
    [["salary-components"]],
    { successMessage: "تم إضافة المكون بنجاح" },
  );
  const updateMut = useApiMutation<unknown, Partial<SalaryComponentForm> & { id: number; isActive?: boolean }>(
    (body) => `/hr/salary-components/${body.id}`,
    "PATCH",
    [["salary-components"]],
    { successMessage: "تم تحديث المكون" },
  );

  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(items, filters, { searchFields: ["name", "type", "calculationType"], statusField: "status" });
  const allowances = items.filter((c: any) => c.type === "earning" || !c.type);
  const deductions = items.filter((c: any) => c.type === "deduction");

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "المكون", sortable: true, render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "calculationType", header: "طريقة الحساب", sortable: true, render: (c) => SALARY_COMPONENT_TYPES[c.calculationType] || c.calculationType },
    {
      key: "type",
      header: "التصنيف",
      sortable: true,
      render: (c) => (
        <Badge className={c.type === "deduction" ? "bg-status-error-surface text-status-error-foreground" : "bg-status-success-surface text-status-success-foreground"}>
          {SALARY_CATEGORIES[c.type] || c.type || "استحقاق"}
        </Badge>
      ),
    },
    {
      key: "value",
      header: "القيمة",
      sortable: true,
      render: (c) => <span className="font-medium">{c.calculationType === "percentage" ? `${Number(c.value || 0)}%` : formatCurrency(Number(c.value || 0))}</span>,
    },
    { key: "taxable", header: "خاضع للضريبة", sortable: true, render: (c) => c.taxable ? "نعم" : "لا" },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (c) => <PageStatusBadge status={c.status || "inactive"} />,
    },
    {
      key: "__actions",
      header: "إجراءات",
      render: (c) => (
        <div className="flex items-center gap-1">
          <GuardedButton
            perm="hr:update"
            size="sm"
            variant="ghost"
            onClick={() => { setEditing(c); setShowForm(true); }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </GuardedButton>
          <GuardedButton
            perm="hr:update"
            size="sm"
            variant="ghost"
            title={c.isActive === false ? "تفعيل" : "تعطيل"}
            onClick={() => updateMut.mutateAsync({ id: c.id, isActive: c.isActive === false })}
          >
            <Power className={`h-3.5 w-3.5 ${c.isActive === false ? "text-muted-foreground" : "text-status-success-foreground"}`} />
          </GuardedButton>
          <GuardedButton
            perm="hr:delete"
            size="sm"
            variant="ghost"
            onClick={() => setDeleting({ id: c.id, name: c.name || "—" })}
          >
            <Trash2 className="h-3.5 w-3.5 text-status-error-foreground" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="مكونات الرواتب"
      subtitle="إدارة البدلات والخصومات والمكونات الراتبية"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "مكونات الرواتب" }]}
      actions={
        <GuardedButton perm="hr:create" size="sm" onClick={() => { if (showForm) { closeForm(); } else { setEditing(null); setShowForm(true); } }}>
          <Plus className="h-4 w-4 me-1" />{showForm ? "إلغاء" : "إضافة مكون"}
        </GuardedButton>
      }
    >
      <KpiGrid items={[
        { label: "إجمالي المكونات", value: items.length, icon: FileText, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "البدلات", value: allowances.length, icon: TrendingUp, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "الخصومات", value: deductions.length, icon: DollarSign, color: "text-status-error-foreground bg-status-error-surface" },
        { label: "نسبية", value: items.filter((c: any) => c.calculationType === "percentage").length, icon: Percent, color: "text-purple-600 bg-purple-50" },
      ]} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو النوع...",
          statuses: [
            { value: "active", label: "نشط" },
            { value: "inactive", label: "غير نشط" },
          ],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      {showForm && (
        <Card className="border-status-info-surface bg-status-info-surface">
          <CardContent className="p-4">
            <FormShell
              key={editing ? `edit-${editing.id}` : "new"}
              schema={salaryComponentSchema}
              defaultValues={editing ? {
                name: editing.name ?? "",
                calculationType: editing.calculationType ?? "fixed",
                type: editing.type ?? "earning",
                value: Number(editing.value ?? 0),
                taxable: editing.taxable ?? editing.isTaxable ?? true,
              } : defaultSalaryComponent}
              submitLabel={editing ? "تحديث" : "حفظ"}
              secondaryActions={
                <Button type="button" size="sm" variant="ghost" onClick={closeForm}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values, ctx) => {
                if (editing) {
                  await updateMut.mutateAsync({ ...values, id: editing.id });
                } else {
                  await createMut.mutateAsync(values);
                }
                ctx.reset();
                closeForm();
              }}
            >
              <FormGrid cols={3}>
                <FormTextField name="name" label="الاسم" required />
                <FormSelectField
                  name="calculationType"
                  label="طريقة الحساب"
                  options={[
                    { value: "fixed", label: "ثابت" },
                    { value: "percentage", label: "نسبة" },
                    { value: "formula", label: "معادلة" },
                  ]}
                />
                <FormSelectField
                  name="type"
                  label="التصنيف"
                  options={[
                    { value: "earning", label: "استحقاق" },
                    { value: "deduction", label: "خصم" },
                    { value: "benefit", label: "مزايا" },
                  ]}
                />
                <FormNumberField name="value" label="القيمة" required />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد مكونات رواتب"
        pageSize={20}
      />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        entity={{ type: "salary_component", id: deleting?.id ?? 0, name: deleting?.name ?? "" }}
        deletePath={`/hr/salary-components/${deleting?.id}`}
        invalidateKeys={[["salary-components"]]}
        successMessage="تم حذف المكون"
        onDeleted={() => setDeleting(null)}
      />
    </PageShell>
  );
}
