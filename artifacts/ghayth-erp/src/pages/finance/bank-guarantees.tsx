import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDateAr as formatDate } from "@/lib/formatters";
import {
  Plus,
  Shield,
  AlertTriangle,
  ShieldCheck,
  XCircle,
  Undo2,
} from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { cn } from "@/lib/utils";

/**
 * Bank guarantees list — R.3 iter 3 end-to-end reference page.
 *
 * This is the first page that stitches together every piece of the
 * architectural + UI stack:
 *
 *   1. PageShell + PageStatusBadge + useApiMutation(pathFn)  — R.1 + R.2
 *   2. ConfirmDeleteDialog with Phase C.7b blockers surface    — R.1.4
 *   3. Phase 8.1 lifecycle endpoints (`/cancel`, `/release`)
 *      wired into row-level action buttons so operators can
 *      actually trigger the state transitions from the list page
 *   4. Phase 9 soft-delete via `ConfirmDeleteDialog` — the DELETE
 *      endpoint on bank_guarantees was converted to soft-delete
 *      in Phase 9, and the delete guard refuses active guarantees
 *      with a ConflictError
 *
 * Before R.3:
 *   • Raw <h2> header, no breadcrumbs, no loading indicator
 *   • Broken `alertConfig` with dynamic `bg-${color}-100` classes
 *     that the Tailwind purger couldn't see
 *   • Custom inline form modal using raw `fixed inset-0` divs
 *   • Manual `useMutation` + `useToast` + `useQueryClient` for save
 *     and delete — no pathFn, no typed-error pipeline
 *   • No cancel / release buttons — Phase 8.1 endpoints shipped
 *     on the server but were completely invisible in the UI
 *
 * After:
 *   • PageShell with title/subtitle/breadcrumbs/actions + loading
 *   • PageStatusBadge for status + alertStatus chips, with a
 *     `children` override for the "ينتهي خلال N يوم" labels
 *   • shadcn `Dialog` replaces the custom modal overlay
 *   • Four `useApiMutation(pathFn)` hooks — save, cancel, release,
 *     and delete (delete lives inside ConfirmDeleteDialog)
 *   • Row actions now include `تعديل`, `إلغاء`, `تحرير`, `حذف`
 *     conditional on the guarantee status. Cancel / release fire
 *     the Phase 8.1 lifecycle-engine endpoints, inheriting the
 *     R.1.2 typed-error toast for CONFLICT / VALIDATION / FORBIDDEN.
 *   • ConfirmDeleteDialog for the delete flow: when the delete
 *     guard refuses (active guarantee → 409 CONFLICT) the dialog
 *     shows the blockers inside itself rather than a flat toast
 *
 * No new backend endpoint. No new library. No redesign.
 */

interface BankGuarantee {
  id: number;
  ref: string;
  bank: string;
  beneficiary: string;
  amount: number;
  issueDate: string;
  expiryDate: string;
  guaranteeType: string;
  status: string;
  alertStatus: string;
  daysToExpiry: number;
  notes?: string;
}

const GUARANTEE_TYPES = [
  { value: "performance",      label: "حسن أداء"     },
  { value: "advance_payment",  label: "دفعة مقدمة"   },
  { value: "bid_bond",         label: "عطاء"         },
  { value: "maintenance",      label: "صيانة"        },
  { value: "other",            label: "أخرى"         },
];

// Alert status → (status in STATUS_MAP, Arabic override). The underlying
// `status` value is `active | cancelled | released | expired | renewed`
// (in STATUS_MAP.shared), but `alertStatus` carries the more precise
// "expiring_7 / expiring_14 / expiring_30" urgency. We render the
// urgency as a `children` override on PageStatusBadge so the colour
// tone and label both come from the canonical map.
const ALERT_RENDER: Record<
  string,
  { statusKey: string; label: string }
