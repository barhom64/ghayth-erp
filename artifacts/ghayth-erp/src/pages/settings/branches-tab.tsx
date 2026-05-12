import { useState, useEffect, useMemo } from "react";
import { z } from "zod";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Plus, X, Pencil, Trash2 } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/contexts/app-context";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { FormShell, FormTextField, FormSelectField, FormGrid } from "@/components/form-shell";

const branchFormSchema = z.object({
  name: z.string().trim().min(1, "اسم الفرع مطلوب"),
  nameEn: z.string().trim(),
  city: z.string().trim(),
  phone: z.string().trim(),
  companyId: z.string().min(1, "اختر شركة"),
});
type BranchForm = z.infer<typeof branchFormSchema>;

export function BranchesTab() {
  const { refreshFilters } = useAppContext();
  const { data: companiesResp, isLoading: companiesLoading, isError: companiesError } = useApiQuery<any>(["settings-companies"], "/settings/companies");
  const companies = asList(companiesResp);
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [filterCompanyId, setFilterCompanyId] = useState<number | "">("");
  // Default companyId picks the first company; changes when companies
  // load or when the user clicks "تعديل" on an existing branch.
  const [formInitial, setFormInitial] = useState<BranchForm>({
    name: "", nameEn: "", city: "", phone: "", companyId: "",
  });
  const [deletingBranch, setDeletingBranch] = useState<{ id: number; name: string } | null>(null);
  const items = asList(data);
  const filteredItems = filterCompanyId
    ? items.filter((b: any) => b.companyId === filterCompanyId)
    : items;

  // Memoise the company options array so FormSelectField doesn't see a
  // new array reference every render (causes spurious re-mounts).
  const companyOptions = useMemo(
    () => companies.map((c: any) => ({ value: String(c.id), label: c.name })),
    [companies],
  );

  const resetForm = () => {
    setFormInitial({
      name: "", nameEn: "", city: "", phone: "",
      companyId: companies[0]?.id?.toString() || "",
    });
    setEditingId(null);
    setShowForm(false);
  };

  useEffect(() => {
    if (companies.length > 0 && !formInitial.companyId) {
      setFormInitial((f) => ({ ...f, companyId: companies[0]?.id?.toString() || "" }));
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
            onClick={() => setDeletingBranch({ id: r.id, name: r.name || "—" })}
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
  if (isError || companiesError) return <DataTable columns={branchColumns} data={[]} isError={true} searchPlaceholder={null} noToolbar />;

  const handleEdit = (item: any) => {
    setFormInitial({
      name: item.name || "",
      nameEn: item.nameEn || "",
      city: item.city || "",
      phone: item.phone || "",
      companyId: item.companyId?.toString() || "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = async (values: BranchForm) => {
    try {
      if (editingId) {
        await apiFetch(`/settings/branches/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
        toast({ title: "تم التعديل", description: "تم تعديل الفرع بنجاح" });
      } else {
        await apiFetch("/settings/branches", {
          method: "POST",
          body: JSON.stringify(values),
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
        <GuardedButton perm="admin:create" size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />فرع جديد</>}
        </GuardedButton>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{editingId ? "تعديل الفرع" : "إضافة فرع جديد"}</CardTitle>
          </CardHeader>
          <CardContent>
            <FormShell
              key={editingId ?? "new"}
              schema={branchFormSchema}
              defaultValues={formInitial}
              submitLabel={editingId ? "تحديث الفرع" : "إضافة الفرع"}
              secondaryActions={
                <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values) => {
                await handleSave(values);
              }}
            >
              <FormGrid cols={2}>
                <FormSelectField name="companyId" label="الشركة" required options={companyOptions} />
                <FormTextField name="name" label="اسم الفرع (عربي)" required placeholder="مثال: الفرع الرئيسي - الرياض" />
                <FormTextField name="nameEn" label="اسم الفرع (إنجليزي)" placeholder="الفرع الرئيسي — الرياض" />
                <FormTextField name="city" label="المدينة" placeholder="الرياض" />
                <FormTextField name="phone" label="الهاتف" placeholder="+966 11 xxx xxxx" />
              </FormGrid>
            </FormShell>
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

      <ConfirmDeleteDialog
        open={deletingBranch !== null}
        onOpenChange={(v) => { if (!v) setDeletingBranch(null); }}
        entity={{
          type: "branch",
          id: deletingBranch?.id ?? 0,
          name: deletingBranch?.name ?? "",
        }}
        deletePath={`/settings/branches/${deletingBranch?.id}`}
        invalidateKeys={[["settings-branches"]]}
        successMessage="تم الحذف"
        onDeleted={() => { setDeletingBranch(null); refetch(); refreshFilters(); }}
      />
    </div>
  );
}
