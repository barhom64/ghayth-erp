import { useMemo, useState } from "react";
import { z } from "zod";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Package, Plus, ShieldCheck, ShieldX, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDateAr, formatNumber, todayLocal } from "@/lib/formatters";
import { FormShell, FormTextField, FormDateField, FormGrid } from "@/components/form-shell";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_LABELS: Record<string, { label: string; variant: any }> = {
  active:     { label: "نشط",       variant: "default" },
  quarantine: { label: "حجر صحي",   variant: "secondary" },
  expired:    { label: "منتهي",     variant: "destructive" },
  recalled:   { label: "مستدعى",    variant: "destructive" },
  disposed:   { label: "متلف",      variant: "outline" },
};

const receiveSchema = z.object({
  productId: z.coerce.number().int().positive("المنتج مطلوب"),
  warehouseId: z.coerce.number().int().positive("المخزن مطلوب"),
  lotNumber: z.string().min(1, "رقم الدفعة مطلوب"),
  quantity: z.coerce.number().positive("الكمية مطلوبة"),
  unitCost: z.coerce.number().min(0, "التكلفة غير صالحة"),
  receivedDate: z.string().min(1, "تاريخ الاستلام مطلوب"),
  expiryDate: z.string().optional(),
  manufactureDate: z.string().optional(),
  supplierLotRef: z.string().optional(),
});
type ReceiveForm = z.infer<typeof receiveSchema>;

export default function WarehouseLotsPage() {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [recallTarget, setRecallTarget] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const { data, refetch } = useApiQuery<any>(
    ["warehouse-lots", statusFilter],
    `/warehouse/lots${statusFilter ? `?status=${statusFilter}` : ""}`,
  );
  const lots = asList(data?.data || data);

  const columns = useMemo<any[]>(() => [
    { key: "lotNumber", header: "رقم الدفعة", cell: (r: any) => <span className="font-mono">{r.lotNumber}</span> },
    { key: "productName", header: "المنتج", cell: (r: any) => r.productName ?? `#${r.productId}` },
    { key: "warehouseName", header: "المخزن", cell: (r: any) => r.warehouseName ?? `#${r.warehouseId}` },
    { key: "quantity", header: "الكمية", cell: (r: any) => formatNumber(Number(r.quantity)) },
    { key: "expiryDate", header: "الصلاحية", cell: (r: any) => r.expiryDate ? formatDateAr(r.expiryDate) : "—" },
    { key: "status", header: "الحالة", cell: (r: any) => {
      const s = STATUS_LABELS[r.status] ?? { label: r.status, variant: "outline" };
      return <Badge variant={s.variant}>{s.label}</Badge>;
    } },
    { key: "actions", header: "إجراءات", cell: (r: any) => (
      <div className="flex gap-2">
        {r.status === "quarantine" && (
          <>
            <Button size="sm" variant="outline" onClick={() => approve(r.id)}>
              <ShieldCheck className="ml-1 h-3 w-3" /> اعتماد
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setRejectTarget(r.id); setReason(""); }}>
              <ShieldX className="ml-1 h-3 w-3" /> رفض
            </Button>
          </>
        )}
        {r.status === "active" && (
          <Button size="sm" variant="destructive" onClick={() => { setRecallTarget(r.id); setReason(""); }}>
            <AlertTriangle className="ml-1 h-3 w-3" /> استدعاء
          </Button>
        )}
      </div>
    ) },
  ], []);

  async function approve(id: number) {
    try {
      await apiFetch(`/warehouse/lots/${id}/qc-approve`, { method: "POST" });
      toast({ title: "تم اعتماد الدفعة" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  }

  async function reject() {
    if (!rejectTarget || !reason.trim()) return;
    try {
      await apiFetch(`/warehouse/lots/${rejectTarget}/qc-reject`, {
        method: "POST", body: JSON.stringify({ reason }),
      });
      toast({ title: "تم رفض الدفعة" });
      setRejectTarget(null); refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  }

  async function recall() {
    if (!recallTarget || !reason.trim()) return;
    try {
      await apiFetch(`/warehouse/lots/${recallTarget}/recall`, {
        method: "POST", body: JSON.stringify({ reason }),
      });
      toast({ title: "تم استدعاء الدفعة" });
      setRecallTarget(null); refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  }

  async function handleReceive(values: ReceiveForm) {
    try {
      await apiFetch("/warehouse/lots", { method: "POST", body: JSON.stringify(values) });
      toast({ title: "تم استلام الدفعة" });
      setShowForm(false); refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  }

  return (
    <PageShell title="الدفعات المخزنية" 
      actions={<Button onClick={() => setShowForm((v) => !v)}><Plus className="ml-1 h-4 w-4" />استلام دفعة</Button>}
    >
      <div className="mb-4 flex gap-2">
        {["", "active", "quarantine", "expired", "recalled", "disposed"].map((s) => (
          <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm"
            onClick={() => setStatusFilter(s)}>
            {s === "" ? "الكل" : (STATUS_LABELS[s]?.label ?? s)}
          </Button>
        ))}
      </div>

      {showForm && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <FormShell
              schema={receiveSchema}
              defaultValues={{ productId: 0, warehouseId: 0, lotNumber: "", quantity: 0, unitCost: 0,
                receivedDate: todayLocal(), expiryDate: "", manufactureDate: "", supplierLotRef: "" }}
              onSubmit={handleReceive}
              secondaryActions={<Button type="button" variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>}
              submitLabel="استلام"
            >
              <FormGrid>
                <FormTextField name="lotNumber" label="رقم الدفعة" required />
                <FormTextField name="productId" label="معرف المنتج" type="number" required />
                <FormTextField name="warehouseId" label="معرف المخزن" type="number" required />
                <FormTextField name="quantity" label="الكمية" type="number" required />
                <FormTextField name="unitCost" label="تكلفة الوحدة" type="number" required />
                <FormDateField name="receivedDate" label="تاريخ الاستلام" required />
                <FormDateField name="expiryDate" label="تاريخ الانتهاء" />
                <FormDateField name="manufactureDate" label="تاريخ التصنيع" />
                <FormTextField name="supplierLotRef" label="مرجع المورد" />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <DataTable data={lots} columns={columns} emptyMessage="لا توجد دفعات" />
        </CardContent>
      </Card>

      <AlertDialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>رفض الدفعة</AlertDialogTitle>
            <AlertDialogDescription>الدفعة ستنتقل إلى "متلف". أدخل سبب الرفض:</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب" />
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={reject} disabled={!reason.trim()}>تأكيد الرفض</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!recallTarget} onOpenChange={(o) => !o && setRecallTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>استدعاء الدفعة</AlertDialogTitle>
            <AlertDialogDescription>هذا الإجراء سيمنع بيع الدفعة. أدخل سبب الاستدعاء:</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب" />
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={recall} disabled={!reason.trim()}>تأكيد الاستدعاء</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
