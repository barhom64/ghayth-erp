import { useState } from "react";
import { z } from "zod";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  FormShell,
  FormGrid,
  FormTextField,
  FormNumberField,
  FormDateField,
} from "@workspace/ui-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Plus } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";

interface TransportEntry {
  id: number;
  tripDate?: string;
  fromLocation?: string;
  toLocation?: string;
  capacity?: number;
  pilgrimCount?: number;
  cost?: number;
  status?: string;
  notes?: string;
  vehiclePlate?: string;
  driverName?: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  scheduled: { label: "مجدولة", color: "bg-status-info-surface text-status-info-foreground" },
  in_progress: { label: "في الطريق", color: "bg-status-warning-surface text-yellow-800" },
  completed: { label: "مكتملة", color: "bg-status-success-surface text-status-success-foreground" },
  cancelled: { label: "ملغاة", color: "bg-status-error-surface text-status-error-foreground" },
};

const columns: DataTableColumn<TransportEntry>[] = [
  { key: "tripDate", header: "تاريخ الرحلة", sortable: true, render: (r) => formatDateAr(r.tripDate) },
  { key: "fromLocation", header: "من", searchable: true },
  { key: "toLocation", header: "إلى", searchable: true },
  { key: "vehiclePlate", header: "المركبة", render: (r) => r.vehiclePlate || "-" },
  { key: "driverName", header: "السائق", render: (r) => r.driverName || "-" },
  { key: "capacity", header: "السعة" },
  { key: "pilgrimCount", header: "المعتمرين" },
  { key: "cost", header: "التكلفة", render: (r) => r.cost ? formatCurrency(Number(r.cost)) : "-" },
  {
    key: "status", header: "الحالة", sortable: true, render: (r) => {
      const s = STATUS_MAP[r.status || ""] || { label: r.status || "-", color: "bg-surface-subtle text-status-neutral-foreground" };
      return <Badge className={s.color}>{s.label}</Badge>;
    }
  },
];

const transportSchema = z.object({
  tripDate: z.string().min(1, "تاريخ الرحلة مطلوب"),
  fromLocation: z.string().min(1, "نقطة الانطلاق مطلوبة"),
  toLocation: z.string().min(1, "نقطة الوصول مطلوبة"),
  capacity: z.string().optional(),
  pilgrimCount: z.string().optional(),
  cost: z.string().optional(),
  notes: z.string().optional(),
});
type TransportForm = z.infer<typeof transportSchema>;

const EMPTY: TransportForm = {
  tripDate: "", fromLocation: "", toLocation: "", capacity: "", pilgrimCount: "", cost: "", notes: "",
};

export default function UmrahTransport() {
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["umrah-transport"], "/umrah/transport");
  const rows = asList(data?.data || data);
  const [, navigate] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const { toast } = useToast();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="النقل والمواصلات"
      subtitle="إدارة رحلات نقل المعتمرين والمواصلات"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "النقل والمواصلات" }]}
      actions={<GuardedButton perm="umrah:create" onClick={() => setShowForm(!showForm)} className="gap-2"><Plus className="h-4 w-4" />رحلة جديدة</GuardedButton>}
    >
      {showForm && (
        <Card>
          <CardContent className="p-4">
            <FormShell
              key={formKey}
              schema={transportSchema}
              defaultValues={EMPTY}
              submitLabel="حفظ"
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
              }
              onSubmit={async (values) => {
                try {
                  await apiFetch("/umrah/transport", {
                    method: "POST",
                    body: JSON.stringify({
                      tripDate: values.tripDate,
                      fromLocation: values.fromLocation,
                      toLocation: values.toLocation,
                      capacity: values.capacity ? Number(values.capacity) : undefined,
                      pilgrimCount: values.pilgrimCount ? Number(values.pilgrimCount) : undefined,
                      cost: values.cost ? Number(values.cost) : undefined,
                      notes: values.notes || undefined,
                    }),
                  });
                  toast({ title: "تم إنشاء رحلة النقل" });
                  setShowForm(false);
                  setFormKey((k) => k + 1);
                  refetch();
                } catch (err: any) {
                  toast({ variant: "destructive", title: err?.message || err?.error || "خطأ في إنشاء الرحلة" });
                }
              }}
            >
              <FormGrid cols={3}>
                <FormDateField name="tripDate" label="تاريخ الرحلة" required />
                <FormTextField name="fromLocation" label="من" required placeholder="مكة" />
                <FormTextField name="toLocation" label="إلى" required placeholder="المدينة" />
                <FormNumberField name="capacity" label="السعة" placeholder="45" />
                <FormNumberField name="pilgrimCount" label="عدد المعتمرين" />
                <FormNumberField name="cost" label="التكلفة" />
                <FormTextField name="notes" label="ملاحظات" className="md:col-span-3" />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(r) => navigate(`/umrah/transport/${r.id}`)}
        emptyMessage="لا توجد رحلات نقل مسجلة"
      />
    </PageShell>
  );
}
