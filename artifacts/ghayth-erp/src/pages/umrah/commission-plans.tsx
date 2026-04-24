import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageShell } from "@/components/page-shell";
import { PageStateWrapper } from "@/components/shared/page-state";
import { GuardedButton } from "@/components/shared/permission-gate";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { Plus, Eye, Pencil, CheckCircle2, Ban, Trash2, Briefcase } from "lucide-react";

type PlanStatus = "active" | "suspended" | "expired" | "pending";
type CommissionType = "percentage" | "fixed" | "tiered" | "mixed";

interface CommissionPlan {
  id: number;
  employeeId: number;
  employeeName?: string;
  assignmentId?: number;
  seasonId: number;
  seasonTitle?: string;
  planName: string;
  status: PlanStatus;
  baseSalary: number;
  commissionType: CommissionType;
  tierCount?: number;
  approvedAt?: string | null;
  createdAt?: string;
}

const STATUS_LABEL: Record<PlanStatus, { label: string; cls: string }> = {
  active: { label: "مفعّل", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  suspended: { label: "موقوف", cls: "bg-red-100 text-red-700 border-red-200" },
  expired: { label: "منتهي", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  pending: { label: "بانتظار الاعتماد", cls: "bg-amber-100 text-amber-700 border-amber-200" },
};

const TYPE_LABEL: Record<CommissionType, string> = {
  percentage: "نسبة مئوية",
  fixed: "مبلغ ثابت",
  tiered: "شرائح",
  mixed: "مختلط",
};

export default function UmrahCommissionPlans() {
  // TODO: endpoint not yet implemented — placeholder response
  const plansQ = useApiQuery<{ data: CommissionPlan[] }>(["umrah-commission-plans"], "/umrah/commission-plans");
  const employeesQ = useApiQuery<{ data: any[] }>(["employees"], "/employees");
  const seasonsQ = useApiQuery<{ data: any[] }>(["umrah-seasons"], "/umrah/seasons");

  const plans = plansQ.data?.data ?? [];
  const employees = employeesQ.data?.data ?? [];
  const seasons = seasonsQ.data?.data ?? [];

  const [empFilter, setEmpFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [seasonFilter, setSeasonFilter] = useState<string>("");
  const [confirmAction, setConfirmAction] = useState<{ type: "activate" | "suspend" | "delete"; plan: CommissionPlan } | null>(null);

  const actionMut = useApiMutation<any, { id: number; action: "activate" | "suspend" }>(
    (body) => `/umrah/commission-plans/${body.id}/${body.action}`,
    "POST",
    [["umrah-commission-plans"]],
    { successMessage: "تم تنفيذ الإجراء", onSuccess: () => setConfirmAction(null) },
  );

  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `/umrah/commission-plans/${body.id}`,
    "DELETE",
    [["umrah-commission-plans"]],
    { successMessage: "تم حذف الخطة", onSuccess: () => setConfirmAction(null) },
  );

  const filtered = useMemo(() => {
    return plans.filter((p) => {
      if (empFilter && String(p.employeeId) !== empFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      if (seasonFilter && String(p.seasonId) !== seasonFilter) return false;
      return true;
    });
  }, [plans, empFilter, statusFilter, seasonFilter]);

  const counts = useMemo(() => ({
    total: plans.length,
    active: plans.filter((p) => p.status === "active").length,
    suspended: plans.filter((p) => p.status === "suspended").length,
    pending: plans.filter((p) => p.status === "pending").length,
  }), [plans]);

  const columns: DataTableColumn<CommissionPlan>[] = [
    {
      key: "employeeName",
      header: "الموظف",
      render: (p) => <span className="font-medium">{p.employeeName ?? `#${p.employeeId}`}</span>,
    },
    {
      key: "planName",
      header: "اسم الخطة",
    },
    {
      key: "seasonTitle",
      header: "الموسم",
      render: (p) => p.seasonTitle ?? "—",
    },
    {
      key: "status",
      header: "الحالة",
      render: (p) => {
        const s = STATUS_LABEL[p.status] ?? STATUS_LABEL.active;
        return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
      },
    },
    {
      key: "baseSalary",
      header: "الراتب الأساسي",
      render: (p) => formatCurrency(Number(p.baseSalary)),
    },
    {
      key: "commissionType",
      header: "نوع العمولة",
      render: (p) => TYPE_LABEL[p.commissionType] ?? p.commissionType,
    },
    {
      key: "tierCount",
      header: "عدد الشرائح",
      render: (p) => p.tierCount != null ? formatNumber(p.tierCount) : "—",
    },
    {
      key: "approvedAt",
      header: "تاريخ الاعتماد",
      render: (p) => p.approvedAt ? formatDateAr(p.approvedAt) : "—",
    },
    {
      key: "__actions",
      header: "إجراءات",
      render: (p) => (
        <div className="flex items-center gap-1">
          <Button asChild size="sm" variant="ghost">
            <Link href={`/umrah/commission-plans/${p.id}/edit`}>
              <Eye className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <GuardedButton perm="umrah:write" size="sm" variant="ghost" asChild>
            <Link href={`/umrah/commission-plans/${p.id}/edit`}>
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </GuardedButton>
          {p.status === "suspended" && (
            <GuardedButton
              perm="umrah:write"
              size="sm"
              variant="outline"
              className="text-emerald-700"
              onClick={() => setConfirmAction({ type: "activate", plan: p })}
            >
              <CheckCircle2 className="h-3.5 w-3.5 ms-1" />
              تفعيل
            </GuardedButton>
          )}
          {p.status === "active" && (
            <GuardedButton
              perm="umrah:write"
              size="sm"
              variant="outline"
              className="text-red-700"
              onClick={() => setConfirmAction({ type: "suspend", plan: p })}
            >
              <Ban className="h-3.5 w-3.5 ms-1" />
              إيقاف
            </GuardedButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="خطط العمولة"
      subtitle="إدارة خطط عمولة موظفي العمرة والموافقة عليها"
      breadcrumbs={[{ label: "العمرة" }, { label: "خطط العمولة" }]}
      actions={
        <GuardedButton perm="umrah:write" asChild className="gap-2">
          <Link href="/umrah/commission-plans/new">
            <Plus className="h-4 w-4" />
            خطة جديدة
          </Link>
        </GuardedButton>
      }
    >
      <UmrahTabsNav />

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{formatNumber(counts.total)}</p>
            <p className="text-xs text-muted-foreground">إجمالي الخطط</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-700">{formatNumber(counts.active)}</p>
            <p className="text-xs text-muted-foreground">مفعّلة</p>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-700">{formatNumber(counts.pending)}</p>
            <p className="text-xs text-muted-foreground">بانتظار الاعتماد</p>
          </div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="min-w-[220px]">
          <Label className="text-xs">الموظف</Label>
          <Select value={empFilter || "all"} onValueChange={(v) => setEmpFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="كل الموظفين" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الموظفين</SelectItem>
              {employees.map((e: any) => (
                <SelectItem key={e.id} value={String(e.id)}>{e.fullName ?? e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-xs">الحالة</Label>
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="كل الحالات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-xs">الموسم</Label>
          <Select value={seasonFilter || "all"} onValueChange={(v) => setSeasonFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="كل المواسم" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المواسم</SelectItem>
              {seasons.map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <PageStateWrapper
        isLoading={plansQ.isLoading}
        error={plansQ.error}
        onRetry={() => plansQ.refetch()}
      >
        <DataTable
          columns={columns}
          data={filtered}
          emptyMessage="لا توجد خطط عمولة مطابقة"
          pageSize={20}
          noToolbar
        />
      </PageStateWrapper>

      {/* Confirm action dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === "activate" && "تفعيل الخطة"}
              {confirmAction?.type === "suspend" && "إيقاف الخطة"}
              {confirmAction?.type === "delete" && "حذف الخطة"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmAction?.type === "activate" && "سيتم تفعيل هذه الخطة واحتسابها عند توليد مسيّر الرواتب."}
            {confirmAction?.type === "suspend" && "سيتم إيقاف الخطة ولن تُحتسب في دورة الرواتب القادمة."}
            {confirmAction?.type === "delete" && "سيتم حذف الخطة نهائياً — لا يمكن التراجع."}
          </p>
          {confirmAction && (
            <div className="bg-muted/30 rounded p-3 text-sm">
              <p><span className="text-muted-foreground">الموظف:</span> <strong>{confirmAction.plan.employeeName}</strong></p>
              <p><span className="text-muted-foreground">الخطة:</span> <strong>{confirmAction.plan.planName}</strong></p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>إلغاء</Button>
            <GuardedButton
              perm="umrah:write"
              variant={confirmAction?.type === "delete" ? "destructive" : "default"}
              disabled={actionMut.isPending || deleteMut.isPending}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "delete") {
                  deleteMut.mutate({ id: confirmAction.plan.id });
                } else {
                  actionMut.mutate({ id: confirmAction.plan.id, action: confirmAction.type });
                }
              }}
            >
              تأكيد
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
