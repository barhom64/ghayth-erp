import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target, Plus, BookOpen, TrendingUp, CheckCircle } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge, resolveStatus } from "@/components/page-status-badge";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { IDP_STATUS } from "@/lib/hr-type-maps";
import {
  FormShell, FormTextField, FormTextareaField, FormSelectField, FormDateField, FormGrid,
} from "@/components/form-shell";

const idpSchema = z.object({
  employeeId: z.string().min(1, "الموظف مطلوب"),
  title: z.string().trim(),
  goals: z.string(),
  skills: z.string(),
  targetDate: z.string(),
  notes: z.string().trim(),
});
type IdpForm = z.infer<typeof idpSchema>;
const defaultIdpForm: IdpForm = {
  employeeId: "", title: "", goals: "", skills: "", targetDate: "", notes: "",
};

const STATUS_OPTIONS = Object.entries(IDP_STATUS).map(([value, { label }]) => ({ value, label }));

export default function IDPPage() {
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useFilters();

  const { data, refetch, isLoading, isError } = useApiQuery<any>(["idp"], "/hr/idp");
  const plans = asList(data?.data || data);

  const { data: employees } = useApiQuery<any>(["employees-active"], "/employees?status=active&limit=200");
  const employeeList = asList(employees?.data || employees);

  const createIdpMut = useApiMutation("/hr/idp", "POST", [["idp"]], {
    successMessage: "تم إنشاء خطة التطوير",
  });
  const updateIdpStatusMut = useApiMutation<unknown, { id: number; status: string }>(
    (b) => `/hr/idp/${b.id}`,
    "PATCH",
    [["idp"]],
    { successMessage: "تم تحديث الحالة" },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleSave = async (values: IdpForm) => {
    const payload = {
      ...values,
      // goals/skills are textareas (one item per line) — splitting
      // happens in the submit handler, not in the schema, so the
      // textarea keeps its raw multi-line value during editing.
      goals: values.goals ? values.goals.split("\n").filter(Boolean) : [],
      skills: values.skills ? values.skills.split("\n").filter(Boolean) : [],
    };
    await createIdpMut.mutateAsync(payload);
    setShowForm(false);
    refetch();
  };

  const handleStatusUpdate = (id: number, status: string) => {
    updateIdpStatusMut.mutate({ id, status }, { onSuccess: () => refetch() });
  };

  const filtered = applyFilters(plans, filters, {
    searchFields: ["employeeName", "title"],
    statusField: "status",
    dateField: "createdAt",
  });

  const stats = {
    total: plans.length,
    planned: plans.filter((p: any) => p.status === "planned").length,
    inProgress: plans.filter((p: any) => p.status === "in_progress").length,
    completed: plans.filter((p: any) => p.status === "completed").length,
  };

  const kpis = [
    { label: "إجمالي الخطط", value: stats.total, icon: Target, color: "text-blue-600 bg-blue-50" },
    { label: "مخطط", value: stats.planned, icon: BookOpen, color: "text-indigo-600 bg-indigo-50" },
    { label: "جارية", value: stats.inProgress, icon: TrendingUp, color: "text-amber-600 bg-amber-50" },
    { label: "مكتملة", value: stats.completed, icon: CheckCircle, color: "text-green-600 bg-green-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.employeeName} color="indigo" />
          <span className="font-medium text-sm">{v.employeeName}</span>
        </div>
      ),
    },
    {
      key: "title",
      header: "عنوان الخطة",
      sortable: true,
      render: (v) => (
        <span className="text-sm">{v.title || "خطة التطوير الفردي"}</span>
      ),
    },
    {
      key: "goals",
      header: "الأهداف",
      render: (v) => {
        const goals = Array.isArray(v.goals)
          ? v.goals
          : typeof v.goals === "string"
            ? (() => { try { return JSON.parse(v.goals || "[]"); } catch { return []; } })()
            : [];
        if (!goals.length) return <span className="text-gray-400">-</span>;
        return (
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs">
              {goals.length} {goals.length === 1 ? "هدف" : "أهداف"}
            </Badge>
          </div>
        );
      },
    },
    {
      key: "skills",
      header: "المهارات",
      render: (v) => {
        const skills = Array.isArray(v.skills)
          ? v.skills
          : typeof v.skills === "string"
            ? (() => { try { return JSON.parse(v.skills || "[]"); } catch { return []; } })()
            : [];
        if (!skills.length) return <span className="text-gray-400">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {skills.slice(0, 2).map((s: string, i: number) => (
              <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{s}</span>
            ))}
            {skills.length > 2 && (
              <span className="text-xs text-gray-400">+{skills.length - 2}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "targetDate",
      header: "التاريخ المستهدف",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-gray-600">
          {formatDateAr(v.targetDate)}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => (
        <Select value={v.status} onValueChange={(val) => handleStatusUpdate(v.id, val)}>
          <SelectTrigger className="w-32 h-7 text-xs" onClick={(e) => e.stopPropagation()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(IDP_STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
  ];

  return (
    <PageShell
      title="خطط التطوير الفردي"
      subtitle="تخطيط مسارات التطوير والنمو الوظيفي للموظفين"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <GuardedButton perm="hr:create" size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          خطة جديدة
        </GuardedButton>
      }
    >
      {/* KPI cards */}
      <KpiGrid items={kpis} />

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو عنوان الخطة...",
          statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد خطط تطوير — أنشئ خطة جديدة للبدء"
        pageSize={20}
      />

      {/* Create dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>خطة تطوير جديدة</DialogTitle>
          </DialogHeader>
          <FormShell
            schema={idpSchema}
            defaultValues={defaultIdpForm}
            submitLabel="حفظ الخطة"
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
            <FormGrid cols={2}>
              <FormSelectField
                name="employeeId"
                label="الموظف"
                required
                options={[
                  { value: "", label: "اختر موظفاً" },
                  ...employeeList.map((e: any) => ({ value: String(e.id), label: e.name })),
                ]}
              />
              <FormTextField name="title" label="عنوان الخطة" placeholder="خطة التطوير الفردي لـ..." />
              <FormTextareaField
                name="goals"
                label="الأهداف (سطر لكل هدف)"
                rows={3}
                className="col-span-2"
              />
              <FormTextareaField
                name="skills"
                label="المهارات المستهدفة (سطر لكل مهارة)"
                rows={2}
                className="col-span-2"
              />
              <FormDateField name="targetDate" label="التاريخ المستهدف" />
              <FormTextField name="notes" label="ملاحظات" />
            </FormGrid>
          </FormShell>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
