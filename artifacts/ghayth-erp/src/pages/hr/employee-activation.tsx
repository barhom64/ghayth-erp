import { useState } from "react";
import { formatCurrency } from "@/lib/formatters";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const qc = useQueryClient();
  const [filters, setFilters] = useFilters();
  const { data, refetch } = useApiQuery<any>(["employees"], "/employees?limit=200");
  const employees = data?.data || [];

  const [pending, setPending] = useState<{ action: LifecycleAction; employee: any } | null>(null);
  const [reason, setReason] = useState("");

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

  const lifecycleMutation = useMutation({
    mutationFn: async ({ action, employee, reason }: { action: LifecycleAction; employee: any; reason: string }) => {
      if (action === "terminate") {
        return apiFetch(`/employees/${employee.id}`, {
          method: "DELETE",
          body: JSON.stringify({ reason }),
        });
      }
      const nextStatus = action === "activate" ? "active" : "suspended";
      return apiFetch(`/employees/${employee.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, statusReason: reason || undefined }),
      });
    },
    onSuccess: (_, vars) => {
      const msg =
        vars.action === "activate" ? "تم تفعيل الموظف" :
        vars.action === "suspend" ? "تم تعليق الموظف" :
        "تم إنهاء خدمة الموظف";
      toast({ title: msg });
      qc.invalidateQueries({ queryKey: ["employees"] });
      refetch();
      setPending(null);
      setReason("");
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "فشل التنفيذ",
        description: err?.message || "حدث خطأ أثناء تحديث حالة الموظف",
      });
    },
  });

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
    lifecycleMutation.mutate({ ...pending, reason: reason.trim() });
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">تفعيل / تعليق الموظفين</h1>
        <p className="text-sm text-muted-foreground mt-0.5">إدارة دورة حياة الموظفين: تفعيل، تعليق، وإنهاء الخدمة</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
            <AlertDialogCancel disabled={lifecycleMutation.isPending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmAction(); }}
              disabled={lifecycleMutation.isPending}
              className={cfg?.destructive ? "bg-red-600 hover:bg-red-700" : undefined}
            >
              {lifecycleMutation.isPending ? "جارٍ التنفيذ..." : cfg?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
