import { useState, useEffect } from "react";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Plus, X, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/contexts/app-context";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

export function BranchesTab() {
  const { refreshFilters } = useAppContext();
  const { data: companiesResp, isLoading: companiesLoading, isError: companiesError } = useApiQuery<any>(["settings-companies"], "/settings/companies");
  const companies = asList(companiesResp);
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [filterCompanyId, setFilterCompanyId] = useState<number | "">( "");
  const [form, setForm] = useState({ name: "", nameEn: "", city: "", phone: "", companyId: "" });
  const items = asList(data);
  const filteredItems = filterCompanyId
    ? items.filter((b: any) => b.companyId === filterCompanyId)
    : items;

  const resetForm = () => {
    setForm({ name: "", nameEn: "", city: "", phone: "", companyId: companies[0]?.id?.toString() || "" });
    setEditingId(null);
    setShowForm(false);
  };

  useEffect(() => {
    if (companies.length > 0 && !form.companyId) {
      setForm((f) => ({ ...f, companyId: companies[0]?.id?.toString() || "" }));
    }
  }, [companies]);

  const branchColumns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "اسم الفرع",
      sortable: true,
      searchable: true,
      render: (r: any) => (
        <div className="font-medium">
          {r.name}
          {r.nameEn && <span className="text-gray-400 text-xs me-2 block">{r.nameEn}</span>}
        </div>
      ),
    },
    ...(companies.length > 1
      ? [{
          key: "companyId",
          header: "الشركة",
          sortable: true,
          render: (r: any) => (
            <span className="text-gray-500">
              {companies.find((c: any) => c.id === r.companyId)?.name || "-"}
            </span>
          ),
        }]
      : []),
    { key: "city", header: "المدينة", sortable: true, searchable: true, render: (r: any) => <span className="text-gray-500">{r.city || "-"}</span> },
    { key: "phone", header: "الهاتف", render: (r: any) => <span className="text-gray-500">{r.phone || "-"}</span> },
    {
      key: "actions",
      header: "إجراءات",
      width: "100px",
      render: (r: any) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => handleEdit(r)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => { if (confirm("هل أنت متأكد من حذف هذا الفرع؟ سيؤثر ذلك على جميع البيانات المرتبطة به.")) handleDelete(r.id); }}
            disabled={deleting === r.id}
            title="حذف"
            className="text-red-500 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading || companiesLoading) return <DataTable columns={branchColumns} data={[]} isLoading={true} searchPlaceholder={null} noToolbar />;
  if (isError || companiesError) return <DataTable columns={branchColumns} data={[]} isError={true} onRetry={() => window.location.reload()} searchPlaceholder={null} noToolbar />;

  const handleEdit = (item: any) => {
    setForm({
      name: item.name || "",
      nameEn: item.nameEn || "",
      city: item.city || "",
      phone: item.phone || "",
      companyId: item.companyId?.toString() || "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "خطأ", description: "اسم الفرع مطلوب", variant: "destructive" });
      return;
    }
    try {
      if (editingId) {
        await apiFetch(`/settings/branches/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        toast({ title: "تم التعديل", description: "تم تعديل الفرع بنجاح" });
      } else {
        await apiFetch("/settings/branches", {
          method: "POST",
          body: JSON.stringify(form),
        });
        toast({ title: "تمت الإضافة", description: "تمت إضافة الفرع بنجاح" });
      }
      resetForm();
      refetch();
      refreshFilters();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشلت العملية", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await apiFetch(`/settings/branches/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      refetch();
      refreshFilters();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل الحذف", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Building className="h-5 w-5" />
          إدارة الفروع
        </h3>
        <Button size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />فرع جديد</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{editingId ? "تعديل الفرع" : "إضافة فرع جديد"}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>الشركة <span className="text-red-500">*</span></Label>
              <select
                className="w-full border rounded-md p-2"
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
              >
                <option value="">اختر شركة</option>
                {companies.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>اسم الفرع (عربي) <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: الفرع الرئيسي - الرياض" />
            </div>
            <div>
              <Label>اسم الفرع (إنجليزي)</Label>
              <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} placeholder="الفرع الرئيسي — الرياض" />
            </div>
            <div>
              <Label>المدينة</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="الرياض" />
            </div>
            <div>
              <Label>الهاتف</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+966 11 xxx xxxx" />
            </div>
            <div className="md:col-span-2">
              <Button onClick={handleSave} rateLimitAware>{editingId ? "تحديث الفرع" : "إضافة الفرع"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {companies.length > 1 && (
        <div className="flex items-center gap-2">
          <Label className="shrink-0">تصفية بالشركة:</Label>
          <select
            className="border rounded-md p-1.5 text-sm"
            value={filterCompanyId}
            onChange={(e) => setFilterCompanyId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">جميع الشركات</option>
            {companies.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <DataTable
        columns={branchColumns}
        data={filteredItems}
        searchPlaceholder="بحث في الفروع..."
        emptyMessage="لا توجد فروع"
        pageSize={0}
      />
    </div>
  );
}
