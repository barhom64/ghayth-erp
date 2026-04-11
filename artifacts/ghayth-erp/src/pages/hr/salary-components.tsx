import { useState } from "react";
import { getCurrencySymbol } from "@/lib/formatters";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, DollarSign, TrendingUp, Percent, FileText, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { PaginationBar } from "@/components/data-table-wrapper";

export default function SalaryComponentsPage() {
  const { data } = useApiQuery<any>(["salary-components"], "/hr/salary-components");
  const items = data?.data || [];
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
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
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const filtered = applyFilters(items, filters, { searchFields: ["name", "type", "category"], statusField: "status" });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);
  const paginatedData = sortedData?.slice((page - 1) * pageSize, page * pageSize);
  const allowances = items.filter((c: any) => c.category === "allowance" || !c.category);
  const deductions = items.filter((c: any) => c.category === "deduction");

  return (
    <div className="space-y-6">
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">مكونات الرواتب</h1>
          <p className="text-sm text-muted-foreground mt-0.5">إدارة البدلات والخصومات والمكونات الراتبية</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 me-1" />{showForm ? "إلغاء" : "إضافة مكون"}
        </Button>
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
        onChange={(v) => { setFilters(v); setPage(1); }}
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

      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <SortableTableHead column="name" label="المكون" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="type" label="النوع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="category" label="التصنيف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="value" label="القيمة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="taxable" label="خاضع للضريبة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <TableBody>
            {(paginatedData || []).map((c: any) => (
              <tr key={c.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3">{typeMap[c.type] || c.type}</td>
                <td className="p-3"><Badge className={c.category === "deduction" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>{categoryMap[c.category] || c.category || "بدل"}</Badge></td>
                <td className="p-3 font-medium">{Number(c.value || 0).toLocaleString("ar-SA")} {c.type === "percentage" ? "%" : getCurrencySymbol()}</td>
                <td className="p-3">{c.taxable ? "نعم" : "لا"}</td>
                <td className="p-3"><Badge className={c.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>{c.status === "active" ? "نشط" : "غير نشط"}</Badge></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا توجد مكونات رواتب</td></tr>}
          </TableBody>
        </Table>
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div></div>
    </div>
  );
}
