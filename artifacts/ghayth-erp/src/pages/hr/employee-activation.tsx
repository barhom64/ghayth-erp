import { useState } from "react";
import { formatCurrency } from "@/lib/formatters";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Badge } from "@/components/ui/badge";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { UserCheck, UserX, Users, ToggleLeft, Pause, Play, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@/components/page-shell";

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
  const [reason, setReason] = useState("");

  const onLifecycleSuccess = (action: LifecycleAction) => {
    const msg =
      action === "activate" ? "تم تفعيل الموظف" :
      action === "suspend" ? "تم تعليق الموظف" :
      "تم إنهاء خدمة الموظف";
    toast({ title: msg });
    refetch();
    setPending(null);
    setReason("");
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

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const employees = data?.data || [];

  const filtered = applyFilters(employees, filters, {
    searchFields: ["name", "empNumber"],
    statusField: "status",
  });

  const active = employees.filter((e: any) => e.status === "active").length;
  const inactive = employees.filter((e: any) => e.status !== "active").length;
  const suspended = employees.filter((e: any) => e.status === "suspended").length;

  const kpis = [
    { label: "إجمالي الموظفين", value: employees.length, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "نشطين", value: active, icon: UserCheck, color: "text-green-600 bg-green-50" },
    { label: "غير نشطين", value: inactive, icon: UserX, color: "text-red-600 bg-red-50" },
    { label: "معلقين", value: suspended, icon: ToggleLeft, color: "text-yellow-600 bg-yellow-50" },
  ];

  const openConfirm = (action: LifecycleAction, employee: any) => {
    setReason("");
    setPending({ action, employee });
  };

  const confirmAction = () => {
    if (!pending) return;
    const cfg = ACTION_CONFIG[pending.action];
    if (cfg.requiresReason && !reason.trim()) {
      toast({ variant: "destructive", title: "السبب مطلوب" });
      return;
    }
    const trimmed = reason.trim();
    if (pending.action === "terminate") {
      terminateMutation.mutate({ id: pending.employee.id, reason: trimmed, action: "terminate" });
    } else {
      const nextStatus = pending.action === "activate" ? "active" : "suspended";
      patchMutation.mutate({
        id: pending.employee.id,
        status: nextStatus,
        statusReason: trimmed || undefined,
        action: pending.action,
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
          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold", e.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
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
      className: "text-gray-500 font-mono",
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
      className: "text-gray-500",
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
          e.status === "active" ? "bg-green-100 text-green-700" :
          e.status === "terminated" ? "bg-red-100 text-red-700" :
          e.status === "suspended" ? "bg-yellow-100 text-yellow-700" :
          "bg-gray-100 text-gray-700"
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
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-green-700 border-green-200 hover:bg-green-50"
                onClick={() => openConfirm("activate", e)}
              >
                <Play className="h-3 w-3" />
                تفعيل
              </Button>
            )}
            {isActive && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-yellow-700 border-yellow-200 hover:bg-yellow-50"
                onClick={() => openConfirm("suspend", e)}
              >
                <Pause className="h-3 w-3" />
                تعليق
              </Button>
            )}
            {!isTerminated && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-red-700 border-red-200 hover:bg-red-50"
                onClick={() => openConfirm("terminate", e)}
              >
                <Ban className="h-3 w-3" />
                إنهاء
              </Button>
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
    >
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
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا يوجد موظفين"
        pageSize={20}
      />

      <AlertDialog open={!!pending} onOpenChange={(open) => { if (!open) { setPending(null); setReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{cfg?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending && cfg?.description(pending.employee.name)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cfg?.requiresReason && (
            <div className="space-y-2">
              <Label htmlFor="reason">
                السبب {cfg.requiresReason && <span className="text-red-600">*</span>}
              </Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="اكتب سبب الإجراء..."
                rows={3}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={lifecyclePending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmAction(); }}
              disabled={lifecyclePending}
              className={cfg?.destructive ? "bg-red-600 hover:bg-red-700" : undefined}
            >
              {lifecyclePending ? "جارٍ التنفيذ..." : cfg?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
