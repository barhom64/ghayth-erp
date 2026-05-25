import { useState } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PromptDialog } from "@/components/shared/prompt-dialog";
import { formatCurrency, formatDateAr as formatDate } from "@/lib/formatters";
import {
  Plus,
  Shield,
  AlertTriangle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  PageStatusBadge,
  FormShell,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormNumberField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";
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

const guaranteeFormSchema = z.object({
  ref: z.string().min(1, "رقم الضمان مطلوب"),
  bank: z.string().min(1, "البنك المُصدر مطلوب"),
  beneficiary: z.string().min(1, "الجهة المستفيدة مطلوبة"),
  amount: z.string().refine((v) => Number(v) > 0, "المبلغ يجب أن يكون أكبر من صفر"),
  issueDate: z.string().min(1, "تاريخ الإصدار مطلوب"),
  expiryDate: z.string().min(1, "تاريخ الانتهاء مطلوب"),
  guaranteeType: z.string(),
  notes: z.string().optional(),
  status: z.string().optional(),
});
type FormState = z.infer<typeof guaranteeFormSchema>;

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

const EDIT_STATUS_OPTIONS = [
  { value: "active", label: "نشط" },
  { value: "released", label: "مُحرَّر" },
  { value: "renewed", label: "مُجدَّد" },
  { value: "cancelled", label: "ملغى" },
];

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
  const [formDefaults, setFormDefaults] = useState<FormState>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<BankGuarantee | null>(null);
  const [actionModal, setActionModal] = useState<ActionModal | null>(null);

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
        setFormDefaults(EMPTY_FORM);
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
        setFormDefaults(EMPTY_FORM);
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
      },
    },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const list: BankGuarantee[] = data?.data ?? data ?? [];
  const summary = data?.summary ?? {};

  const alerts = list.filter((g) =>
    ["expiring_7", "expiring_14", "expiring_30", "expired"].includes(g.alertStatus),
  );

  // ─── Handlers ────────────────────────────────────────────────────────

  const openNew = () => {
    setEditing(null);
    setFormDefaults(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (row: BankGuarantee) => {
    setEditing(row);
    setFormDefaults({
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

  const handleFormSubmit = async (values: FormState) => {
    const payload = { ...values, amount: Number(values.amount) };
    if (editing) {
      await updateMutation.mutateAsync({ ...payload, _editId: editing.id });
    } else {
      await saveMutation.mutateAsync(payload);
    }
  };

  const openCancel = (row: BankGuarantee) => {
    setActionModal({ type: "cancel", row });
  };

  const openRelease = (row: BankGuarantee) => {
    setActionModal({ type: "release", row });
  };

  const submitAction = (value: string) => {
    if (!actionModal) return;
    if (actionModal.type === "cancel") {
      cancelMutation.mutate({ id: actionModal.row.id, reason: value });
    } else {
      releaseMutation.mutate({
        id: actionModal.row.id,
        notes: value.trim() || undefined,
      });
    }
  };

  // ─── Columns ─────────────────────────────────────────────────────────

  const columns: DataTableColumn<BankGuarantee>[] = [
    {
      key: "ref",
      header: "رقم الضمان",
      sortable: true,
      render: (row) => <span className="font-mono text-status-info-foreground text-xs">{row.ref}</span>,
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
              ? "text-status-error-foreground font-bold"
              : row.daysToExpiry <= 7
                ? "text-status-error font-semibold"
                : row.daysToExpiry <= 30
                  ? "text-status-warning-foreground"
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
                className="text-status-info-foreground hover:underline text-xs"
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
                className="text-status-warning-foreground hover:underline text-xs"
              >
                إلغاء
              </button>
            </>
          )}
          {row.status !== "active" && (
            <button
              onClick={() => setDeleting(row)}
              className="text-status-error-foreground hover:underline text-xs"
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
          <GuardedButton perm="finance:create" size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 me-1" />
            ضمان جديد
          </GuardedButton>
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
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-status-info-surface border border-status-info-surface">
                <ShieldCheck className="w-5 h-5 text-status-info-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي المبالغ النشطة</p>
                <p className="text-xl font-bold text-status-info-foreground">
                  {formatCurrency(summary.totalAmount ?? 0)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-status-warning-surface border border-status-warning-surface">
                <AlertTriangle className="w-5 h-5 text-status-warning-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">تنتهي خلال 30 يوم</p>
                <p className="text-xl font-bold text-status-warning-foreground">{summary.expiring30 ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-status-error-surface border border-status-error-surface">
                <XCircle className="w-5 h-5 text-status-error-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">منتهية الصلاحية</p>
                <p className="text-xl font-bold text-status-error-foreground">{summary.expired ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {alerts.length > 0 && (
          <div className="rounded-xl border border-status-warning-surface bg-status-warning-surface p-4">
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
          {/*
            FormShell remounts when defaultValues identity changes — we
            key by the editing row id (or "new") so openEdit/openNew
            reseed the form even though the Dialog stays mounted across
            opens.
          */}
          <FormShell
            key={editing?.id ?? "new"}
            schema={guaranteeFormSchema}
            defaultValues={formDefaults}
            submitLabel={
              saveMutation.isPending || updateMutation.isPending
                ? "جاري الحفظ..."
                : editing
                  ? "حفظ التعديلات"
                  : "إضافة الضمان"
            }
            secondaryActions={
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            }
            onSubmit={handleFormSubmit}
          >
            <FormGrid cols={2}>
              <FormTextField name="ref" label="رقم الضمان" required placeholder="BG-2026-001" />
              <FormTextField name="bank" label="البنك المُصدر" required placeholder="البنك الأهلي" />
              <FormTextField name="beneficiary" label="الجهة المستفيدة" required />
              <FormNumberField name="amount" label="المبلغ" required min="0" />
              <FormDateField name="issueDate" label="تاريخ الإصدار" required />
              <FormDateField name="expiryDate" label="تاريخ الانتهاء" required />
              <FormSelectField name="guaranteeType" label="نوع الضمان" options={GUARANTEE_TYPES} />
              {editing && (
                <FormSelectField name="status" label="الحالة" options={EDIT_STATUS_OPTIONS} />
              )}
              <FormTextareaField name="notes" label="ملاحظات" rows={2} className="md:col-span-2" />
            </FormGrid>
          </FormShell>
        </DialogContent>
      </Dialog>

      {/* ─── Cancel / Release dialog (Phase 8.1 lifecycle transitions) ── */}
      <PromptDialog
        open={actionModal !== null}
        title={
          actionModal?.type === "cancel"
            ? `إلغاء الضمان البنكي ${actionModal.row.ref}`
            : `تحرير الضمان البنكي ${actionModal?.row.ref ?? ""}`
        }
        description={
          actionModal?.type === "cancel"
            ? "سيتم تغيير حالة الضمان إلى «ملغى». هذا الإجراء يمرّ عبر محرك دورة الحياة المركزي ولا يمكن التراجع عنه."
            : "سيتم تغيير حالة الضمان إلى «مُحرَّر». هذا الإجراء يُسجَّل في سجل الأحداث ولا يمكن التراجع عنه."
        }
        placeholder={
          actionModal?.type === "cancel"
            ? "اذكر سبب إلغاء الضمان…"
            : "ملاحظات عند التحرير (اختيارية)…"
        }
        confirmLabel={actionModal?.type === "cancel" ? "تأكيد الإلغاء" : "تأكيد التحرير"}
        optional={actionModal?.type === "release"}
        onSubmit={submitAction}
        onClose={() => setActionModal(null)}
      />

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
