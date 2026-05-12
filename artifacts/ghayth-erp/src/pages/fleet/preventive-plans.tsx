import { useState } from "react";
import { z } from "zod";
import { useApiQuery, asList, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Wrench, Plus, AlertCircle, Clock } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  FormShell,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormDateField,
  FormGrid,
} from "@/components/form-shell";

const SERVICE_TYPES: Record<string, string> = {
  oil_change: "تغيير زيت",
  filter: "فلتر",
  tire_rotation: "دوران الإطارات",
  brake_check: "فحص الفرامل",
  battery: "بطارية",
  ac: "مكيف",
  full_service: "صيانة شاملة",
  other: "أخرى",
};

function getDueDays(nextDate?: string): number | null {
  if (!nextDate) return null;
  return Math.round((new Date(nextDate).getTime() - Date.now()) / (24 * 3600 * 1000));
}

function getDueStatus(nextDate?: string): "overdue" | "due_soon" | "ok" | "none" {
  const d = getDueDays(nextDate);
  if (d === null) return "none";
  if (d < 0) return "overdue";
  if (d <= 7) return "due_soon";
  return "ok";
}

const planSchema = z.object({
  vehicleId: z.string().min(1, "المركبة مطلوبة"),
  serviceType: z.string().min(1, "نوع الخدمة مطلوب"),
  intervalKm: z.string(),
  intervalDays: z.string(),
  lastServiceDate: z.string(),
  lastServiceMileage: z.string(),
  nextServiceDate: z.string(),
  estimatedCost: z.string(),
  notes: z.string().trim(),
});
type PlanForm = z.infer<typeof planSchema>;

