import { useState } from "react";
import { z } from "zod";
import { formatCurrency } from "@/lib/formatters";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { SALARY_COMPONENT_TYPES, SALARY_CATEGORIES } from "@/lib/hr-type-maps";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Plus, DollarSign, TrendingUp, Percent, FileText } from "lucide-react";
import { KpiGrid } from "@/components/shared/kpi-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
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
  const items = data?.data || [];
  const [showForm, setShowForm] = useState(false);
  const createMut = useApiMutation<unknown, SalaryComponentForm>(
    "/hr/salary-components",
    "POST",
    [["salary-components"]],
    { successMessage: "تم إضافة المكون بنجاح" },
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
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="مكونات الرواتب"
      subtitle="إدارة البدلات والخصومات والمكونات الراتبية"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "مكونات الرواتب" }]}
      actions={
        <GuardedButton perm="hr:create" size="sm" onClick={() => setShowForm(!showForm)}>
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
              schema={salaryComponentSchema}
              defaultValues={defaultSalaryComponent}
              submitLabel="حفظ"
              secondaryActions={
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values, ctx) => {
                await createMut.mutateAsync(values);
                ctx.reset();
                setShowForm(false);
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
    </PageShell>
  );
}
