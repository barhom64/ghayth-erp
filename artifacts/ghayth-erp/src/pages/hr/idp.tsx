import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Target, Plus, BookOpen, TrendingUp, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge, resolveStatus } from "@/components/page-status-badge";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { IDP_STATUS } from "@/lib/hr-type-maps";
import { DatePicker } from "@/components/ui/date-picker";

const STATUS_OPTIONS = Object.entries(IDP_STATUS).map(([value, { label }]) => ({ value, label }));

export default function IDPPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employeeId: "", title: "", goals: "", skills: "", targetDate: "", notes: "" });
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
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const handleSave = () => {
    if (!form.employeeId) { toast({ title: "الموظف مطلوب", variant: "destructive" }); return; }
    const payload = {
      ...form,
      goals: form.goals ? form.goals.split("\n").filter(Boolean) : [],
      skills: form.skills ? form.skills.split("\n").filter(Boolean) : [],
    };
    createIdpMut.mutate(payload, {
      onSuccess: () => {
        setShowForm(false);
        setForm({ employeeId: "", title: "", goals: "", skills: "", targetDate: "", notes: "" });
        refetch();
      },
    });
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
        <Button size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          خطة جديدة
        </Button>
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
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الموظف *</Label>
                <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر موظفاً" /></SelectTrigger>
                  <SelectContent>
                    {employeeList.map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>عنوان الخطة</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="خطة التطوير الفردي لـ..." />
              </div>
            </div>
            <div>
              <Label>الأهداف (سطر لكل هدف)</Label>
              <Textarea value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} placeholder={"هدف 1\nهدف 2\nهدف 3"} rows={3} />
            </div>
            <div>
              <Label>المهارات المستهدفة (سطر لكل مهارة)</Label>
              <Textarea value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder={"مهارة 1\nمهارة 2"} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>التاريخ المستهدف</Label>
                <DatePicker value={form.targetDate} onChange={(v) => setForm({ ...form, targetDate: v })} />
              </div>
              <div>
                <Label>ملاحظات</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={createIdpMut.isPending}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={createIdpMut.isPending}>
              {createIdpMut.isPending ? "جاري الحفظ..." : "حفظ الخطة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
