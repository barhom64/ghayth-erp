import { useState } from "react";
import { z } from "zod";
import { useLocation } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Plus, CheckCircle, DollarSign } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  FormShell, FormTextField, FormNumberField, FormSelectField, FormDateField, FormGrid,
} from "@/components/form-shell";

// driverId stays a string so the "—" no-driver option works cleanly.
// vehicleId required (was missing — handleSave had `if (!form.vehicleId)`
// toast). fineAmount coerced to a non-negative number.
const violationSchema = z.object({
  vehicleId: z.string().min(1, "اختر المركبة"),
  driverId: z.string(),
  violationType: z.enum(["speeding", "red_light", "no_seatbelt", "wrong_parking", "phone", "other"]),
  violationDate: z.string(),
  fineAmount: z.coerce.number().min(0, "المبلغ يجب أن يكون 0 أو أكثر"),
  location: z.string().trim(),
  violationNumber: z.string().trim(),
  notes: z.string().trim(),
});
type ViolationForm = z.infer<typeof violationSchema>;

const VIOLATION_TYPES: Record<string, string> = {
  speeding: "تجاوز السرعة",
  red_light: "تجاوز الإشارة الحمراء",
  no_seatbelt: "عدم الحزام",
  wrong_parking: "وقوف خاطئ",
  phone: "استخدام الجوال",
  other: "أخرى",
};

const STATUS_OPTIONS = [
  { value: "pending", label: "غير مدفوعة" },
  { value: "paid", label: "مدفوعة" },
];

