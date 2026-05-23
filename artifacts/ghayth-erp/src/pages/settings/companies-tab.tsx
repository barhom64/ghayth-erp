import { useState } from "react";
import { z } from "zod";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Plus, X, Pencil, Trash2, CheckCircle, Zap } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/contexts/app-context";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { FormShell, FormTextField, FormGrid } from "@/components/form-shell";

// Replaces the old `if (!form.name.trim())` toast guard. Schema also
// trims so leading/trailing whitespace can't slip through.
const companyFormSchema = z.object({
  name: z.string().trim().min(1, "اسم الشركة مطلوب"),
  nameEn: z.string().trim(),
  taxNumber: z.string().trim(),
  crNumber: z.string().trim(),
});
type CompanyForm = z.infer<typeof companyFormSchema>;
const blankCompany: CompanyForm = { name: "", nameEn: "", taxNumber: "", crNumber: "" };

export function CompaniesTab() {
  const { refreshFilters } = useAppContext();
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["settings-companies"], "/settings/companies");
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  // Initial values for the FormShell — switches between blank and the
  // edited row when the user clicks "تعديل". Stored as a single ref-
  // like state so the FormShell `key` prop can re-mount the form on
  // edit-target change (resets dirty/error state cleanly).
  const [formInitial, setFormInitial] = useState<CompanyForm>(blankCompany);
  const [lastBootstrapOps, setLastBootstrapOps] = useState<string[] | null>(null);
  // Delete dialog state — replaces window.confirm() for the most
  // destructive operation in settings.
  const [deletingCompany, setDeletingCompany] = useState<{ id: number; name: string } | null>(null);
  const items = asList(data);

  const companyColumns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "اسم الشركة",
      sortable: true,
      searchable: true,
      render: (r: any) => (
        <div className="font-medium">
          {r.name}
          {r.nameEn && <span className="text-muted-foreground text-xs me-2 block">{r.nameEn}</span>}
        </div>
      ),
    },
    { key: "taxNumber", header: "الرقم الضريبي", searchable: true, render: (r: any) => <span className="text-muted-foreground">{r.vatNumber || "-"}</span> },
    { key: "crNumber", header: "السجل التجاري", searchable: true, render: (r: any) => <span className="text-muted-foreground">{r.crNumber || "-"}</span> },
    {
      key: "actions",
      header: "إجراءات",
      width: "100px",
      render: (r: any) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => handleEdit(r)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => setDeletingCompany({ id: r.id, name: r.name || "—" })}
            disabled={deleting === r.id}
            title="حذف"
            className="text-status-error hover:text-status-error-foreground"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading) return <DataTable columns={companyColumns} data={[]} isLoading={true} searchPlaceholder={null} noToolbar />;
  if (isError) return <DataTable columns={companyColumns} data={[]} isError={true} searchPlaceholder={null} noToolbar />;

  const resetForm = () => {
    setFormInitial(blankCompany);
    setEditingId(null);
    setShowForm(false);
    setLastBootstrapOps(null);
  };

  const handleEdit = (item: any) => {
    setFormInitial({
      name: item.name || "",
      nameEn: item.nameEn || "",
      taxNumber: item.vatNumber || "",
      crNumber: item.crNumber || "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = async (values: CompanyForm) => {
    if (editingId) {
      await apiFetch(`/settings/companies/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(values),
      });
      toast({ title: "تم التعديل", description: "تم تعديل بيانات الشركة بنجاح" });
      resetForm();
    } else {
      const result = await apiFetch<any>("/settings/companies", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setLastBootstrapOps(result.operations || null);
      toast({
        title: "تمت إضافة الشركة بنجاح",
        description: `تم إعداد ${result.operations?.length || 0} إعداد تلقائي`,
      });
      setShowForm(false);
    }
    refetch();
    refreshFilters();
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await apiFetch(`/settings/companies/${id}`, { method: "DELETE" });
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
          <Building2 className="h-5 w-5" />
          إدارة الشركات
        </h3>
        <GuardedButton perm="admin:create" size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />شركة جديدة</>}
        </GuardedButton>
      </div>

      {lastBootstrapOps && (
        <Card className="border-status-success-surface bg-status-success-surface">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-status-success-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-status-success-foreground mb-2">تم إنشاء الشركة مع كامل الإعدادات الافتراضية</p>
                <div className="flex flex-wrap gap-1.5">
                  {lastBootstrapOps.map((op, i) => (
                    <Badge key={i} className="bg-status-success-surface text-status-success-foreground border-status-success-surface text-xs">{op}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {editingId ? <Pencil className="h-4 w-4" /> : <Zap className="h-4 w-4 text-status-info-foreground" />}
              {editingId ? "تعديل بيانات الشركة" : "إنشاء شركة جديدة (تهيئة تلقائية)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormShell
              key={editingId ?? "new"}
              schema={companyFormSchema}
              defaultValues={formInitial}
              submitLabel={editingId ? "تحديث الشركة" : "إنشاء الشركة"}
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
                <FormTextField name="name" label="اسم الشركة (عربي)" required placeholder="مثال: شركة الفيصل التجارية" />
                <FormTextField name="nameEn" label="اسم الشركة (إنجليزي)" placeholder="Al-Faisal Trading Co." />
                <FormTextField name="taxNumber" label="الرقم الضريبي" placeholder="300000000000003" />
                <FormTextField name="crNumber" label="رقم السجل التجاري" placeholder="1010000000" />
              </FormGrid>
              {!editingId && (
                <div className="mt-4 p-3 bg-status-info-surface rounded-lg border border-status-info-surface">
                  <p className="text-sm text-status-info-foreground font-medium mb-1 flex items-center gap-1.5">
                    <Zap className="h-4 w-4" />
                    سيتم إنشاء ما يلي تلقائياً:
                  </p>
                  <p className="text-xs text-status-info-foreground">
                    فرع افتراضي، 10 أنواع إجازات، 3 ورديات، 5 سلاسل موافقات، 6 مكونات رواتب، 26 حساباً محاسبياً، 6 أدوار، 8 بادئات ترقيم، سلم عقوبات، 120+ إعداد
                  </p>
                </div>
              )}
            </FormShell>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={companyColumns}
        data={items}
        searchPlaceholder="بحث في الشركات..."
        emptyMessage="لا توجد شركات مضافة"
        pageSize={0}
      />

      <ConfirmDeleteDialog
        open={deletingCompany !== null}
        onOpenChange={(v) => { if (!v) setDeletingCompany(null); }}
        entity={{
          type: "company",
          id: deletingCompany?.id ?? 0,
          name: deletingCompany?.name ?? "",
        }}
        deletePath={`/settings/companies/${deletingCompany?.id}`}
        invalidateKeys={[["settings-companies"]]}
        successMessage="تم الحذف"
        onDeleted={() => { setDeletingCompany(null); refetch(); refreshFilters(); }}
      />
    </div>
  );
}
