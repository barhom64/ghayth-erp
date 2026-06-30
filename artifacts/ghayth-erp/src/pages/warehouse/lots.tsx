import { useMemo, useState } from "react";
import { z } from "zod";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { WarehouseTabsNav } from "@/components/shared/warehouse-tabs-nav";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge, STATUS_MAP } from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn, AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { Package, Plus, ShieldCheck, ShieldX, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDateAr, formatNumber, todayLocal } from "@/lib/formatters";
import { FormShell, FormTextField, FormDateField, FormGrid } from "@workspace/ui-core";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

// خيارات الفلترة مشتقّة من المصدر القانوني للحالات (لا قائمة محلية تنحرف).
const LOT_STATUS_OPTIONS = Object.entries(STATUS_MAP.lot).map(([value, s]) => ({ value, label: s.label }));

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
  const [filters, setFilters] = useFilters();
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [recallTarget, setRecallTarget] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const { data, refetch } = useApiQuery<any>(["warehouse-lots"], `/warehouse/lots`);
  const lots = asList(data?.data || data);
  const filtered = applyFilters(lots, filters, {
    searchFields: ["lotNumber", "productName", "warehouseName"],
    statusField: "status",
  });

  const columns = useMemo<any[]>(() => [
    { key: "lotNumber", header: "رقم الدفعة", cell: (r: any) => <span className="font-mono">{r.lotNumber}</span> },
    { key: "productName", header: "المنتج", cell: (r: any) => r.productName ?? `#${r.productId}` },
    { key: "warehouseName", header: "المخزن", cell: (r: any) => r.warehouseName ?? `#${r.warehouseId}` },
    { key: "quantity", header: "الكمية", cell: (r: any) => formatNumber(Number(r.quantity)) },
    { key: "expiryDate", header: "الصلاحية", cell: (r: any) => r.expiryDate ? formatDateAr(r.expiryDate) : "—" },
    { key: "status", header: "الحالة", cell: (r: any) => <PageStatusBadge status={r.status} domain="lot" /> },
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
      <WarehouseTabsNav />
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث برقم الدفعة أو المنتج أو المخزن...",
          statuses: LOT_STATUS_OPTIONS,
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

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
          <DataTable data={filtered} columns={columns} emptyMessage="لا توجد دفعات" noToolbar />
        </CardContent>
      </Card>

      {/* GAP_MATRIX P1 UI-unification §6.2 — ConfirmActionDialog replaces raw AlertDialog */}
      <ConfirmActionDialog
        open={!!rejectTarget}
        onOpenChange={(o) => { if (!o) { setRejectTarget(null); setReason(""); } }}
        variant="destructive"
        title="رفض الدفعة"
        description='الدفعة ستنتقل إلى "متلف". أدخل سبب الرفض:'
        confirmLabel="تأكيد الرفض"
        disabled={!reason.trim()}
        onConfirm={reject}
      >
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب" className="mt-2" />
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={!!recallTarget}
        onOpenChange={(o) => { if (!o) { setRecallTarget(null); setReason(""); } }}
        variant="destructive"
        title="استدعاء الدفعة"
        description="هذا الإجراء سيمنع بيع الدفعة. أدخل سبب الاستدعاء:"
        confirmLabel="تأكيد الاستدعاء"
        disabled={!reason.trim()}
        onConfirm={recall}
      >
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب" className="mt-2" />
      </ConfirmActionDialog>
    </PageShell>
  );
}
