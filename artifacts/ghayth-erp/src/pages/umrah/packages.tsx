import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { Package, Check, X, Plus, Pencil, Trash2 } from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@/components/page-shell";
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

interface PackageForm {
  name: string;
  seasonId: string;
  costPrice: string;
  sellPrice: string;
  duration: string;
  description: string;
  includesTransport: boolean;
  includesHotel: boolean;
  includesMeals: boolean;
  includesZiyarat: boolean;
}

const emptyForm: PackageForm = {
  name: "", seasonId: "", costPrice: "", sellPrice: "", duration: "7",
  description: "", includesTransport: false, includesHotel: false,
  includesMeals: false, includesZiyarat: false,
};

const BoolIcon = ({ v }: { v?: boolean }) => v ? <Check className="h-4 w-4 text-green-600 mx-auto" /> : <X className="h-4 w-4 text-gray-300 mx-auto" />;

export default function UmrahPackages() {
  const { toast } = useToast();
  const packagesQ = useApiQuery<any>(["umrah-packages"], "/umrah/packages");
  const seasonsQ = useApiQuery<any>(["umrah-seasons"], "/umrah/seasons");
  const rows = asList(packagesQ.data?.data || packagesQ.data);
  const seasons = asList(seasonsQ.data?.data || seasonsQ.data);

  const [editing, setEditing] = useState<UmrahPackage | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<PackageForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const createMut = useApiMutation<any, any>("/umrah/packages", "POST", [["umrah-packages"]], {
    onSuccess: () => { packagesQ.refetch(); closeDialog(); toast({ title: "تم إنشاء الباقة بنجاح" }); },
  });
  const updateMut = useApiMutation<any, any>(() => `/umrah/packages/${editing?.id}`, "PATCH", [["umrah-packages"]], {
    onSuccess: () => { packagesQ.refetch(); closeDialog(); toast({ title: "تم تحديث الباقة بنجاح" }); },
  });
  const deleteMut = useApiMutation<any, any>(() => `/umrah/packages/${deleteId}`, "DELETE", [["umrah-packages"]], {
    onSuccess: () => { packagesQ.refetch(); setDeleteId(null); toast({ title: "تم حذف الباقة" }); },
  });

  function openCreate() {
    setForm(emptyForm);
    setEditing({} as UmrahPackage);
    setIsNew(true);
  }

  function openEdit(pkg: UmrahPackage) {
    setForm({
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
    setEditing(pkg);
    setIsNew(false);
  }

  function closeDialog() {
    setEditing(null);
    setIsNew(false);
  }

  function handleSubmit() {
    const payload = {
      name: form.name,
      seasonId: form.seasonId ? Number(form.seasonId) : undefined,
      costPrice: form.costPrice ? Number(form.costPrice) : 0,
      sellPrice: form.sellPrice ? Number(form.sellPrice) : 0,
      duration: form.duration ? Number(form.duration) : 7,
      description: form.description || undefined,
      includesTransport: form.includesTransport,
      includesHotel: form.includesHotel,
      includesMeals: form.includesMeals,
      includesZiyarat: form.includesZiyarat,
    };
    if (isNew) createMut.mutate(payload);
    else updateMut.mutate(payload);
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
        return <Badge className={v === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>{v === "active" ? "نشطة" : v === "inactive" ? "غير نشطة" : v || "-"}</Badge>;
      }
    },
    {
      key: "id" as any, header: "", render: (r) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
        </div>
      ),
    },
  ];

  if (packagesQ.isLoading) return <LoadingSpinner />;
  if (packagesQ.isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <PageShell title="باقات العمرة" breadcrumbs={[{ label: "العمرة" }, { label: "الباقات" }]}>
      <UmrahTabsNav />
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">إدارة باقات العمرة والأسعار والتفاصيل</p>
        <Button onClick={openCreate}><Plus className="h-4 w-4 ml-2" />إضافة باقة</Button>
      </div>
      <DataTable columns={columns} data={rows} isLoading={packagesQ.isLoading} isError={packagesQ.isError} error={packagesQ.error} />

      <Dialog open={!!editing} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{isNew ? "إضافة باقة جديدة" : "تعديل الباقة"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>اسم الباقة *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>الموسم</Label>
              <Select value={form.seasonId} onValueChange={(v) => setForm({ ...form, seasonId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر الموسم" /></SelectTrigger>
                <SelectContent>
                  {seasons.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>سعر التكلفة</Label>
                <Input type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
              </div>
              <div>
                <Label>سعر البيع</Label>
                <Input type="number" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>المدة (أيام)</Label>
              <Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
            </div>
            <div>
              <Label>الوصف</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={form.includesTransport} onCheckedChange={(v) => setForm({ ...form, includesTransport: v })} />
                <Label>يشمل النقل</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.includesHotel} onCheckedChange={(v) => setForm({ ...form, includesHotel: v })} />
                <Label>يشمل الفندق</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.includesMeals} onCheckedChange={(v) => setForm({ ...form, includesMeals: v })} />
                <Label>يشمل الوجبات</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.includesZiyarat} onCheckedChange={(v) => setForm({ ...form, includesZiyarat: v })} />
                <Label>يشمل الزيارات</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending || updateMut.isPending}>
              {createMut.isPending || updateMut.isPending ? "جاري الحفظ..." : isNew ? "إنشاء" : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p>هل أنت متأكد من حذف هذه الباقة؟ لا يمكن حذف باقة مرتبطة بمعتمرين.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteMut.mutate({})} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "جاري الحذف..." : "حذف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
