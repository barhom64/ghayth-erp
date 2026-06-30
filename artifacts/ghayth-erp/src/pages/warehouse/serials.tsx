import { useMemo, useState } from "react";
import { z } from "zod";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { WarehouseTabsNav } from "@/components/shared/warehouse-tabs-nav";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge, STATUS_MAP } from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn, AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { Hash, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { FormShell, FormTextField, FormDateField, FormGrid } from "@workspace/ui-core";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// خيارات الحالة (التغيير + الفلترة) مشتقّة من المصدر القانوني للحالات.
const SERIAL_STATUS_OPTIONS = Object.entries(STATUS_MAP.serial).map(([value, s]) => ({ value, label: s.label }));

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
  const [filters, setFilters] = useFilters();

  const { data, refetch } = useApiQuery<any>(["warehouse-serials"], `/warehouse/serials`);
  const serials = asList(data?.data || data);
  const filtered = applyFilters(serials, filters, {
    searchFields: ["serialNumber", "productName", "currentLocation"],
    statusField: "status",
  });

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
    { key: "status", header: "الحالة", cell: (r: any) => <PageStatusBadge status={r.status} domain="serial" /> },
    { key: "warrantyExpiry", header: "انتهاء الضمان", cell: (r: any) => r.warrantyExpiry ? formatDateAr(r.warrantyExpiry) : "—" },
    { key: "currentLocation", header: "الموقع", cell: (r: any) => r.currentLocation ?? "—" },
    { key: "actions", header: "إجراءات", cell: (r: any) => (
      <Select value={r.status} onValueChange={(v) => changeStatus(r.id, v)}>
        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          {SERIAL_STATUS_OPTIONS.map(({ value, label }) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) },
  ], []);

  return (
    <PageShell title="العناصر التسلسلية" 
      actions={<Button onClick={() => setShowForm((v) => !v)}><Plus className="ml-1 h-4 w-4" />تسجيل عنصر</Button>}
    >
      <WarehouseTabsNav />
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث برقم تسلسلي أو منتج أو موقع...",
          statuses: SERIAL_STATUS_OPTIONS,
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
        <DataTable data={filtered} columns={columns} emptyMessage="لا توجد عناصر تسلسلية" noToolbar />
      </CardContent></Card>
    </PageShell>
  );
}