export default function TrafficViolationsPage() {
  const [, navigate] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useFilters();

  const { data, isLoading, isError, refetch } = useApiQuery<any>(["traffic-violations"], "/fleet/traffic-violations");
  const violations = asList(data?.data || data);

  const { data: vehicles } = useApiQuery<any>(["fleet-vehicles"], "/fleet/vehicles?limit=200");
  const { data: drivers } = useApiQuery<any>(["fleet-drivers"], "/fleet/drivers?limit=200");
  const vehicleList = asList(vehicles?.data || vehicles);
  const driverList = asList(drivers?.data || drivers);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const pendingFines = violations.filter((v: any) => v.status !== "paid").reduce((s: number, v: any) => s + Number(v.fineAmount || 0), 0);
  const paidFines = violations.filter((v: any) => v.status === "paid").reduce((s: number, v: any) => s + Number(v.fineAmount || 0), 0);

  const handleSave = async (values: ViolationForm) => {
    try {
      await apiFetch("/fleet/traffic-violations", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          vehicleId: Number(values.vehicleId),
          // "none" sentinel becomes null on the server side.
          driverId: values.driverId && values.driverId !== "none" ? Number(values.driverId) : null,
        }),
      });
      toast({ title: "تم تسجيل المخالفة" });
      setShowForm(false);
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  };

  const handlePay = async (id: number) => {
    try { await apiFetch(`/fleet/traffic-violations/${id}/pay`, { method: "PATCH", body: JSON.stringify({}) }); refetch(); toast({ title: "تم تسجيل الدفع" }); }
    catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  const filtered = applyFilters(violations, filters, {
    searchFields: ["plateNumber", "driverName", "violationNumber", "location"],
    statusField: "status",
    dateField: "violationDate",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "plateNumber",
      header: "المركبة",
      sortable: true,
      searchable: true,
      render: (v) => (
        <div>
          <div className="font-medium">{v.plateNumber}</div>
          {v.driverName && <div className="text-xs text-muted-foreground">{v.driverName}</div>}
        </div>
      ),
    },
    {
      key: "violationType",
      header: "نوع المخالفة",
      sortable: true,
      render: (v) => (
        <Badge variant="outline">{VIOLATION_TYPES[v.violationType] || v.violationType}</Badge>
      ),
    },
    {
      key: "violationDate",
      header: "التاريخ",
      sortable: true,
      render: (v) => v.violationDate?.split("T")[0] || "-",
    },
    {
      key: "violationNumber",
      header: "رقم المخالفة",
      sortable: true,
      searchable: true,
      render: (v) => v.violationNumber ? (
        <span className="font-mono text-xs">#{v.violationNumber}</span>
      ) : "-",
    },
    {
      key: "location",
      header: "الموقع",
      searchable: true,
      render: (v) => v.location || "-",
    },
    {
      key: "fineAmount",
      header: "الغرامة",
      sortable: true,
      align: "end",
      render: (v) => (
        <span className="font-bold text-status-error-foreground">{Number(v.fineAmount || 0).toFixed(0)} ر.س</span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => <PageStatusBadge status={v.status === "pending" ? "unpaid" : v.status} domain="traffic_violation" />,
    },
    {
      key: "actions",
      header: "إجراءات",
      align: "center",
      render: (v) => v.status !== "paid" ? (
        <GuardedButton perm="fleet:approve" size="sm" variant="outline" onClick={() => handlePay(v.id)}>
          <DollarSign className="w-3.5 h-3.5 me-1" /> دفع
        </GuardedButton>
      ) : (
        <CheckCircle className="w-4 h-4 text-status-success mx-auto" />
      ),
    },
  ];

  return (
    <PageShell
      title="المخالفات المرورية"
      subtitle="تتبع وإدارة مخالفات مركبات الأسطول"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "المخالفات المرورية" }]}
      actions={
        <GuardedButton perm="fleet:create" onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="w-4 h-4 me-1" /> تسجيل مخالفة
        </GuardedButton>
      }
    >
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 text-center"><div className="text-xl font-bold">{violations.length}</div><div className="text-xs text-muted-foreground">إجمالي المخالفات</div></CardContent></Card>
        <Card className="border-status-error-surface bg-status-error-surface">
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold text-status-error-foreground">{pendingFines.toFixed(0)} ر.س</div>
            <div className="text-xs text-muted-foreground">غرامات غير مدفوعة</div>
          </CardContent>
        </Card>
        <Card className="border-status-success-surface bg-status-success-surface">
          <CardContent className="pt-4 text-center">
            <div className="text-xl font-bold text-status-success-foreground">{paidFines.toFixed(0)} ر.س</div>
            <div className="text-xs text-muted-foreground">غرامات مدفوعة</div>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">تسجيل مخالفة جديدة</CardTitle></CardHeader>
          <CardContent>
            <FormShell
              schema={violationSchema}
              defaultValues={{
                vehicleId: "",
                driverId: "none",
                violationType: "speeding" as const,
                violationDate: new Date().toISOString().split("T")[0],
                fineAmount: 0,
                location: "",
                violationNumber: "",
                notes: "",
              }}
              submitLabel="حفظ"
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values, ctx) => {
                await handleSave(values);
                ctx.reset();
              }}
            >
              <FormGrid cols={3}>
                <FormSelectField
                  name="vehicleId"
                  label="المركبة"
                  required
                  options={[
                    { value: "", label: "اختر مركبة" },
                    ...vehicleList.map((v: any) => ({ value: String(v.id), label: v.plateNumber })),
                  ]}
                />
                <FormSelectField
                  name="driverId"
                  label="السائق"
                  options={[
                    { value: "none", label: "—" },
                    ...driverList.map((d: any) => ({ value: String(d.id), label: d.name })),
                  ]}
                />
                <FormSelectField
                  name="violationType"
                  label="نوع المخالفة"
                  required
                  options={Object.entries(VIOLATION_TYPES).map(([value, label]) => ({ value, label }))}
                />
                <FormDateField name="violationDate" label="تاريخ المخالفة" />
                <FormNumberField name="fineAmount" label="مبلغ الغرامة (ر.س)" placeholder="0" />
                <FormTextField name="violationNumber" label="رقم المخالفة" placeholder="رقم المخالفة الرسمي" />
                <FormTextField name="location" label="الموقع" placeholder="موقع المخالفة" />
                <FormTextField name="notes" label="ملاحظات" />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <AdvancedFilters
        config={{
          showSearch: true,
          searchPlaceholder: "بحث بالمركبة، السائق، رقم المخالفة...",
          statuses: STATUS_OPTIONS,
          showDateRange: true,
          extraFilters: [
            ...(vehicleList.length > 0 ? [{
              key: "violationType",
              label: "نوع المخالفة",
              options: Object.entries(VIOLATION_TYPES).map(([value, label]) => ({ value, label })),
            }] : []),
          ],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد مخالفات مسجلة"
        emptyIcon={<AlertTriangle className="w-10 h-10 text-gray-300" />}
        rowClassName={(v) => v.status === "paid" ? "opacity-60" : undefined as any}
        onRowClick={(row) => navigate(`/fleet/traffic-violations/${row.id}`)}
      />
    </PageShell>
  );
}
