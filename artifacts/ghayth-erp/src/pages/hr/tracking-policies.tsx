import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { EmployeeSelect } from "@/components/shared/entity-selects";
import { KpiGrid } from "@/components/shared/kpi-card";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { MapPin, ShieldCheck, ShieldOff, Power } from "lucide-react";

// Tracking modes — must match the server enum (employeeTrackingPolicy.ts).
const TRACKING_MODES: { value: string; label: string }[] = [
  { value: "work_hours", label: "ساعات العمل" },
  { value: "task", label: "أثناء المهام" },
  { value: "trip", label: "أثناء الرحلات" },
  { value: "live", label: "مباشر (دائم)" },
  { value: "checkin_only", label: "عند التسجيل فقط" },
];

const MODE_LABEL: Record<string, string> = Object.fromEntries(
  TRACKING_MODES.map((m) => [m.value, m.label]),
);

// Canonical system role keys → Arabic labels. Used to restrict who may view
// an employee's location (allowedViewerRoles). Empty selection = any user
// holding the hr.attendance.tracking_view permission.
const VIEWER_ROLES: { key: string; label: string }[] = [
  { key: "owner", label: "المالك" },
  { key: "general_manager", label: "المدير العام" },
  { key: "hr_manager", label: "مدير الموارد البشرية" },
  { key: "branch_manager", label: "مدير الفرع" },
  { key: "department_manager", label: "مدير الإدارة" },
  { key: "fleet_manager", label: "مدير الأسطول" },
  { key: "attendance_officer", label: "مسؤول الحضور" },
  { key: "projects_manager", label: "مدير المشاريع" },
  { key: "support_manager", label: "مدير الدعم" },
];

