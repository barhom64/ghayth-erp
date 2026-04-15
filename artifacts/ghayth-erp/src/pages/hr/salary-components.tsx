import { useState } from "react";
import { getCurrencySymbol } from "@/lib/formatters";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, DollarSign, TrendingUp, Percent, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PageShell } from "@/components/page-shell";

export default function SalaryComponentsPage() {
  const { data } = useApiQuery<any>(["salary-components"], "/hr/salary-components");
  const items = data?.data || [];
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: "fixed", category: "allowance", value: "", taxable: true });
  const createMut = useApiMutation("/hr/salary-components", "POST", [["salary-components"]]);

  const handleSubmit = async () => {
    try {
      await createMut.mutateAsync({ ...form, value: Number(form.value) });
      toast({ title: "تم إضافة المكون بنجاح" });
      setShowForm(false);
      setForm({ name: "", type: "fixed", category: "allowance", value: "", taxable: true });
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const typeMap: Record<string, string> = { fixed: "ثابت", percentage: "نسبة", variable: "متغير" };
  const categoryMap: Record<string, string> = { allowance: "بدل", deduction: "خصم", benefit: "مزايا" };

  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(items, filters, { searchFields: ["name", "type", "category"], statusField: "status" });
  const allowances = items.filter((c: any) => c.category === "allowance" || !c.category);
  const deductions = items.filter((c: any) => c.category === "deduction");

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "المكون", sortable: true, render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "type", header: "النوع", sortable: true, render: (c) => typeMap[c.type] || c.type },
    {
      key: "category",
      header: "التصنيف",
      sortable: true,
      render: (c) => (
        <Badge className={c.category === "deduction" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
          {categoryMap[c.category] || c.category || "بدل"}
        </Badge>
      ),
    },
    {
      key: "value",
      header: "القيمة",
      sortable: true,
      render: (c) => <span className="font-medium">{Number(c.value || 0).toLocaleString("ar-SA")} {c.type === "percentage" ? "%" : getCurrencySymbol()}</span>,
    },
    { key: "taxable", header: "خاضع للضريبة", sortable: true, render: (c) => c.taxable ? "نعم" : "لا" },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (c) => (
        <Badge className={c.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
          {c.status === "active" ? "نشط" : "غير نشط"}
        </Badge>
      ),
    },
  ];

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي المكونات", value: items.length, icon: FileText, color: "text-blue-600 bg-blue-50" },
          { label: "البدلات", value: allowances.length, icon: TrendingUp, color: "text-green-600 bg-green-50" },
          { label: "الخصومات", value: deductions.length, icon: DollarSign, color: "text-red-600 bg-red-50" },
          { label: "نسبية", value: items.filter((c: any) => c.type === "percentage").length, icon: Percent, color: "text-purple-600 bg-purple-50" },
        ].map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
                <select className="w-full border rounded-md p-2 mt-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="fixed">ثابت</option>
                  <option value="percentage">نسبة</option>
                  <option value="variable">متغير</option>
                </select>
              </div>
              <div><Label>التصنيف</Label>
                <select className="w-full border rounded-md p-2 mt-1" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="allowance">بدل</option>
                  <option value="deduction">خصم</option>
                  <option value="benefit">مزايا</option>
                </select>
              </div>
              <div><Label>القيمة</Label><Input className="mt-1" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
              <div className="flex items-end">
                <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending}>{createMut.isPending ? "جاري الحفظ..." : "حفظ"}</Button>
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