> = {
  active:       { statusKey: "active",    label: "نشط"             },
  released:     { statusKey: "released",  label: "مُحرَّر"          },
  cancelled:    { statusKey: "cancelled", label: "ملغى"            },
  expired:      { statusKey: "expired",   label: "منتهي"           },
  expiring_7:   { statusKey: "expired",   label: "ينتهي خلال 7 أيام"  },
  expiring_14:  { statusKey: "expired",   label: "ينتهي خلال 14 يوم" },
  expiring_30:  { statusKey: "pending",   label: "ينتهي خلال 30 يوم" },
};

type FormState = {
  ref: string;
  bank: string;
  beneficiary: string;
  amount: string;
  issueDate: string;
  expiryDate: string;
  guaranteeType: string;
  notes: string;
  status?: string;
};

const EMPTY_FORM: FormState = {
  ref: "",
  bank: "",
  beneficiary: "",
  amount: "",
  issueDate: "",
  expiryDate: "",
  guaranteeType: "performance",
  notes: "",
};

// Action-modal shape for cancel / release. Both endpoints need a
// reason (cancel) or optional notes (release) — we reuse one
// dialog with a typed discriminated state.
type ActionModal =
  | { type: "cancel";  row: BankGuarantee }
  | { type: "release"; row: BankGuarantee };

