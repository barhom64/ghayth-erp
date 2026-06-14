import { useMemo, useState } from "react";
import { z } from "zod";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Hash, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { FormShell, FormTextField, FormDateField, FormGrid } from "@/components/form-shell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUS_LABELS: Record<string, string> = {
  in_stock: "في المخزن", reserved: "محجوز", sold: "مُباع",
  returned: "مرتجع", defective: "تالف", scrapped: "متلف",
};

const createSchema = z.object({
  productId: z.coerce.number().int().positive("المنتج مطلوب"),
  serialNumber: z.string().min(1, "رقم تسلسلي مطلوب"),
  lotId: z.coerce.number().int().positive().optional(),
  warrantyExpiry: z.string().optional(),
  currentLocation: z.string().optional(),
});
type CreateForm = z.infer<typeof createSchema>;

export default function WarehouseSerialsPage() {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, refetch } = useApiQuery<any>(
    ["warehouse-serials", statusFilter],
    `/warehouse/serials${statusFilter ? `?status=${statusFilter}` : ""}`,
  );
  const serials = asList(data?.data || data);

  async function changeStatus(id: number, status: string) {
    try {
      await apiFetch(`/warehouse/serials/${id}`, {
        method: "PATCH", body: JSON.stringify({ status }),
      });
      toast({ title: "تم تحديث الحالة" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  }

  async function handleCreate(values: CreateForm) {
    try {
      await apiFetch("/warehouse/serials", { method: "POST", body: JSON.stringify(values) });
      toast({ title: "تم تسجيل العنصر" });
      setShowForm(false); refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  }

  const columns = useMemo<any[]>(() => [
    { key: "serialNumber", header: "الرقم التسلسلي", cell: (r: any) => <span className="font-mono">{r.serialNumber}</span> },
    { key: "productName", header: "المنتج", cell: (r: any) => r.productName ?? `#${r.productId}` },
    { key: "lotId", header: "الدفعة", cell: (r: any) => r.lotId ? `#${r.lotId}` : "—" },
    { key: "status", header: "الحالة", cell: (r: any) => <Badge>{STATUS_LABELS[r.status] ?? r.status}</Badge> },
    { key: "warrantyExpiry", header: "انتهاء الضمان", cell: (r: any) => r.warrantyExpiry ? formatDateAr(r.warrantyExpiry) : "—" },
    { key: "currentLocation", header: "الموقع", cell: (r: any) => r.currentLocation ?? "—" },
    { key: "actions", header: "إجراءات", cell: (r: any) => (
      <Select value={r.status} onValueChange={(v) => changeStatus(r.id, v)}>
        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <SelectItem key={v} value={v}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) },
  ], []);

  return (
    <PageShell title="العناصر التسلسلية" 
      actions={<Button onClick={() => setShowForm((v) => !v)}><Plus className="ml-1 h-4 w-4" />تسجيل عنصر</Button>}
    >
      <div className="mb-4 flex gap-2 flex-wrap">
        <Button variant={statusFilter === "" ? "default" : "outline"} size="sm" onClick={() => setStatusFilter("")}>الكل</Button>
        {Object.entries(STATUS_LABELS).map(([v, l]) => (
          <Button key={v} variant={statusFilter === v ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(v)}>{l}</Button>
        ))}
      </div>

      {showForm && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <FormShell
              schema={createSchema}
              defaultValues={{ productId: 0, serialNumber: "", lotId: undefined, warrantyExpiry: "", currentLocation: "" }}
              onSubmit={handleCreate}
              secondaryActions={<Button type="button" variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>}
              submitLabel="تسجيل"
            >
              <FormGrid>
                <FormTextField name="serialNumber" label="الرقم التسلسلي" required />
                <FormTextField name="productId" label="معرف المنتج" type="number" required />
                <FormTextField name="lotId" label="معرف الدفعة (اختياري)" type="number" />
                <FormDateField name="warrantyExpiry" label="انتهاء الضمان" />
                <FormTextField name="currentLocation" label="الموقع الحالي" />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="pt-6">
        <DataTable data={serials} columns={columns} emptyMessage="لا توجد عناصر تسلسلية" />
      </CardContent></Card>
    </PageShell>
  );
}