export default function PreventivePlansPage() {
  const [showForm, setShowForm] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState("__all__");
  const [filters, setFilters] = useFilters();

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["preventive-plans", vehicleFilter],
    `/fleet/preventive-plans${vehicleFilter && vehicleFilter !== "__all__" ? `?vehicleId=${vehicleFilter}` : ""}`
  );
  const plans = asList(data?.data || data);

  const { data: vehicles } = useApiQuery<any>(["fleet-vehicles"], "/fleet/vehicles?limit=200");
  const vehicleList = asList(vehicles?.data || vehicles);

  const createMut = useApiMutation<unknown, Record<string, unknown>>(
    "/fleet/preventive-plans",
    "POST",
    [["preventive-plans"]],
    {
      successMessage: "تم إضافة خطة الصيانة الوقائية",
      onSuccess: () => { setShowForm(false); refetch(); },
    },
  );

  const handleSave = async (values: PlanForm) => {
    await createMut.mutateAsync({
      vehicleId: Number(values.vehicleId),
      serviceType: values.serviceType,
      intervalKm: values.intervalKm ? Number(values.intervalKm) : null,
      intervalDays: values.intervalDays ? Number(values.intervalDays) : null,
      lastServiceDate: values.lastServiceDate,
      lastServiceMileage: values.lastServiceMileage ? Number(values.lastServiceMileage) : null,
      nextServiceDate: values.nextServiceDate,
      estimatedCost: values.estimatedCost ? Number(values.estimatedCost) : 0,
      notes: values.notes,
    });
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const overdueCount = plans.filter((p: any) => getDueStatus(p.nextServiceDate) === "overdue").length;
  const dueSoonCount = plans.filter((p: any) => getDueStatus(p.nextServiceDate) === "due_soon").length;

  const filtered = applyFilters(plans, filters, {
    searchFields: ["plateNumber", "serviceType"],
    statusField: "serviceType",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "plateNumber",
      header: "المركبة",
      sortable: true,
      searchable: true,
      render: (row) => <span className="font-semibold">{row.plateNumber || "-"}</span>,
    },
    {
      key: "serviceType",
      header: "نوع الخدمة",
      sortable: true,
      render: (row) => (
        <Badge variant="outline">{SERVICE_TYPES[row.serviceType] || row.serviceType}</Badge>
      ),
    },
    {
      key: "intervalKm",
      header: "الفترة (كم)",
      sortable: true,
      render: (row) => row.intervalKm ? `${row.intervalKm} كم` : "-",
    },
    {
      key: "intervalDays",
      header: "الفترة (أيام)",
      sortable: true,
      render: (row) => row.intervalDays ? `${row.intervalDays} يوم` : "-",
    },
    {
      key: "lastServiceDate",
      header: "آخر خدمة",
      sortable: true,
      render: (row) => row.lastServiceDate ? row.lastServiceDate.split("T")[0] : "-",
    },
    {
      key: "nextServiceDate",
      header: "الخدمة القادمة",
      sortable: true,
      render: (row) => row.nextServiceDate ? row.nextServiceDate.split("T")[0] : "-",
    },
    {
      key: "dueStatus",
      header: "الحالة",
      render: (row) => {
        const dueDays = getDueDays(row.nextServiceDate);
        const status = getDueStatus(row.nextServiceDate);
        if (status === "overdue") return (
          <div className="flex items-center gap-1">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <Badge className="bg-red-100 text-red-700">متأخر {Math.abs(dueDays!)} يوم</Badge>
          </div>
        );
        if (status === "due_soon") return (
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4 text-yellow-500" />
            <Badge className="bg-yellow-100 text-yellow-700">خلال {dueDays} يوم</Badge>
          </div>
        );
        if (status === "ok") return (
          <Badge className="bg-green-100 text-green-700">{dueDays} يوم</Badge>
        );
        return <span className="text-gray-400">-</span>;
      },
    },
    {
      key: "estimatedCost",
      header: "التكلفة التقديرية",
      sortable: true,
      align: "end",
      render: (row) => row.estimatedCost > 0 ? `${row.estimatedCost} ر.س` : "-",
    },
  ];

  return (
    <PageShell
      title="خطط الصيانة الوقائية"
      subtitle="جدولة الصيانة الدورية لمركبات الأسطول"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "خطط الصيانة الوقائية" }]}
      actions={
        <>
          {overdueCount > 0 && <Badge className="bg-red-100 text-red-700">{overdueCount} متأخر</Badge>}
          {dueSoonCount > 0 && <Badge className="bg-yellow-100 text-yellow-700">{dueSoonCount} قريب</Badge>}
          <GuardedButton perm="fleet:create" onClick={() => setShowForm(!showForm)} size="sm">
            <Plus className="w-4 h-4 me-1" /> إضافة خطة
          </GuardedButton>
        </>
      }
    >
      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">خطة صيانة وقائية جديدة</CardTitle></CardHeader>
          <CardContent>
            <FormShell
              schema={planSchema}
              defaultValues={{
                vehicleId: "",
                serviceType: "oil_change",
                intervalKm: "",
                intervalDays: "",
                lastServiceDate: "",
                lastServiceMileage: "",
                nextServiceDate: "",
                estimatedCost: "",
                notes: "",
              }}
              submitLabel="حفظ"
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values) => {
                await handleSave(values);
              }}
            >
              <FormGrid cols={3}>
                <FormSelectField
                  name="vehicleId"
                  label="المركبة"
                  required
                  options={[
                    { value: "", label: "اختر مركبة" },
                    ...vehicleList.map((v: any) => ({
                      value: String(v.id),
                      label: `${v.plateNumber} — ${v.make} ${v.model}`,
                    })),
                  ]}
                />
                <FormSelectField
                  name="serviceType"
                  label="نوع الخدمة"
                  required
                  options={Object.entries(SERVICE_TYPES).map(([value, label]) => ({ value, label }))}
                />
                <FormNumberField name="intervalDays" label="الفترة (أيام)" placeholder="مثال: 90" />
                <FormNumberField name="intervalKm" label="الفترة (كم)" placeholder="مثال: 5000" />
                <FormDateField name="lastServiceDate" label="آخر خدمة" />
                <FormDateField name="nextServiceDate" label="موعد الخدمة القادمة" />
                <FormNumberField name="estimatedCost" label="التكلفة التقديرية (ر.س)" />
                <FormNumberField name="lastServiceMileage" label="آخر عداد خدمة (كم)" />
                <FormTextField name="notes" label="ملاحظات" />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <AdvancedFilters
        config={{
          showSearch: true,
          searchPlaceholder: "بحث بالمركبة أو نوع الخدمة...",
          statuses: Object.entries(SERVICE_TYPES).map(([value, label]) => ({ value, label })),
          showDateRange: false,
          extraFilters: vehicleList.length > 0 ? [{
            key: "vehicle",
            label: "المركبة",
            options: vehicleList.map((v: any) => ({ value: String(v.id), label: v.plateNumber })),
          }] : [],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد خطط صيانة وقائية"
        emptyIcon={<Wrench className="w-10 h-10 text-gray-300" />}
        rowClassName={(row) => {
          const status = getDueStatus(row.nextServiceDate);
          if (status === "overdue") return "bg-red-50/40";
          if (status === "due_soon") return "bg-yellow-50/40";
          return undefined as any;
        }}
      />
    </PageShell>
  );
}
