import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormNumberField,
  FormSelectField,
  FormSwitchField,
} from "@workspace/ui-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { Check, X, Plus, Pencil, Trash2 } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { useToast } from "@/hooks/use-toast";

interface UmrahPackage {
  id: number;
  name?: string;
  seasonId?: number;
  seasonTitle?: string;
  costPrice?: number;
  sellPrice?: number;
  duration?: number;
  description?: string;
  includesTransport?: boolean;
  includesHotel?: boolean;
  includesMeals?: boolean;
  includesZiyarat?: boolean;
  status?: string;
}

const packageFormSchema = z.object({
  name: z.string().min(1, "اسم الباقة مطلوب"),
  seasonId: z.string().optional(),
  costPrice: z.string().optional(),
  sellPrice: z.string().optional(),
  duration: z.string(),
  description: z.string().optional(),
  includesTransport: z.boolean(),
  includesHotel: z.boolean(),
  includesMeals: z.boolean(),
  includesZiyarat: z.boolean(),
});
type PackageForm = z.infer<typeof packageFormSchema>;

const emptyForm: PackageForm = {
  name: "", seasonId: "", costPrice: "", sellPrice: "", duration: "7",
  description: "", includesTransport: false, includesHotel: false,
  includesMeals: false, includesZiyarat: false,
};

const BoolIcon = ({ v }: { v?: boolean }) => v ? <Check className="h-4 w-4 text-status-success-foreground mx-auto" /> : <X className="h-4 w-4 text-gray-300 mx-auto" />;

