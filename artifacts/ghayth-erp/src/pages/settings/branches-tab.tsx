import { useState, useEffect, useMemo } from "react";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Plus, X, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/contexts/app-context";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";

export function BranchesTab() {
  const { refreshFilters } = useAppContext();
  const { data: companiesResp, isLoading: companiesLoading, isError: companiesError } = useApiQuery<any>(["settings-companies"], "/settings/companies");
  const companies = asList(companiesResp);
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ id: number; name: string } | null>(null);
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

  const columns = useMemo<DataTableColumn<any>[]>(() => [
    {
      key: "name",
      header: "اسم الفرع",
      searchable: true,
      render: (item: any) => (
        <div className="font-medium">
          {item.name}
          {item.nameEn && <span className="text-gray-400 text-xs me-2 block">{item.nameEn}</span>}
        </div>
      ),
    },
    {
      key: "companyName",
      header: "الشركة",
      hidden: companies.length <= 1,
      render: (item: any) => (
        <span className="text-gray-500">
          {companies.find((c: any) => c.id === item.companyId)?.name || "-"}
        </span>
      ),
    },
    {
      key: "city",
      header: "المدينة",
      render: (item: any) => <span className="text-gray-500">{item.city || "-"}</span>,
    },
    {
      key: "phone",
      header: "الهاتف",
      render: (item: any) => <span className="text-gray-500">{item.phone || "-"}</span>,
    },
    {
      key: "actions",
      header: "إجراءات",
      width: "6rem",
      align: "start",
      render: (item: any) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => handleEdit(item)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => setDeletingItem({ id: item.id, name: item.name })}
            title="حذف"
            className="text-red-500 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [companies]);

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

  const handleDeleteDone = () => {
    setDeletingItem(null);
    refetch();
    refreshFilters();
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
              <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر شركة" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Button onClick={handleSave}>{editingId ? "تحديث الفرع" : "إضافة الفرع"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {companies.length > 1 && (
        <div className="flex items-center gap-2">
          <Label className="shrink-0">تصفية بالشركة:</Label>
          <Select value={filterCompanyId ? filterCompanyId.toString() : "_all"} onValueChange={(v) => setFilterCompanyId(v === "_all" ? "" : Number(v))}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">جميع الشركات</SelectItem>
              {companies.map((c: any) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filteredItems}
        isLoading={isLoading || companiesLoading}
        isError={isError || companiesError}
        onRetry={() => refetch()}
        searchPlaceholder="بحث في الفروع..."
        emptyMessage="لا توجد فروع"
        emptyIcon={<Building className="h-10 w-10 text-gray-300" />}
        pageSize={0}
        noToolbar
      />

      <ConfirmDeleteDialog
        open={deletingItem !== null}
        onOpenChange={(v) => !v && setDeletingItem(null)}
        entity={{
          type: "branch",
          id: deletingItem?.id ?? 0,
          name: deletingItem?.name ?? "",
        }}
        deletePath={`/settings/branches/${deletingItem?.id}`}
        invalidateKeys={[["settings-branches"]]}
        onDeleted={handleDeleteDone}
      />
    </div>
  );
}
