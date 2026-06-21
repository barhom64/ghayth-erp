import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { Plus, Eye, Users, UserCheck, UserX, Car, KeyRound, ShieldCheck, ShieldX } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { KpiGrid } from "@/components/shared/kpi-card";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

// TA-T18-DR — driver reputation badge. The score (0..100) is the
// persisted `reputationScore` from the compute service (#2397);
// NULL = no trips yet → neutral "لا توجد بيانات". Thresholds mirror
// the engine's tiering (#2409): ≥85 high, <60 low.
function ReputationBadge({ score }: { score: number | string | null | undefined }) {
  if (score == null || score === "") {
    return <span className="text-xs text-muted-foreground">لا توجد بيانات</span>;
  }
  const n = Number(score);
  const cls =
    n >= 85 ? "bg-status-success-surface text-status-success-foreground"
    : n < 60 ? "bg-status-warning-surface text-status-warning-foreground"
    : "bg-status-info-surface text-status-info-foreground";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {n.toFixed(0)}/100
    </span>
  );
}

export default function DriversPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  // #2713 (تعميم) — سلة المحذوفات للسائقين.
  const [showDeleted, setShowDeleted] = useState(false);
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["drivers", showDeleted ? "deleted" : "active"],
    `/fleet/drivers${showDeleted ? "?deleted=true" : ""}`,
  );
  const items: any[] = data?.data || [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);
  const [previewDriver, setPreviewDriver] = useState<any>(null);
  const [portalForDriver, setPortalForDriver] = useState<any>(null);
  const [portalEmail, setPortalEmail] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  // Driver-portal account management — backend in routes/fleet.ts
  // (POST/PATCH/GET /fleet/drivers/:id/portal-account). The dialog
  // is lazy: portal status only fetched when the user opens it for
  // a specific driver, so the hot list query stays cheap.
  const { data: portalData, refetch: refetchPortal } = useApiQuery<{ data: any }>(
    ["driver-portal-account", String(portalForDriver?.id ?? 0)],
    portalForDriver ? `/fleet/drivers/${portalForDriver.id}/portal-account` : null,
    !!portalForDriver,
  );
  const portalAccount = portalData?.data;

  const createPortalMut = useApiMutation<
    unknown,
    { id: number; email: string; password: string }
  >(
    (body) => `/fleet/drivers/${body.id}/portal-account`,
    "POST",
    [["drivers"]],
    {
      successMessage: "تم إنشاء حساب بوابة السائق",
      onSuccess: () => {
        refetchPortal();
        setPortalEmail("");
        setPortalPassword("");
      },
    },
  );

  const patchPortalMut = useApiMutation<
    unknown,
    { id: number; isActive?: boolean; password?: string }
  >(
    (body) => `/fleet/drivers/${body.id}/portal-account`,
    "PATCH",
    [["drivers"]],
    {
      successMessage: "تم تحديث حساب البوابة",
      onSuccess: () => {
        refetchPortal();
        setPortalPassword("");
      },
    },
  );

  const driverFields: PreviewField[] = [
    { label: "الاسم", key: "name" },
    { label: "الهاتف", key: "phone" },
    { label: "رقم الرخصة", key: "licenseNumber" },
    { label: "نوع الرخصة", key: "licenseType", type: "badge" },
    { label: "انتهاء الرخصة", key: "licenseExpiry", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
    // TA-T18-DR — reputation breakdown (#2397). The list `SELECT d.*`
    // already returns every sub-component; surfacing them here gives
    // the dispatcher the "why" behind the score.
    { label: "درجة السمعة", key: "reputationScore" },
    { label: "نسبة الالتزام بالموعد", key: "reputationOnTimeRate" },
    { label: "نسبة الإتمام", key: "reputationCompletionRate" },
    { label: "نسبة البدء", key: "reputationStartRate" },
    { label: "عدد الرحلات المحتسبة", key: "reputationTripsConsidered" },
    { label: "آخر احتساب للسمعة", key: "reputationComputedAt", type: "date" },
  ];

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/fleet/drivers",
    queryKeys: [["drivers"]],
    onSuccess: () => refetch(),
  });

  async function handleRestoreDriver(id: number) {
    try {
      await apiFetch(`/fleet/drivers/${id}/restore`, { method: "POST" });
      toast({ title: "تم استرجاع السائق" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e?.message || "تعذّر الاسترجاع" });
    }
  }

  const editFields = [
    { key: "name", label: "الاسم" },
    { key: "phone", label: "الهاتف" },
    { key: "licenseNumber", label: "الرخصة" },
    { key: "status", label: "الحالة", type: "select" as const, options: [
      { value: "available", label: "متاح" },
      { value: "on_trip", label: "في رحلة" },
      { value: "off_duty", label: "خارج الدوام" },
      { value: "suspended", label: "موقوف" },
    ] },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (v) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} />
        </span>
      ),
    },
    { key: "name", header: "الاسم", sortable: true, searchable: true, className: "font-medium" },
    { key: "phone", header: "الهاتف", sortable: true, searchable: true, className: "text-muted-foreground", render: (d) => d.phone || "-" },
    { key: "licenseType", header: "الرخصة", sortable: true, searchable: true, sortKey: "licenseNumber", render: (d) => d.licenseNumber || "-" },
    { key: "licenseExpiry", header: "انتهاء الرخصة", sortable: true, className: "text-muted-foreground", render: (d) => d.licenseExpiry || "-" },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (d) => <PageStatusBadge status={d.status || "available"} domain="driver" />,
    },
    {
      // TA-T18-DR — surface the persisted reputation score (#2397/#2409).
      key: "reputationScore",
      header: "السمعة",
      sortable: true,
      render: (d) => <ReputationBadge score={d.reputationScore} />,
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (d) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {showDeleted ? (
            <Button variant="outline" size="sm" onClick={() => handleRestoreDriver(d.id)}>استرجاع</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setPreviewDriver(d)} title="معاينة سريعة"><Eye className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" onClick={() => { setPortalForDriver(d); setPortalEmail(""); setPortalPassword(""); }} title="بوابة السائق"><KeyRound className="h-4 w-4" /></Button>
              <RowActions
                onEdit={() => startEdit(d.id, { name: d.name, phone: d.phone || "", licenseNumber: d.licenseNumber || "", status: d.status || "available" })}
                onDelete={() => startDelete(d.id)}
                deletePerm="fleet:delete"
              />
            </>
          )}
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="السائقين"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "السائقين" }]}
      loading={isLoading}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant={showDeleted ? "default" : "outline"}
            size="sm"
            onClick={() => setShowDeleted((v) => !v)}
          >
            {showDeleted ? "السائقون النشطون" : "سلة المحذوفات"}
          </Button>
          <PrintButton
            entityType="report_fleet_drivers"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "سائقو الأسطول", total: printRows.length },
              items: printRows.map((d: any) => ({
                "الاسم": d.name || "—",
                "الهاتف": d.phone || "—",
                "رقم الرخصة": d.licenseNumber || "—",
                "نوع الرخصة": d.licenseType || "—",
                "انتهاء الرخصة": d.licenseExpiry || "—",
                "الرحلات": d.totalTrips ?? 0,
                "التقييم": d.rating ?? "—",
                "الحالة": d.status || "—",
              })),
            })}
          />
          <Link href="/fleet/drivers/create">
            <GuardedButton perm="fleet:create" size="sm"><Plus className="h-4 w-4 me-1" />إضافة سائق</GuardedButton>
          </Link>
        </div>
      }
    >
      <FleetTabsNav />
      <KpiGrid items={[
        { label: "إجمالي السائقين", value: items.length, icon: Users, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "متاحين", value: items.filter((d: any) => d.status === "available").length, icon: UserCheck, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "في رحلة", value: items.filter((d: any) => d.status === "on_trip").length, icon: Car, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "خارج الدوام / موقوفين", value: items.filter((d: any) => d.status === "off_duty" || d.status === "suspended").length, icon: UserX, color: "text-status-warning-foreground bg-status-warning-surface" },
      ]} />

      <BulkActionsBar
        entityType="driver"
        items={items}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(items.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["drivers"]]}
        actions={["export"]}
        csvColumns={[
          { key: "name", label: "الاسم" },
          { key: "phone", label: "الهاتف" },
          { key: "licenseNumber", label: "رقم الرخصة" },
          { key: "licenseType", label: "نوع الرخصة" },
          { key: "licenseExpiry", label: "انتهاء الرخصة" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="السائقين"
      />

      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        searchPlaceholder="بحث بالاسم أو الهاتف أو الرخصة..."
        emptyMessage="لا يوجد سائقين"
        emptyIcon={<Users className="h-6 w-6 text-slate-400" />}
        onRowClick={(row) => navigate(`/fleet/drivers/${row.id}`)}
        renderRowExtras={(d) => {
          if (editingId === d.id) {
            return (
              <InlineEditForm fields={editFields} initialValues={editForm} onSave={(values) => handleSave(d.id, values)} onCancel={cancelEdit} isPending={isPending} />
            );
          }
          if (deletingId === d.id) {
            return (
              <InlineDeleteConfirm onConfirm={() => handleDelete(d.id)} onCancel={cancelDelete} isPending={isPending} itemName={d.name} entityType="driver" entityId={d.id} />
            );
          }
          return null;
        }}
      />
      <QuickPreviewDialog open={!!previewDriver} onOpenChange={() => setPreviewDriver(null)} title="تفاصيل السائق" data={previewDriver} fields={driverFields} />

      <Dialog open={!!portalForDriver} onOpenChange={(o) => !o && setPortalForDriver(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              بوابة السائق — {portalForDriver?.name}
            </DialogTitle>
          </DialogHeader>
          {!portalAccount ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                لا يوجد حساب بوابة لهذا السائق بعد. أنشئ بريداً وكلمة مرور مؤقتة وسيُطلب من السائق تغييرها عند أول تسجيل دخول.
              </p>
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input
                  type="email"
                  value={portalEmail}
                  onChange={(e) => setPortalEmail(e.target.value)}
                  placeholder="driver@example.com"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label>كلمة المرور المؤقتة</Label>
                <Input
                  type="password"
                  value={portalPassword}
                  onChange={(e) => setPortalPassword(e.target.value)}
                  placeholder="6 أحرف على الأقل"
                  autoComplete="new-password"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPortalForDriver(null)}>إلغاء</Button>
                <Button
                  onClick={() => createPortalMut.mutate({
                    id: portalForDriver.id,
                    email: portalEmail.trim(),
                    password: portalPassword,
                  })}
                  disabled={!portalEmail || portalPassword.length < 6 || createPortalMut.isPending}
                >
                  {createPortalMut.isPending ? "جاري الإنشاء…" : "إنشاء الحساب"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">البريد</p><p className="font-mono">{portalAccount.email}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground">الحالة</p>
                  <Badge variant="outline" className={portalAccount.isActive
                    ? "bg-status-success-surface text-status-success-foreground"
                    : "bg-rose-100 text-rose-700"}>
                    {portalAccount.isActive ? "نشط" : "موقوف"}
                  </Badge>
                </div>
                <div><p className="text-xs text-muted-foreground">آخر دخول</p><p className="text-xs">{portalAccount.lastLoginAt ? new Date(portalAccount.lastLoginAt).toLocaleString("ar-SA") : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">يجب تغيير كلمة المرور</p><p>{portalAccount.mustChangePassword ? "نعم" : "لا"}</p></div>
              </div>
              <div className="border-t pt-3 space-y-2">
                <Label className="text-xs">إعادة تعيين كلمة المرور</Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={portalPassword}
                    onChange={(e) => setPortalPassword(e.target.value)}
                    placeholder="6 أحرف على الأقل"
                    autoComplete="new-password"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={portalPassword.length < 6 || patchPortalMut.isPending}
                    onClick={() => patchPortalMut.mutate({ id: portalForDriver.id, password: portalPassword })}
                  >
                    إعادة تعيين
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">إعادة التعيين تُلغي جميع الجلسات الحالية فوراً.</p>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setPortalForDriver(null)}>إغلاق</Button>
                {portalAccount.isActive ? (
                  <Button
                    variant="outline"
                    onClick={() => patchPortalMut.mutate({ id: portalForDriver.id, isActive: false })}
                    disabled={patchPortalMut.isPending}
                  >
                    <ShieldX className="h-4 w-4 me-1" />
                    تعليق الحساب
                  </Button>
                ) : (
                  <Button
                    onClick={() => patchPortalMut.mutate({ id: portalForDriver.id, isActive: true })}
                    disabled={patchPortalMut.isPending}
                  >
                    <ShieldCheck className="h-4 w-4 me-1" />
                    تفعيل الحساب
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
