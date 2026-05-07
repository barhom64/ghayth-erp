import { useState } from "react";
import { formatCurrency } from "@/lib/formatters";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { SALARY_COMPONENT_TYPES, SALARY_CATEGORIES } from "@/lib/hr-type-maps";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, DollarSign, TrendingUp, Percent, FileText } from "lucide-react";
import { KpiGrid } from "@/components/shared/kpi-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function SalaryComponentsPage() {
  const { data, isLoading, isError } = useApiQuery<any>(["salary-components"], "/hr/salary-components");
  const items = data?.data || [];
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: "fixed", category: "allowance", value: "", taxable: true });
  // HR-U4 — successMessage + onSuccess بدل buildErrorToast اليدوي.
  const createMut = useApiMutation("/hr/salary-components", "POST", [["salary-components"]], {
    successMessage: "تم إضافة المكون بنجاح",
  });

  const handleSubmit = () => {
    createMut.mutate(
      { ...form, value: Number(form.value) },
      {
        onSuccess: () => {
          setShowForm(false);
          setForm({ name: "", type: "fixed", category: "allowance", value: "", taxable: true });
        },
      },
    );
  };


  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(items, filters, { searchFields: ["name", "type", "category"], statusField: "status" });
  const allowances = items.filter((c: any) => c.category === "allowance" || !c.category);
  const deductions = items.filter((c: any) => c.category === "deduction");

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "المكون", sortable: true, render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "type", header: "النوع", sortable: true, render: (c) => SALARY_COMPONENT_TYPES[c.type] || c.type },
    {
      key: "category",
      header: "التصنيف",
      sortable: true,
      render: (c) => (
        <Badge className={c.category === "deduction" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
          {SALARY_CATEGORIES[c.category] || c.category || "بدل"}
        </Badge>
      ),
    },
    {
      key: "value",
      header: "القيمة",
      sortable: true,
      render: (c) => <span className="font-medium">{c.type === "percentage" ? `${Number(c.value || 0)}%` : formatCurrency(Number(c.value || 0))}</span>,
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
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <PageShell
      title="مكونات الرواتب"
      subtitle="إدارة البدلات والخصومات والمكونات الراتبية"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "مكونات الرواتب" }]}
      actions={
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 me-1" />{showForm ? "إلغاء" : "إضافة مكون"}
        </Button>
      }
    >
      <KpiGrid items={[
        { label: "إجمالي المكونات", value: items.length, icon: FileText, color: "text-blue-600 bg-blue-50" },
        { label: "البدلات", value: allowances.length, icon: TrendingUp, color: "text-green-600 bg-green-50" },
        { label: "الخصومات", value: deductions.length, icon: DollarSign, color: "text-red-600 bg-red-50" },
        { label: "نسبية", value: items.filter((c: any) => c.type === "percentage").length, icon: Percent, color: "text-purple-600 bg-purple-50" },
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
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>الاسم</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>النوع</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">ثابت</SelectItem>
                    <SelectItem value="percentage">نسبة</SelectItem>
                    <SelectItem value="variable">متغير</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>التصنيف</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allowance">بدل</SelectItem>
                    <SelectItem value="deduction">خصم</SelectItem>
                    <SelectItem value="benefit">مزايا</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>القيمة</Label><Input className="mt-1" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
              <div className="flex items-end">
                <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending} rateLimitAware>{createMut.isPending ? "جاري الحفظ..." : "حفظ"}</Button>
              </div>
            </div>
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
