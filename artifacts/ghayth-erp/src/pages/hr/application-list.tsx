import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { Plus, Users, UserCheck, Clock, XCircle, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { RECRUITMENT_STAGES } from "@/lib/hr-type-maps";

import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
const STATUS_OPTIONS = Object.entries(RECRUITMENT_STAGES).map(([value, { label }]) => ({ value, label }));

// Quick-hire dialog — collects the handful of extra fields needed by
// POST /hr/recruitment/applications/:id/hire that aren't already on the
// job_applications row (nationality, nationalId, branchId, departmentId,
// salary), then fires the endpoint and navigates to the new employee.
function QuickHireDialog({ app, onClose, onDone }: { app: any; onClose: () => void; onDone: (empId: number) => void }) {
  const [form, setForm] = useState({
    nationality: "", nationalId: "", branchId: "", departmentId: "",
    jobTitle: app?.postingTitle || "", salary: "",
  });
  const hireMut = useApiMutation<{ data: { employeeId: number } }, typeof form>(
    (b) => `/hr/recruitment/applications/${app.id}/hire`,
    "POST",
    [["applicants"]],
    { successMessage: "تم تعيين المرشح وإنشاء الموظف" },
  );
  const submit = () => {
    hireMut.mutate(form, {
      onSuccess: (res) => { onDone((res as any)?.data?.employeeId); },
    });
  };
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader><DialogTitle>تعيين سريع: {app?.name || app?.applicantName}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>المسمى الوظيفي *</Label><Input value={form.jobTitle} onChange={f("jobTitle")} /></div>
          <div><Label>الراتب *</Label><Input type="number" value={form.salary} onChange={f("salary")} /></div>
          <div><Label>الجنسية *</Label><Input value={form.nationality} onChange={f("nationality")} /></div>
          <div><Label>رقم الهوية *</Label><Input value={form.nationalId} onChange={f("nationalId")} /></div>
          <div><Label>رقم الفرع *</Label><Input type="number" value={form.branchId} onChange={f("branchId")} /></div>
          <div><Label>رقم القسم *</Label><Input type="number" value={form.departmentId} onChange={f("departmentId")} /></div>
        </div>
        <DialogFooter>
          <GuardedButton perm="hr:create" onClick={submit} disabled={hireMut.isPending}>
            <Zap className="h-4 w-4 ml-1" />تعيين وإنشاء موظف
          </GuardedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ApplicationListPage() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const [quickHireApp, setQuickHireApp] = useState<any>(null);
  const { data, isLoading, isError } = useApiQuery<any>(["applicants"], "/hr/recruitment/applications");
  const apps = data?.data || [];

  const filtered = applyFilters(apps, filters, {
    searchFields: ["applicantName", "name", "email", "postingTitle"],
    statusField: "status",
    dateField: "createdAt",
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const kpis = [
    { label: "إجمالي المتقدمين", value: apps.length, icon: Users, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "جدد", value: apps.filter((a: any) => (a.status || a.stage) === "new").length, icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "تم توظيفهم", value: apps.filter((a: any) => (a.status || a.stage) === "hired").length, icon: UserCheck, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "مرفوض", value: apps.filter((a: any) => (a.status || a.stage) === "rejected").length, icon: XCircle, color: "text-status-error-foreground bg-status-error-surface" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "applicantName",
      header: "الاسم",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.applicantName || v.name} color="indigo" />
          <span className="font-medium text-sm">{v.applicantName || v.name}</span>
        </div>
      ),
    },
    {
      key: "postingTitle",
      header: "المنصب",
      sortable: true,
      render: (v) => (
        <span className="text-sm text-muted-foreground">{v.postingTitle || v.position || "-"}</span>
      ),
    },
    {
      key: "email",
      header: "البريد",
      render: (v) => (
        <span className="text-sm text-muted-foreground">{v.email || "-"}</span>
      ),
    },
    {
      key: "phone",
      header: "الهاتف",
      render: (v) => (
        <span className="text-sm text-muted-foreground font-mono">{v.phone || "-"}</span>
      ),
    },
    {
      key: "rating",
      header: "التقييم",
      sortable: true,
      render: (v) => {
        if (!v.rating) return <span className="text-muted-foreground">-</span>;
        const r = Number(v.rating);
        return (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              r >= 4 ? "border-status-success-surface text-status-success-foreground bg-status-success-surface" :
              r >= 3 ? "border-status-warning-surface text-status-warning-foreground bg-status-warning-surface" :
              "border-status-error-surface text-status-error-foreground bg-status-error-surface",
            )}
          >
            {r}/5
          </Badge>
        );
      },
    },
    {
      key: "status",
      header: "المرحلة",
      sortable: true,
      render: (v) => {
        const stage = v.status || v.stage;
        const st = RECRUITMENT_STAGES[stage];
        return (
          <Badge variant="outline" className={cn("text-xs", st?.color || "")}>
            {st?.label || stage || "-"}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (v) => {
        // HR-005 — already converted: link straight to the employee file
        // instead of offering a second (now-blocked) conversion.
        if (v.createdEmployeeId) {
          return (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-status-success-foreground"
              onClick={() => navigate(`/employees/${v.createdEmployeeId}`)}
            >
              عرض الموظف
            </Button>
          );
        }
        if ((v.status || v.stage) !== "hired") return null;
        const qs = new URLSearchParams({
          sourceApplicationId: String(v.id),
          name: v.applicantName || v.name || "",
          email: v.email || "",
          phone: v.phone || "",
        }).toString();
        return (
          <div className="flex gap-1 flex-wrap">
            <GuardedButton
              perm="hr:create"
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => setQuickHireApp(v)}
            >
              <Zap className="h-3 w-3 ml-0.5" />تعيين سريع
            </GuardedButton>
            <GuardedButton
              perm="hr:create"
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground"
              onClick={() => navigate(`/employees/create?${qs}`)}
            >
              نموذج كامل
            </GuardedButton>
          </div>
        );
      },
    },
  ];

  return (
    <PageShell
      title="قائمة المتقدمين"
      subtitle="متابعة طلبات التوظيف ومراحل الفرز"
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/recruitment", label: "التوظيف" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_hr_applications"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "قائمة المتقدمين للوظائف", total: printRows.length },
              items: printRows.map((a: any) => ({
                "الاسم": a.applicantName || a.name || "—",
                "الوظيفة": a.postingTitle || a.position || "—",
                "الهاتف": a.phone || "—",
                "البريد": a.email || "—",
                "المصدر": a.source || "—",
                "الحالة": a.status || "—",
                "تاريخ التقديم": a.createdAt || a.appliedAt || "—",
              })),
            })}
          />
          <Link href="/hr/recruitment/applicants/create">
            <GuardedButton perm="hr:create" size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              إضافة متقدم
            </GuardedButton>
          </Link>
        </div>
      }
    >
      <HrTabsNav />
      {/* KPI cards */}
      <KpiGrid items={kpis} />

      {/* Filters */}
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو البريد أو المنصب...",
          statuses: STATUS_OPTIONS,
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "applicantName", label: "اسم المتقدم" },
              { key: "email", label: "البريد" },
              { key: "phone", label: "الهاتف" },
              { key: "jobTitle", label: "المنصب" },
              { key: "stage", label: "المرحلة" },
              { key: "source", label: "مصدر التوظيف" },
              { key: "appliedAt", label: "تاريخ التقديم" },
              { key: "status", label: "الحالة" },
            ],
            "قائمة-المتقدمين",
          )
        }
        resultCount={filtered.length}
      />

      {/* Table */}
      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={filtered}
        noToolbar
        emptyMessage="لا يوجد متقدمين — أضف متقدم جديد للبدء"
        pageSize={20}
      />
      {quickHireApp && (
        <QuickHireDialog
          app={quickHireApp}
          onClose={() => setQuickHireApp(null)}
          onDone={(empId) => { setQuickHireApp(null); navigate(`/employees/${empId}`); }}
        />
      )}
    </PageShell>
  );
}