export default function UmrahPackages() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const packagesQ = useApiQuery<any>(["umrah-packages"], "/umrah/packages");
  const seasonsQ = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const rows = asList(packagesQ.data?.data || packagesQ.data);
  const seasons = asList(seasonsQ.data?.data || seasonsQ.data);

  // editingId discriminates the dialog's three states:
  //   null    → closed
  //   "new"   → create a new package
  //   number  → edit row with that id
  const [editingId, setEditingId] = useState<null | "new" | number>(null);
  const [editingDefaults, setEditingDefaults] = useState<PackageForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const closeDialog = () => setEditingId(null);

  const createMut = useApiMutation<any, any>("/umrah/packages", "POST", [["umrah-packages"]], {
    onSuccess: () => { packagesQ.refetch(); closeDialog(); toast({ title: "تم إنشاء الباقة بنجاح" }); },
  });
  const updateMut = useApiMutation<any, any>(
    () => `/umrah/packages/${typeof editingId === "number" ? editingId : ""}`,
    "PATCH",
    [["umrah-packages"]],
    {
      onSuccess: () => { packagesQ.refetch(); closeDialog(); toast({ title: "تم تحديث الباقة بنجاح" }); },
    },
  );
  const deleteMut = useApiMutation<any, any>(() => `/umrah/packages/${deleteId}`, "DELETE", [["umrah-packages"]], {
    onSuccess: () => { packagesQ.refetch(); setDeleteId(null); toast({ title: "تم حذف الباقة" }); },
  });

  function openCreate() {
    setEditingDefaults(emptyForm);
    setEditingId("new");
  }

  function openEdit(pkg: UmrahPackage) {
    setEditingDefaults({
      name: pkg.name || "",
      seasonId: pkg.seasonId ? String(pkg.seasonId) : "",
      costPrice: pkg.costPrice ? String(pkg.costPrice) : "",
      sellPrice: pkg.sellPrice ? String(pkg.sellPrice) : "",
      duration: pkg.duration ? String(pkg.duration) : "7",
      description: pkg.description || "",
      includesTransport: pkg.includesTransport || false,
      includesHotel: pkg.includesHotel || false,
      includesMeals: pkg.includesMeals || false,
      includesZiyarat: pkg.includesZiyarat || false,
    });
    setEditingId(pkg.id);
  }

  async function handleSubmit(values: PackageForm) {
    const payload = {
      name: values.name,
      seasonId: values.seasonId ? Number(values.seasonId) : undefined,
      costPrice: values.costPrice ? Number(values.costPrice) : 0,
      sellPrice: values.sellPrice ? Number(values.sellPrice) : 0,
      duration: values.duration ? Number(values.duration) : 7,
      description: values.description || undefined,
      includesTransport: values.includesTransport,
      includesHotel: values.includesHotel,
      includesMeals: values.includesMeals,
      includesZiyarat: values.includesZiyarat,
    };
    if (editingId === "new") await createMut.mutateAsync(payload);
    else await updateMut.mutateAsync(payload);
  }

  const columns: DataTableColumn<UmrahPackage>[] = [
    { key: "name", header: "اسم الباقة", sortable: true, searchable: true },
    { key: "seasonTitle", header: "الموسم" },
    { key: "duration", header: "المدة (أيام)" },
    { key: "costPrice", header: "سعر التكلفة", render: (r) => r.costPrice ? formatCurrency(Number(r.costPrice)) : "-" },
    { key: "sellPrice", header: "سعر البيع", render: (r) => r.sellPrice ? formatCurrency(Number(r.sellPrice)) : "-" },
    { key: "includesTransport", header: "نقل", align: "center", render: (r) => <BoolIcon v={r.includesTransport} /> },
    { key: "includesHotel", header: "فندق", align: "center", render: (r) => <BoolIcon v={r.includesHotel} /> },
    { key: "includesMeals", header: "وجبات", align: "center", render: (r) => <BoolIcon v={r.includesMeals} /> },
    { key: "includesZiyarat", header: "زيارات", align: "center", render: (r) => <BoolIcon v={r.includesZiyarat} /> },
    {
      key: "status", header: "الحالة", render: (r) => {
        const v = r.status;
        return <Badge className={v === "active" ? "bg-status-success-surface text-status-success-foreground" : "bg-surface-subtle text-status-neutral-foreground"}>{v === "active" ? "نشطة" : v === "inactive" ? "غير نشطة" : v || "-"}</Badge>;
      }
    },
    {
      key: "id" as any, header: "", render: (r) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-status-error" /></Button>
        </div>
      ),
    },
  ];

  if (packagesQ.isLoading) return <LoadingSpinner />;
  if (packagesQ.isError) return <ErrorState />;

  return (
    <PageShell title="باقات العمرة" breadcrumbs={[{ label: "العمرة" }, { label: "الباقات" }]}>
      <UmrahTabsNav />
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">إدارة باقات العمرة والأسعار والتفاصيل</p>
        <GuardedButton perm="umrah:create" onClick={openCreate}><Plus className="h-4 w-4 ml-2" />إضافة باقة</GuardedButton>
      </div>
      <DataTable columns={columns} data={rows} isLoading={packagesQ.isLoading} isError={packagesQ.isError} error={packagesQ.error} onRowClick={(row) => navigate(`/umrah/packages/${row.id}`)} />

      <Dialog open={editingId !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId === "new" ? "إضافة باقة جديدة" : "تعديل الباقة"}</DialogTitle>
          </DialogHeader>
          <FormShell
            key={String(editingId ?? "closed")}
            schema={packageFormSchema}
            defaultValues={editingDefaults}
            submitLabel={
              createMut.isPending || updateMut.isPending
                ? "جاري الحفظ..."
                : editingId === "new"
                  ? "إنشاء"
                  : "حفظ"
            }
            secondaryActions={
              <Button type="button" variant="outline" onClick={closeDialog}>إلغاء</Button>
            }
            onSubmit={handleSubmit}
          >
            <FormTextField name="name" label="اسم الباقة" required />
            <FormSelectField
              name="seasonId"
              label="الموسم"
              options={seasons.map((s: any) => ({ value: String(s.id), label: s.title }))}
              placeholder="اختر الموسم"
            />
            <FormGrid cols={2}>
              <FormNumberField name="costPrice" label="سعر التكلفة" />
              <FormNumberField name="sellPrice" label="سعر البيع" />
            </FormGrid>
            <FormNumberField name="duration" label="المدة (أيام)" />
            <FormTextareaField name="description" label="الوصف" rows={2} />
            <FormGrid cols={2}>
              <FormSwitchField name="includesTransport" label="يشمل النقل" />
              <FormSwitchField name="includesHotel" label="يشمل الفندق" />
              <FormSwitchField name="includesMeals" label="يشمل الوجبات" />
              <FormSwitchField name="includesZiyarat" label="يشمل الزيارات" />
            </FormGrid>
          </FormShell>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p>هل أنت متأكد من حذف هذه الباقة؟ لا يمكن حذف باقة مرتبطة بمعتمرين.</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <GuardedButton perm="umrah:delete" variant="destructive" onClick={() => deleteMut.mutate({})} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "جاري الحذف..." : "حذف"}
            </GuardedButton>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