export default function TrackingPoliciesPage() {
  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["tracking-policies"],
    "/hr/attendance/tracking-policies",
  );
  const { data: empData } = useApiQuery<any>(["employees-list"], "/employees?limit=500");
  const policies = asList(data);
  const employees = asList(empData);

  const empName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of employees) map[String(e.id)] = e.name || `#${e.id}`;
    return map;
  }, [employees]);

  // بحث على اسم الموظف (المُحلّل من empName) + نمط التتبع + السبب.
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return policies;
    return policies.filter((p: any) => {
      const name = empName[String(p.employeeId)] || `#${p.employeeId}`;
      const mode = MODE_LABEL[p.trackingMode] || p.trackingMode || "";
      const reason = p.reason || "";
      return [name, mode, reason].some((f) => String(f).toLowerCase().includes(term));
    });
  }, [policies, q, empName]);

  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  // ── Enable / update form state ────────────────────────────────────────────
  const [employeeId, setEmployeeId] = useState("");
  const [trackingMode, setTrackingMode] = useState("work_hours");
  const [reason, setReason] = useState("");
  const [viewerRoles, setViewerRoles] = useState<string[]>([]);
  const [disableTarget, setDisableTarget] = useState<any>(null);

  const saveMut = useApiMutation<any, any>(
    "/hr/attendance/tracking-policies",
    "POST",
    [["tracking-policies"]],
    {
      successMessage: "تم حفظ سياسة التتبع",
      onSuccess: () => {
        setEmployeeId("");
        setTrackingMode("work_hours");
        setReason("");
        setViewerRoles([]);
        refetch();
      },
    },
  );

  const disableMut = useApiMutation<any, { id: number }>(
    (b) => `/hr/attendance/tracking-policies/${b.id}/disable`,
    "POST",
    [["tracking-policies"]],
    { successMessage: "تم إيقاف التتبع", onSuccess: () => refetch() },
  );

  const enableMut = useApiMutation<any, { id: number }>(
    (b) => `/hr/attendance/tracking-policies/${b.id}`,
    "PATCH",
    [["tracking-policies"]],
    { successMessage: "تم تفعيل التتبع", onSuccess: () => refetch() },
  );

  function toggleRole(key: string) {
    setViewerRoles((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key],
    );
  }

  function submit() {
    if (!employeeId) return;
    saveMut.mutate({
      employeeId: Number(employeeId),
      trackingMode,
      trackingEnabled: true,
      reason: reason.trim() || undefined,
      allowedViewerRoles: viewerRoles,
    });
  }

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const enabledCount = policies.filter((p: any) => p.trackingEnabled).length;
  const restrictedCount = policies.filter(
    (p: any) => Array.isArray(p.allowedViewerRoles) && p.allowedViewerRoles.length > 0,
  ).length;

  const kpis = [
    { label: "إجمالي السياسات", value: policies.length, icon: ShieldCheck, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "تتبع مُفعّل", value: enabledCount, icon: Power, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "مقيّدة بأدوار", value: restrictedCount, icon: ShieldOff, color: "text-purple-600 bg-purple-50" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "employeeId",
      header: "الموظف",
      sortable: true,
      render: (p) => <span className="font-medium">{empName[String(p.employeeId)] || `#${p.employeeId}`}</span>,
    },
    {
      key: "trackingMode",
      header: "نمط التتبع",
      render: (p) => <Badge variant="outline">{MODE_LABEL[p.trackingMode] || p.trackingMode}</Badge>,
    },
    {
      key: "trackingEnabled",
      header: "الحالة",
      render: (p) =>
        p.trackingEnabled ? (
          <Badge className="bg-status-success-surface text-status-success-foreground">مُفعّل</Badge>
        ) : (
          <Badge variant="secondary">موقوف</Badge>
        ),
    },
    {
      key: "allowedViewerRoles",
      header: "مخوّلون بالعرض",
      render: (p) => {
        const roles: string[] = Array.isArray(p.allowedViewerRoles) ? p.allowedViewerRoles : [];
        if (roles.length === 0) return <span className="text-muted-foreground text-xs">الجميع (بصلاحية العرض)</span>;
        const labels = roles.map((r) => VIEWER_ROLES.find((v) => v.key === r)?.label || r);
        return <span className="text-xs">{labels.join("، ")}</span>;
      },
    },
    {
      key: "reason",
      header: "السبب",
      render: (p) => <span className="text-muted-foreground text-xs">{p.reason || "—"}</span>,
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (p) =>
        p.trackingEnabled ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDisableTarget(p)}
            disabled={disableMut.isPending}
          >
            <ShieldOff className="h-3.5 w-3.5 ml-1" /> إيقاف
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => enableMut.mutate({ id: Number(p.id) })}
            disabled={enableMut.isPending}
          >
            <Power className="h-3.5 w-3.5 ml-1" /> تفعيل
          </Button>
        ),
    },
  ];

  return (
    <PageShell
      title="سياسات تتبع الموظفين"
      subtitle="تفعيل وإدارة تتبع الموقع الجغرافي لكل موظف — التتبع لا يبدأ إلا بسياسة فعّالة هنا"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "سياسات التتبع" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_hr_tracking_policies"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "سياسات تتبع الموظفين", total: printRows.length },
              items: printRows.map((p: any) => ({
                "الموظف": empName[String(p.employeeId)] || `#${p.employeeId}`,
                "نمط التتبع": MODE_LABEL[p.trackingMode] || p.trackingMode,
                "الحالة": p.trackingEnabled ? "مُفعّل" : "موقوف",
                "مخوّلون بالعرض": (Array.isArray(p.allowedViewerRoles) && p.allowedViewerRoles.length > 0)
                  ? p.allowedViewerRoles.map((r: string) => VIEWER_ROLES.find((v) => v.key === r)?.label || r).join("، ")
                  : "الجميع",
                "السبب": p.reason || "—",
              })),
            })}
          />
          <Button asChild variant="outline" size="sm">
            <Link href="/hr/attendance/field-tracking">
              <MapPin className="h-4 w-4 ml-1" /> الخريطة الحية
            </Link>
          </Button>
        </div>
      }
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-status-success-foreground" />
            تفعيل تتبع موظف
          </h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs mb-1 block">الموظف</Label>
              <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">نمط التتبع</Label>
              <Select value={trackingMode} onValueChange={setTrackingMode}>
                <SelectTrigger className="mt-0">
                  <SelectValue placeholder="اختر النمط" />
                </SelectTrigger>
                <SelectContent>
                  {TRACKING_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <Label className="text-xs mb-2 block">
              مخوّلون بعرض الموقع <span className="text-muted-foreground">(اتركها فارغة = كل من يملك صلاحية العرض)</span>
            </Label>
            <div className="flex flex-wrap gap-3">
              {VIEWER_ROLES.map((r) => (
                <label key={r.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={viewerRoles.includes(r.key)}
                    onCheckedChange={() => toggleRole(r.key)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <Label className="text-xs mb-1 block">السبب (اختياري)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: موظف ميداني — متابعة الزيارات"
              rows={2}
            />
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={submit} disabled={!employeeId || saveMut.isPending}>
              {saveMut.isPending ? "جاري الحفظ…" : "حفظ السياسة"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="max-w-md">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث بالموظف أو نمط التتبع أو السبب…"
        />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        onSortedDataChange={setPrintRows}
        noToolbar
        pageSize={20}
        emptyMessage="لا توجد سياسات تتبع — فعّل أول موظف من النموذج بالأعلى"
      />

      <AlertDialog open={!!disableTarget} onOpenChange={(o) => !o && setDisableTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إيقاف تتبع الموظف</AlertDialogTitle>
            <AlertDialogDescription>
              سيتوقّف تتبع موقع «{disableTarget ? empName[String(disableTarget.employeeId)] || `#${disableTarget.employeeId}` : ""}» فورًا
              ولن يظهر على الخريطة الحية. يمكنك إعادة التفعيل لاحقًا.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (disableTarget) disableMut.mutate({ id: Number(disableTarget.id) });
                setDisableTarget(null);
              }}
            >
              إيقاف التتبع
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
