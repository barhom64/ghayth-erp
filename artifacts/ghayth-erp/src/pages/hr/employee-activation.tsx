import { useState } from "react";
import { formatCurrency, todayLocal } from "@/lib/formatters";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Badge } from "@/components/ui/badge";
import { KpiGrid } from "@/components/shared/kpi-card";
import { GuardedButton } from "@/components/shared/permission-gate";
import { UserCheck, UserX, Users, ToggleLeft, Pause, Play, Ban, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  PageShell,
  exportToCSV,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { PromptDialog } from "@/components/shared/prompt-dialog";
import { useAppContext } from "@/contexts/app-context";

import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
type LifecycleAction = "activate" | "suspend" | "terminate";

const ACTION_CONFIG: Record<LifecycleAction, {
  title: string;
  description: (name: string) => string;
  confirmLabel: string;
  destructive?: boolean;
  requiresReason?: boolean;
}> = {
  activate: {
    title: "تفعيل الموظف",
    description: (name) => `سيتم إعادة تفعيل حساب الموظف "${name}" وإتاحة الوصول للنظام.`,
    confirmLabel: "تفعيل",
  },
  suspend: {
    title: "تعليق الموظف",
    description: (name) =>
      `سيتم تعليق حساب الموظف "${name}" مؤقتًا. لن يستطيع الوصول للنظام حتى إعادة التفعيل.`,
    confirmLabel: "تعليق",
    requiresReason: true,
  },
  terminate: {
    title: "إنهاء خدمة الموظف",
    description: (name) =>
      `سيتم إنهاء خدمة الموظف "${name}" نهائيًا وإغلاق التكليف الحالي. لا يمكن التراجع عن هذا الإجراء تلقائيًا.`,
    confirmLabel: "إنهاء الخدمة",
    destructive: true,
    requiresReason: true,
  },
};

export default function EmployeeActivationPage() {
  const { permissions } = useAppContext();
  const canManage = permissions.canManageEmployees;
  const { toast } = useToast();
  const [filters, setFilters] = useFilters();
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["employees"], "/employees?limit=200");

  const [pending, setPending] = useState<{ action: LifecycleAction; employee: any } | null>(null);

  const onLifecycleSuccess = (action: LifecycleAction) => {
    const msg =
      action === "activate" ? "تم تفعيل الموظف" :
      action === "suspend" ? "تم تعليق الموظف" :
      "تم إنهاء خدمة الموظف";
    toast({ title: msg });
    refetch();
    setPending(null);
  };

  const patchMutation = useApiMutation<any, { id: number; status: string; statusReason?: string; action: LifecycleAction }>(
    (body) => `/employees/${body.id}`,
    "PATCH",
    [["employees"]],
    {
      successMessage: false,
      onSuccess: (_d, body) => onLifecycleSuccess(body.action),
    },
  );

  const terminateMutation = useApiMutation<any, { id: number; reason: string; action: LifecycleAction }>(
    (body) => `/employees/${body.id}`,
    "DELETE",
    [["employees"]],
    {
      successMessage: false,
      onSuccess: (_d, body) => onLifecycleSuccess(body.action),
    },
  );

  const lifecyclePending = patchMutation.isPending || terminateMutation.isPending;

  // HR-REV-3 (#2222) — تفعيل سريع: ينشئ موظفًا بحالة "غير مفعّل" مع خطة المهام.
  const today = todayLocal();
  const emptyQuickForm = {
    name: "",
    phone: "",
    nationalId: "",
    nationality: "",
    departmentId: "",
    jobTitle: "",
    hireDate: today,
  };
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickForm, setQuickForm] = useState(emptyQuickForm);

  const quickActivateMutation = useApiMutation<any, Record<string, any>>(
    "/employees/quick-activate",
    "POST",
    [["employees"]],
    {
      successMessage: false,
      onSuccess: () => {
        toast({ title: 'تم إنشاء الموظف بحالة "غير مفعّل" مع خطة المهام — فعّله من القائمة' });
        setQuickOpen(false);
        setQuickForm(emptyQuickForm);
        refetch();
      },
    },
  );

  const setQuickField = (key: keyof typeof emptyQuickForm, value: string) =>
    setQuickForm((f) => ({ ...f, [key]: value }));

  const submitQuickActivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickForm.name.trim()) return;
    const body: Record<string, any> = {
      name: quickForm.name.trim(),
      hireDate: quickForm.hireDate || undefined,
    };
    if (quickForm.phone.trim()) body.phone = quickForm.phone.trim();
    if (quickForm.nationalId.trim()) body.nationalId = quickForm.nationalId.trim();
    if (quickForm.nationality.trim()) body.nationality = quickForm.nationality.trim();
    if (quickForm.departmentId.trim()) body.departmentId = Number(quickForm.departmentId);
    if (quickForm.jobTitle.trim()) body.jobTitle = quickForm.jobTitle.trim();
    quickActivateMutation.mutate(body);
  };

  const employees = data?.data || [];

  const filtered = applyFilters(employees, filters, {
    searchFields: ["name", "empNumber"],
    statusField: "status",
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;


  const active = employees.filter((e: any) => e.status === "active").length;
  const inactive = employees.filter((e: any) => e.status !== "active").length;
  const suspended = employees.filter((e: any) => e.status === "suspended").length;

  const kpis = [
    { label: "إجمالي الموظفين", value: employees.length, icon: Users, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "نشطين", value: active, icon: UserCheck, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "غير نشطين", value: inactive, icon: UserX, color: "text-status-error-foreground bg-status-error-surface" },
    { label: "معلقين", value: suspended, icon: ToggleLeft, color: "text-status-warning-foreground bg-status-warning-surface" },
  ];

  const openConfirm = (action: LifecycleAction, employee: any) => {
    setPending({ action, employee });
  };

  // Activate has no reason field — fires directly from the confirm
  // AlertDialog. Suspend/terminate route through PromptDialog which
  // captures the reason inline.
  const confirmActivate = () => {
    if (!pending) return;
    patchMutation.mutate({
      id: pending.employee.id,
      status: "active",
      action: "activate",
    });
  };

  const confirmWithReason = (reason: string) => {
    if (!pending) return;
    if (pending.action === "terminate") {
      terminateMutation.mutate({ id: pending.employee.id, reason, action: "terminate" });
    } else {
      // suspend
      patchMutation.mutate({
        id: pending.employee.id,
        status: "suspended",
        statusReason: reason,
        action: "suspend",
      });
    }
  };

  const columns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "الموظف",
      sortable: true,
      render: (e) => (
        <div className="flex items-center gap-2">
          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold", e.status === "active" ? "bg-status-success-surface text-status-success-foreground" : "bg-status-error-surface text-status-error-foreground")}>
            {(e.name || "؟").charAt(0)}
          </div>
          <span className="font-medium">{e.name}</span>
        </div>
      ),
    },
    {
      key: "empNumber",
      header: "الرقم الوظيفي",
      sortable: true,
      className: "text-muted-foreground font-mono",
      render: (e) => e.empNumber || "-",
    },
    {
      key: "jobTitle",
      header: "المنصب",
      sortable: true,
      render: (e) => e.jobTitle || "-",
    },
    {
      key: "branchName",
      header: "الفرع",
      sortable: true,
      className: "text-muted-foreground",
      render: (e) => e.branchName || "-",
    },
    {
      key: "salary",
      header: "الراتب",
      sortable: true,
      render: (e) => formatCurrency(Number(e.salary || 0)),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (e) => (
        <Badge className={
          e.status === "active" ? "bg-status-success-surface text-status-success-foreground" :
          e.status === "terminated" ? "bg-status-error-surface text-status-error-foreground" :
          e.status === "suspended" ? "bg-status-warning-surface text-status-warning-foreground" :
          "bg-surface-subtle text-status-neutral-foreground"
        }>
          {e.status === "active" ? "نشط" :
           e.status === "terminated" ? "منتهي" :
           e.status === "suspended" ? "معلق" :
           e.status || "غير محدد"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "الإجراءات",
      render: (e) => {
        if (!canManage) return <span className="text-xs text-muted-foreground">—</span>;
        const isActive = e.status === "active";
        const isTerminated = e.status === "terminated";
        return (
          <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
            {!isActive && !isTerminated && (
              <GuardedButton
                perm="hr:create"
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-status-success-foreground border-status-success-surface hover:bg-status-success-surface"
                onClick={() => openConfirm("activate", e)}
              >
                <Play className="h-3 w-3" />
                تفعيل
              </GuardedButton>
            )}
            {isActive && (
              <GuardedButton
                perm="hr:create"
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-status-warning-foreground border-status-warning-surface hover:bg-status-warning-surface"
                onClick={() => openConfirm("suspend", e)}
              >
                <Pause className="h-3 w-3" />
                تعليق
              </GuardedButton>
            )}
            {!isTerminated && (
              <GuardedButton
                perm="hr:delete"
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-status-error-foreground border-status-error-surface hover:bg-status-error-surface"
                onClick={() => openConfirm("terminate", e)}
              >
                <Ban className="h-3 w-3" />
                إنهاء
              </GuardedButton>
            )}
          </div>
        );
      },
    },
  ];

  const cfg = pending ? ACTION_CONFIG[pending.action] : null;

  return (
    <PageShell
      title="تفعيل / تعليق الموظفين"
      subtitle="إدارة دورة حياة الموظفين: تفعيل، تعليق، وإنهاء الخدمة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "تفعيل / تعليق الموظفين" }]}
      actions={
        <div className="flex items-center gap-2">
          {canManage && (
            <Button size="sm" className="gap-1" onClick={() => setQuickOpen(true)}>
              <Zap className="h-4 w-4" />
              تفعيل سريع
            </Button>
          )}
          <PrintButton
          entityType="report_hr_employee_activation"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "تفعيل / تعليق الموظفين", total: printRows.length },
            items: printRows.map((e: any) => ({
              "الاسم": e.name || "—",
              "الرقم الوظيفي": e.empNumber || "—",
              "المسمى": e.position || "—",
              "الفرع": e.branchName || "—",
              "تاريخ التعيين": e.hireDate || "—",
              "الحالة": e.status || "—",
            })),
          })}
          />
        </div>
      }
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الرقم الوظيفي...",
          statuses: [
            { value: "active", label: "نشط" },
            { value: "suspended", label: "معلق" },
            { value: "terminated", label: "منتهي" },
          ],
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "name", label: "الاسم" },
              { key: "empNumber", label: "الرقم الوظيفي" },
              { key: "jobTitle", label: "المسمى الوظيفي" },
              { key: "branchName", label: "الفرع" },
              { key: "hireDate", label: "تاريخ التعيين" },
              { key: "phone", label: "الجوال" },
              { key: "email", label: "البريد" },
              { key: "status", label: "الحالة" },
            ],
            "تنشيط-حسابات-الموظفين",
          )
        }
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={filtered}
        noToolbar
        emptyMessage="لا يوجد موظفين"
        pageSize={20}
      />

      {/* Activate: no reason field, plain confirmation. GAP_MATRIX P1 UI-unification §6.2 */}
      <ConfirmActionDialog
        open={pending?.action === "activate"}
        onOpenChange={(open) => { if (!open) setPending(null); }}
        variant="confirm"
        title={cfg?.title ?? ""}
        description={pending && cfg ? cfg.description(pending.employee.name) : ""}
        confirmLabel={lifecyclePending ? "جاري التنفيذ..." : (cfg?.confirmLabel ?? "تأكيد")}
        pending={lifecyclePending}
        onConfirm={confirmActivate}
      />

      {/* Suspend / Terminate: capture a required reason via PromptDialog. */}
      <PromptDialog
        open={pending?.action === "suspend" || pending?.action === "terminate"}
        title={cfg?.title ?? ""}
        description={pending && cfg ? cfg.description(pending.employee.name) : ""}
        placeholder="اكتب سبب الإجراء..."
        confirmLabel={cfg?.confirmLabel ?? "تأكيد"}
        onSubmit={(reason) => confirmWithReason(reason)}
        onClose={() => setPending(null)}
      />

      {/* HR-REV-3 (#2222) — تفعيل سريع: إنشاء موظف غير مفعّل مع خطة المهام. */}
      <Dialog open={quickOpen} onOpenChange={(open) => { if (!open) setQuickOpen(false); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تفعيل سريع</DialogTitle>
            <DialogDescription>
              إنشاء موظف جديد بحالة "غير مفعّل" مع خطة المهام. الاسم فقط مطلوب.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitQuickActivate} className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="qa-name">الاسم *</Label>
              <Input
                id="qa-name"
                required
                value={quickForm.name}
                onChange={(e) => setQuickField("name", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="qa-phone">الجوال</Label>
                <Input
                  id="qa-phone"
                  value={quickForm.phone}
                  onChange={(e) => setQuickField("phone", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="qa-nationalId">رقم الهوية</Label>
                <Input
                  id="qa-nationalId"
                  value={quickForm.nationalId}
                  onChange={(e) => setQuickField("nationalId", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="qa-nationality">الجنسية</Label>
                <Input
                  id="qa-nationality"
                  value={quickForm.nationality}
                  onChange={(e) => setQuickField("nationality", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="qa-departmentId">القسم</Label>
                <Input
                  id="qa-departmentId"
                  type="number"
                  value={quickForm.departmentId}
                  onChange={(e) => setQuickField("departmentId", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="qa-jobTitle">المسمى الوظيفي</Label>
                <Input
                  id="qa-jobTitle"
                  value={quickForm.jobTitle}
                  onChange={(e) => setQuickField("jobTitle", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="qa-hireDate">تاريخ المباشرة</Label>
                <Input
                  id="qa-hireDate"
                  type="date"
                  value={quickForm.hireDate}
                  onChange={(e) => setQuickField("hireDate", e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setQuickOpen(false)}
                disabled={quickActivateMutation.isPending}
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                rateLimitAware
                disabled={quickActivateMutation.isPending || !quickForm.name.trim()}
              >
                {quickActivateMutation.isPending ? "جاري الإنشاء..." : "إنشاء وتفعيل"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