export default function BankGuaranteesPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BankGuarantee | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<BankGuarantee | null>(null);
  const [actionModal, setActionModal] = useState<ActionModal | null>(null);
  const [actionReason, setActionReason] = useState("");

  const { data, isLoading, isError } = useApiQuery<any>(
    ["bank-guarantees", scopeQueryString],
    `/finance/bank-guarantees${scopeSuffix}`,
  );

  // ─── Mutations ───────────────────────────────────────────────────────

  // Save payload — `amount` is coerced to a number before hitting the
  // wire, and the update path adds `_editId` so pathFn can compose the
  // PATCH URL without leaking `editing` state into the mutation.
  type SavePayload = Omit<FormState, "amount"> & { amount: number };
  type UpdatePayload = SavePayload & { _editId: number };

  // Two hooks — one for create (POST), one for update (PATCH) — because
  // `useApiMutation` fixes the HTTP method at hook time. Both share
  // the same invalidation + success-close behaviour; the only
  // difference is the method and the pathFn.
  const saveMutation = useApiMutation<BankGuarantee, SavePayload>(
    "/finance/bank-guarantees",
    "POST",
    [["bank-guarantees"]],
    {
      successMessage: "تم إضافة الضمان البنكي",
      onSuccess: () => {
        setShowForm(false);
        setEditing(null);
        setForm(EMPTY_FORM);
      },
    },
  );

  const updateMutation = useApiMutation<BankGuarantee, UpdatePayload>(
    (body) => `/finance/bank-guarantees/${body._editId}`,
    "PATCH",
    [["bank-guarantees"]],
    {
      successMessage: "تم تحديث الضمان",
      onSuccess: () => {
        setShowForm(false);
        setEditing(null);
        setForm(EMPTY_FORM);
      },
    },
  );

  // Phase 8.1 lifecycle endpoints — Cancel. Fires
  // POST /finance/bank-guarantees/:id/cancel with { reason }.
  // The Phase 8.1 engine rejects fromStates != 'active' with a 409
  // that R.1.2 surfaces as "الحالة الحالية: <current>".
  const cancelMutation = useApiMutation<
    BankGuarantee,
    { id: number; reason: string }
  >(
    (body) => `/finance/bank-guarantees/${body.id}/cancel`,
    "POST",
    [["bank-guarantees"]],
    {
      successMessage: "تم إلغاء الضمان البنكي",
      onSuccess: () => {
        setActionModal(null);
        setActionReason("");
      },
    },
  );

  // Phase 8.1 lifecycle endpoints — Release. Fires
  // POST /finance/bank-guarantees/:id/release with optional { notes }.
  const releaseMutation = useApiMutation<
    BankGuarantee,
    { id: number; notes?: string }
  >(
    (body) => `/finance/bank-guarantees/${body.id}/release`,
    "POST",
    [["bank-guarantees"]],
    {
      successMessage: "تم تحرير الضمان البنكي",
      onSuccess: () => {
        setActionModal(null);
        setActionReason("");
      },
    },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const list: BankGuarantee[] = data?.data ?? data ?? [];
  const summary = data?.summary ?? {};

  const alerts = list.filter((g) =>
    ["expiring_7", "expiring_14", "expiring_30", "expired"].includes(g.alertStatus),
  );

  // ─── Handlers ────────────────────────────────────────────────────────

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (row: BankGuarantee) => {
    setEditing(row);
    setForm({
      ref: row.ref,
      bank: row.bank,
      beneficiary: row.beneficiary,
      amount: String(row.amount),
      issueDate: row.issueDate?.slice(0, 10) ?? "",
      expiryDate: row.expiryDate?.slice(0, 10) ?? "",
      guaranteeType: row.guaranteeType,
      notes: row.notes ?? "",
      status: row.status,
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, amount: Number(form.amount) };
    if (editing) {
      updateMutation.mutate({ ...payload, _editId: editing.id });
    } else {
      saveMutation.mutate(payload);
    }
  };

  const openCancel = (row: BankGuarantee) => {
    setActionReason("");
    setActionModal({ type: "cancel", row });
  };

  const openRelease = (row: BankGuarantee) => {
    setActionReason("");
    setActionModal({ type: "release", row });
  };

  const submitAction = () => {
    if (!actionModal) return;
    if (actionModal.type === "cancel") {
      if (!actionReason.trim()) {
        return; // The server enforces it too — the button disables
               // until the reason is non-empty, so this is just a
               // guard against a racey click.
      }
      cancelMutation.mutate({ id: actionModal.row.id, reason: actionReason });
    } else {
      releaseMutation.mutate({
        id: actionModal.row.id,
        notes: actionReason.trim() || undefined,
      });
    }
  };

  // ─── Columns ─────────────────────────────────────────────────────────

  const columns: DataTableColumn<BankGuarantee>[] = [
    {
      key: "ref",
      header: "رقم الضمان",
      sortable: true,
      render: (row) => <span className="font-mono text-blue-600 text-xs">{row.ref}</span>,
    },
    {
      key: "issueDate",
      header: "تاريخ الإصدار",
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground text-xs">
          {row.issueDate ? formatDate(row.issueDate) : "-"}
        </span>
      ),
    },
    {
      key: "expiryDate",
      header: "تاريخ الانتهاء",
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground text-xs">
          {row.expiryDate ? formatDate(row.expiryDate) : "-"}
        </span>
      ),
    },
    { key: "bank", header: "البنك", sortable: true },
    { key: "beneficiary", header: "الجهة المستفيدة", sortable: true },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (row) => <span className="font-semibold">{formatCurrency(row.amount)}</span>,
    },
    {
      key: "guaranteeType",
      header: "النوع",
      sortable: true,
      render: (row) =>
        GUARANTEE_TYPES.find((t) => t.value === row.guaranteeType)?.label ?? row.guaranteeType,
    },
    {
      key: "alertStatus",
      header: "الحالة",
      sortable: true,
      render: (row) => {
        const cfg = ALERT_RENDER[row.alertStatus] ?? ALERT_RENDER.active;
        return (
          <PageStatusBadge status={cfg.statusKey} domain="shared">
            {cfg.label}
          </PageStatusBadge>
        );
      },
    },
    {
      key: "daysToExpiry",
      header: "الأيام المتبقية",
      sortable: true,
      render: (row) => (
        <span
          className={cn(
            row.daysToExpiry < 0
              ? "text-red-600 font-bold"
              : row.daysToExpiry <= 7
                ? "text-red-500 font-semibold"
                : row.daysToExpiry <= 30
                  ? "text-amber-700"
                  : "text-muted-foreground",
          )}
        >
          {row.daysToExpiry < 0
            ? `منتهي منذ ${Math.abs(row.daysToExpiry)} يوم`
            : `${row.daysToExpiry} يوم`}
        </span>
      ),
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (row) => (
        <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
          {row.status === "active" && (
            <>
              <button
                onClick={() => openEdit(row)}
                className="text-blue-600 hover:underline text-xs"
              >
                تعديل
              </button>
              <button
                onClick={() => openRelease(row)}
                className="text-emerald-600 hover:underline text-xs"
              >
                تحرير
              </button>
              <button
                onClick={() => openCancel(row)}
                className="text-amber-700 hover:underline text-xs"
              >
                إلغاء
              </button>
            </>
          )}
          {row.status !== "active" && (
            <button
              onClick={() => setDeleting(row)}
              className="text-red-600 hover:underline text-xs"
            >
              حذف
            </button>
          )}
        </div>
      ),
    },
  ];

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <>
      <PageShell
        title="الضمانات البنكية"
        subtitle="إدارة الضمانات البنكية، متابعة مواعيد الانتهاء، وتنفيذ إجراءات الإلغاء والتحرير"
        breadcrumbs={[
          { href: "/finance", label: "المالية" },
          { label: "الضمانات البنكية" },
        ]}
        loading={isLoading}
        actions={
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 me-1" />
            ضمان جديد
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-slate-50 border border-slate-100">
                <Shield className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الضمانات</p>
                <p className="text-xl font-bold">{summary.total ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-blue-50 border border-blue-100">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي المبالغ النشطة</p>
                <p className="text-xl font-bold text-blue-700">
                  {formatCurrency(summary.totalAmount ?? 0)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-amber-50 border border-amber-100">
                <AlertTriangle className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">تنتهي خلال 30 يوم</p>
                <p className="text-xl font-bold text-amber-700">{summary.expiring30 ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-red-50 border border-red-100">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">منتهية الصلاحية</p>
                <p className="text-xl font-bold text-red-600">{summary.expired ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {alerts.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-amber-900 font-semibold mb-3">
              <AlertTriangle className="h-5 w-5" />
              تنبيهات: {alerts.length} ضمان يحتاج مراجعة
            </div>
            <div className="space-y-2">
              {alerts.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between bg-background rounded-lg px-4 py-2 text-sm"
                >
                  <div className="font-medium">
                    {g.ref} — {g.beneficiary}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{g.bank}</span>
                    <span className="text-muted-foreground">{formatCurrency(g.amount)}</span>
                    <PageStatusBadge status={ALERT_RENDER[g.alertStatus]?.statusKey ?? "expired"}>
                      {ALERT_RENDER[g.alertStatus]?.label ?? "منتهي"}
                    </PageStatusBadge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DataTable
          columns={columns}
          data={list}
          isLoading={isLoading}
          emptyMessage="لا توجد ضمانات بنكية مسجلة"
          emptyIcon={<Shield className="h-6 w-6 text-slate-400" />}
          noToolbar
        />
      </PageShell>

      {/* ─── Create / Edit dialog ──────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle>
              {editing ? "تعديل الضمان البنكي" : "إضافة ضمان بنكي جديد"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ref">رقم الضمان *</Label>
                <Input
                  id="ref"
                  required
                  value={form.ref}
                  onChange={(e) => setForm((f) => ({ ...f, ref: e.target.value }))}
                  placeholder="BG-2026-001"
                />
              </div>
              <div>
                <Label htmlFor="bank">البنك المُصدر *</Label>
                <Input
                  id="bank"
                  required
                  value={form.bank}
                  onChange={(e) => setForm((f) => ({ ...f, bank: e.target.value }))}
                  placeholder="البنك الأهلي"
                />
              </div>
              <div>
                <Label htmlFor="beneficiary">الجهة المستفيدة *</Label>
                <Input
                  id="beneficiary"
                  required
                  value={form.beneficiary}
                  onChange={(e) => setForm((f) => ({ ...f, beneficiary: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="amount">المبلغ *</Label>
                <Input
                  id="amount"
                  required
                  type="number"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="issueDate">تاريخ الإصدار *</Label>
                <Input
                  id="issueDate"
                  required
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="expiryDate">تاريخ الانتهاء *</Label>
                <Input
                  id="expiryDate"
                  required
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="guaranteeType">نوع الضمان</Label>
                <select
                  id="guaranteeType"
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={form.guaranteeType}
                  onChange={(e) => setForm((f) => ({ ...f, guaranteeType: e.target.value }))}
                >
                  {GUARANTEE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              {editing && (
                <div>
                  <Label htmlFor="status">الحالة</Label>
                  <select
                    id="status"
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={form.status ?? "active"}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="active">نشط</option>
                    <option value="released">مُحرَّر</option>
                    <option value="renewed">مُجدَّد</option>
                    <option value="cancelled">ملغى</option>
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <Label htmlFor="notes">ملاحظات</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter className="flex-row justify-start gap-2 pt-2">
              <Button
                type="submit"
                disabled={saveMutation.isPending || updateMutation.isPending}
              >
                {saveMutation.isPending || updateMutation.isPending
                  ? "جاري الحفظ..."
                  : editing
                    ? "حفظ التعديلات"
                    : "إضافة الضمان"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Cancel / Release dialog (Phase 8.1 lifecycle transitions) ── */}
      <AlertDialog open={actionModal !== null} onOpenChange={(v) => !v && setActionModal(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="flex items-center gap-2">
              {actionModal?.type === "cancel" ? (
                <>
                  <XCircle className="h-5 w-5 text-amber-600" />
                  إلغاء الضمان البنكي {actionModal.row.ref}
                </>
              ) : (
                <>
                  <Undo2 className="h-5 w-5 text-emerald-600" />
                  تحرير الضمان البنكي {actionModal?.row.ref}
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-start space-y-3 pt-1">
                <p className="text-sm text-muted-foreground">
                  {actionModal?.type === "cancel"
                    ? "سيتم تغيير حالة الضمان إلى «ملغى». هذا الإجراء يمرّ عبر محرك دورة الحياة المركزي ولا يمكن التراجع عنه."
                    : "سيتم تغيير حالة الضمان إلى «مُحرَّر». هذا الإجراء يُسجَّل في سجل الأحداث ولا يمكن التراجع عنه."}
                </p>
                <div>
                  <Label htmlFor="action-reason">
                    {actionModal?.type === "cancel" ? "سبب الإلغاء *" : "ملاحظات التحرير (اختيارية)"}
                  </Label>
                  <Textarea
                    id="action-reason"
                    rows={3}
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder={
                      actionModal?.type === "cancel"
                        ? "اذكر سبب إلغاء الضمان…"
                        : "ملاحظات عند التحرير (اختيارية)…"
                    }
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row justify-start gap-2">
            <AlertDialogAction
              className={cn(
                actionModal?.type === "cancel"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-emerald-600 hover:bg-emerald-700",
              )}
              disabled={
                (actionModal?.type === "cancel" && !actionReason.trim()) ||
                cancelMutation.isPending ||
                releaseMutation.isPending
              }
              onClick={(e) => {
                e.preventDefault();
                submitAction();
              }}
            >
              {cancelMutation.isPending || releaseMutation.isPending
                ? "جاري التنفيذ..."
                : actionModal?.type === "cancel"
                  ? "تأكيد الإلغاء"
                  : "تأكيد التحرير"}
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete dialog (Phase 9 soft-delete + C.7b blockers) ──── */}
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        entity={{
          type: "bank_guarantees",
          id: deleting?.id ?? 0,
          name: deleting ? `${deleting.ref} — ${deleting.beneficiary}` : "",
        }}
        deletePath={`/finance/bank-guarantees/${deleting?.id ?? 0}`}
        invalidateKeys={[["bank-guarantees"]]}
        successMessage="تم حذف الضمان البنكي"
        onDeleted={() => setDeleting(null)}
      />
    </>
  );
}
