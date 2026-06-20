import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { Calendar, Lock, Unlock, AlertTriangle } from "lucide-react";

// Second wave of @workspace/ui-core adoption. This page first shipped
// against PageShell + DataTable + AdvancedFilters directly (commit
// 969dd57). The structural plumbing now collapses into <ListPage>, the
// new composite primitive (UNIFICATION_PLAN §P7). Net code dropped from
// ~470 lines to ~280; the page now reads as "what to show", not "how to
// lay it out".
import {
  ListPage,
  type ListPageStat,
  dateColumn,
  statusColumn,
  FormShell,
  FormTextField,
  FormDateField,
  FormTextareaField,
} from "@workspace/ui-core";

import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useDirtyGuard } from "@/hooks/use-dirty-guard";
import { useApiQuery, useApiMutation, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { z } from "zod";

// finance.hardening:create / :update are the canonical server permissions
// (per the authorize() calls in routes/finance-hardening.ts), but the
// existing legacy-RBAC client emits the flatter `finance:*` strings via
// /permissions/my. lib/rbac/autoMigrate.ts keeps the two views aligned at
// boot. The button perms below match the journal-manual.tsx list page —
// adopting them keeps the FIN-014 buttons aligned with the rest of the
// finance UI and the existing permission seeding.
const PERM_FINANCE_CREATE = "finance:create";
const PERM_FINANCE_APPROVE = "finance:approve";

/**
 * Fiscal periods — v2 management page (FIN-014).
 *
 * Backend contract (unchanged from first iteration):
 *   GET    /finance/fiscal-periods-v2          → list
 *   POST   /finance/fiscal-periods-v2          → create
 *   POST   /finance/fiscal-periods-v2/:id/close   → 409 with pendingCount
 *                                                   when manual journals
 *                                                   are unposted
 *   POST   /finance/fiscal-periods-v2/:id/reopen  → reason required
 *
 * All mutations invalidate the ["fiscal-periods-v2"] cache key, which
 * <ListPage> uses for its query — refetch happens automatically without
 * explicit refetch() callbacks.
 */

const QUERY_KEY = ["fiscal-periods-v2"] as const;

interface FiscalPeriodV2Row {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
  notes: string | null;
  closedAt: string | null;
  closedByName: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
}

// ─── Zod schemas — mirror the server contracts ────────────────────────

const createSchema = z.object({
  name: z.string().min(1, "الاسم مطلوب"),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  endDate: z.string().min(1, "تاريخ النهاية مطلوب"),
  notes: z.string().optional(),
});

const closeSchema = z.object({
  notes: z.string().optional(),
});

const reopenSchema = z.object({
  reason: z.string().min(1, "سبب إعادة الفتح مطلوب"),
});

type CreateValues = z.infer<typeof createSchema>;
type CloseValues = z.infer<typeof closeSchema>;
type ReopenValues = z.infer<typeof reopenSchema>;

// ─── Page ─────────────────────────────────────────────────────────────

export default function FiscalPeriodsV2Page() {
  const [createOpen, setCreateOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<FiscalPeriodV2Row | null>(null);
  const [reopenTarget, setReopenTarget] = useState<FiscalPeriodV2Row | null>(null);
  const [lockTarget, setLockTarget] = useState<FiscalPeriodV2Row | null>(null);

  // Stats need the row count — read once from cache. ListPage owns the
  // canonical fetch; this just borrows the same key so we don't double
  // network. Returns undefined until the query resolves.
  const { data } = useApiQuery<{ data: FiscalPeriodV2Row[] }>(
    [...QUERY_KEY],
    "/finance/fiscal-periods-v2",
  );
  const rows = data?.data ?? [];
  const openCount = rows.filter((r) => r.status === "open").length;
  const closedCount = rows.filter((r) => r.status === "closed").length;

  const stats: ListPageStat[] = [
    {
      label: "إجمالي الفترات",
      value: rows.length,
      icon: <Calendar className="h-5 w-5" />,
      tone: "info",
    },
    {
      label: "مفتوحة",
      value: openCount,
      icon: <Unlock className="h-5 w-5" />,
      tone: "emerald",
    },
    {
      label: "مُغلقة",
      value: closedCount,
      icon: <Lock className="h-5 w-5" />,
      tone: "slate",
    },
  ];

  return (
    <ListPage
      title="إقفال الفترات المالية"
      subtitle="إنشاء وإقفال وإعادة فتح الفترات المالية (نظام v2)"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "إقفال الفترات" },
      ]}
      tabsNav={<FinanceTabsNav />}
      queryKey={[...QUERY_KEY]}
      endpoint="/finance/fiscal-periods-v2"
      printEntityType="report_fiscal_periods"
      exports={{ csv: true, excel: true, print: true }}
      columns={[
        {
          key: "name",
          header: "الفترة",
          sortable: true,
          searchable: true,
          className: "font-medium",
          render: (row) => row.name,
        },
        dateColumn<FiscalPeriodV2Row>("startDate", "من"),
        dateColumn<FiscalPeriodV2Row>("endDate", "إلى"),
        statusColumn<FiscalPeriodV2Row>("status", "الحالة", "shared"),
        {
          key: "closedAt",
          header: "أُغلقت في",
          sortable: true,
          width: "180px",
          render: (row) => {
            if (!row.closedAt) return <span className="text-muted-foreground">—</span>;
            return (
              <div className="flex flex-col">
                <span className="tabular-nums">{formatDateAr(row.closedAt)}</span>
                {row.closedByName && (
                  <span className="text-xs text-muted-foreground">
                    بواسطة {row.closedByName}
                  </span>
                )}
              </div>
            );
          },
        },
      ]}
      rowKey={(p) => String(p.id)}
      rowActions={(row) =>
        row.status === "open" ? (
          <GuardedButton
            perm={PERM_FINANCE_APPROVE}
            size="sm"
            variant="outline"
            onClick={() => setCloseTarget(row)}
            data-testid={`close-period-${row.id}`}
          >
            <Lock className="h-4 w-4 ml-1" />
            إقفال
          </GuardedButton>
        ) : row.status === "closed" ? (
          <div className="flex items-center gap-1">
            <GuardedButton
              perm={PERM_FINANCE_APPROVE}
              size="sm"
              variant="outline"
              onClick={() => setReopenTarget(row)}
              data-testid={`reopen-period-${row.id}`}
            >
              <Unlock className="h-4 w-4 ml-1" />
              إعادة فتح
            </GuardedButton>
            <GuardedButton
              perm={PERM_FINANCE_APPROVE}
              size="sm"
              variant="outline"
              onClick={() => setLockTarget(row)}
              data-testid={`lock-period-${row.id}`}
              className="text-status-error-foreground"
              title="قفل نهائي (لا يمكن العودة)"
            >
              <Lock className="h-4 w-4 ml-1" />
              قفل نهائي
            </GuardedButton>
          </div>
        ) : null
      }
      filters={{
        config: {
          searchPlaceholder: "بحث باسم الفترة...",
          statuses: [
            { value: "open", label: "مفتوحة" },
            { value: "closed", label: "مُغلقة" },
          ],
        },
        searchFields: ["name"],
        statusField: "status",
      }}
      primaryAction={{
        label: "فترة جديدة",
        onClick: () => setCreateOpen(true),
        permission: PERM_FINANCE_CREATE,
        testid: "create-period",
      }}
      stats={stats}
      emptyMessage="لا توجد فترات مالية"
      emptyIcon={<Calendar className="h-10 w-10 opacity-30" />}
    >
      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <CloseDialog target={closeTarget} onOpenChange={(open) => !open && setCloseTarget(null)} />
      <ReopenDialog target={reopenTarget} onOpenChange={(open) => !open && setReopenTarget(null)} />
      <LockDialog target={lockTarget} onOpenChange={(open) => !open && setLockTarget(null)} />
    </ListPage>
  );
}

// ─── isDirty guard for dialogs ────────────────────────────────────────
//
// React-hook-form exposes formState.isDirty via useFormContext from any
// child inside the FormShell. <DirtyTracker /> lifts that bit into a
// parent state hook so the dialog's onOpenChange can confirm before
// discarding unsaved work (outside-click or Esc dismiss).
function DirtyTracker({ onChange }: { onChange: (dirty: boolean) => void }) {
  const { formState } = useFormContext();
  const dirty = formState.isDirty;
  useEffect(() => {
    onChange(dirty);
  }, [dirty, onChange]);
  return null;
}

// ─── Create dialog ────────────────────────────────────────────────────

function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [isDirty, setIsDirty] = useState(false);
  const create = useApiMutation<FiscalPeriodV2Row, CreateValues>(
    "/finance/fiscal-periods-v2",
    "POST",
    [[...QUERY_KEY]],
  );
  const { guardedClose, discardDialog } = useDirtyGuard(isDirty, onOpenChange);

  return (
    <>
      <Dialog open={open} onOpenChange={guardedClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>فترة مالية جديدة</DialogTitle>
            <DialogDescription>
              عرّف اسم الفترة وبداية ونهاية تواريخها. يمكنك إقفالها لاحقًا من
              صفحة القائمة.
            </DialogDescription>
          </DialogHeader>
          <FormShell
            schema={createSchema}
            defaultValues={{ name: "", startDate: "", endDate: "", notes: "" }}
            submitLabel="إنشاء"
            onSubmit={async (values, { setFieldError }) => {
              try {
                await create.mutateAsync(values);
                toast({ title: "تم إنشاء الفترة المالية" });
                setIsDirty(false); // submitted, no longer dirty
                onOpenChange(false);
              } catch (err) {
                handleFormError(err, setFieldError, toast);
              }
            }}
          >
            <DirtyTracker onChange={setIsDirty} />
            <FormTextField name="name" label="اسم الفترة" required />
            <FormDateField name="startDate" label="تاريخ البداية" required />
            <FormDateField name="endDate" label="تاريخ النهاية" required />
            <FormTextareaField name="notes" label="ملاحظات (اختياري)" rows={2} />
          </FormShell>
        </DialogContent>
      </Dialog>
      {discardDialog}
    </>
  );
}

// ─── Close dialog ─────────────────────────────────────────────────────

function CloseDialog({
  target,
  onOpenChange,
}: {
  target: FiscalPeriodV2Row | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const close = useApiMutation<{ message: string }, CloseValues>(
    () => `/finance/fiscal-periods-v2/${target!.id}/close`,
    "POST",
    [[...QUERY_KEY]],
  );
  const { guardedClose, discardDialog } = useDirtyGuard(isDirty, (open) => {
    if (!open) setPendingCount(null);
    onOpenChange(open);
  });

  return (
    <>
    <Dialog open={!!target} onOpenChange={guardedClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إقفال الفترة المالية</DialogTitle>
          <DialogDescription>
            ستُحوَّل الحالة إلى "مُغلقة" وستُمنع أي حركة محاسبية جديدة داخل
            هذه الفترة. يمكنك إعادة فتحها لاحقًا مع تسجيل السبب.
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-medium">{target.name}</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {formatDateAr(target.startDate)} – {formatDateAr(target.endDate)}
            </div>
          </div>
        )}

        {pendingCount !== null && pendingCount > 0 && (
          <div className="rounded-md border border-status-warning-surface bg-status-warning-surface p-3 text-sm flex gap-2">
            <AlertTriangle className="h-5 w-5 text-status-warning-foreground shrink-0" />
            <div>
              <div className="font-medium text-amber-900">
                لا يمكن إقفال الفترة
              </div>
              <div className="text-status-warning-foreground mt-1">
                يوجد <strong>{pendingCount}</strong> قيد يدوي لم يُرحّل بعد
                داخل هذه الفترة. ارحّل أو احذف القيود اليدوية المعلّقة قبل
                إقفال الفترة.
              </div>
            </div>
          </div>
        )}

        <FormShell
          schema={closeSchema}
          defaultValues={{ notes: "" }}
          submitLabel="إقفال الفترة"
          onSubmit={async (values, { setFieldError }) => {
            setPendingCount(null);
            try {
              await close.mutateAsync(values);
              toast({ title: `تم إقفال الفترة "${target?.name ?? ""}"` });
              setIsDirty(false);
              onOpenChange(false);
            } catch (err) {
              if (err instanceof ApiError && err.code === "CONFLICT") {
                const count = Number(
                  (err.meta as { pendingCount?: number } | undefined)
                    ?.pendingCount ?? 0,
                );
                setPendingCount(count);
                return;
              }
              handleFormError(err, setFieldError, toast);
            }
          }}
        >
          <DirtyTracker onChange={setIsDirty} />
          <FormTextareaField
            name="notes"
            label="ملاحظات الإقفال (اختياري)"
            rows={3}
          />
        </FormShell>
      </DialogContent>
    </Dialog>
    {discardDialog}
    </>
  );
}

// ─── Reopen dialog ────────────────────────────────────────────────────

function ReopenDialog({
  target,
  onOpenChange,
}: {
  target: FiscalPeriodV2Row | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [isDirty, setIsDirty] = useState(false);
  const reopen = useApiMutation<{ message: string }, ReopenValues>(
    () => `/finance/fiscal-periods-v2/${target!.id}/reopen`,
    "POST",
    [[...QUERY_KEY]],
  );
  const { guardedClose, discardDialog } = useDirtyGuard(isDirty, onOpenChange);

  return (
    <>
    <Dialog open={!!target} onOpenChange={guardedClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إعادة فتح الفترة المالية</DialogTitle>
          <DialogDescription>
            سبب إعادة الفتح مطلوب لأغراض التدقيق. سيُسجَّل في سجل الفترة.
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-medium">{target.name}</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {formatDateAr(target.startDate)} – {formatDateAr(target.endDate)}
            </div>
          </div>
        )}

        <FormShell
          schema={reopenSchema}
          defaultValues={{ reason: "" }}
          submitLabel="إعادة فتح"
          onSubmit={async (values, { setFieldError }) => {
            try {
              await reopen.mutateAsync(values);
              toast({ title: `تم إعادة فتح الفترة "${target?.name ?? ""}"` });
              setIsDirty(false);
              onOpenChange(false);
            } catch (err) {
              handleFormError(err, setFieldError, toast);
            }
          }}
        >
          <DirtyTracker onChange={setIsDirty} />
          <FormTextareaField name="reason" label="سبب إعادة الفتح" required rows={3} />
        </FormShell>
      </DialogContent>
    </Dialog>
    {discardDialog}
    </>
  );
}

// PER-3 — Lock a closed period (audit-grade irreversible).
// POST /fiscal-periods-v2/:id/lock reuses the reopen schema (just
// `reason`). Once locked the period cannot be reopened from the UI,
// so the dialog is intentionally distinct from the Reopen variant
// even though the mutation shape is the same.
function LockDialog({
  target,
  onOpenChange,
}: {
  target: FiscalPeriodV2Row | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [isDirty, setIsDirty] = useState(false);
  const lock = useApiMutation<{ message: string }, ReopenValues>(
    () => `/finance/fiscal-periods-v2/${target!.id}/lock`,
    "POST",
    [[...QUERY_KEY]],
  );
  const { guardedClose, discardDialog } = useDirtyGuard(isDirty, onOpenChange);

  return (
    <>
    <Dialog open={!!target} onOpenChange={guardedClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>قفل نهائي للفترة المالية</DialogTitle>
          <DialogDescription className="text-status-error-foreground">
            تحذير: القفل النهائي لا يمكن التراجع عنه. لن يكون من الممكن إعادة فتح
            هذه الفترة أو تعديل أي قيد داخل نطاقها بعد القفل.
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="font-medium">{target.name}</div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {formatDateAr(target.startDate)} – {formatDateAr(target.endDate)}
            </div>
          </div>
        )}

        <FormShell
          schema={reopenSchema}
          defaultValues={{ reason: "" }}
          submitLabel="قفل نهائي"
          onSubmit={async (values, { setFieldError }) => {
            try {
              await lock.mutateAsync(values);
              toast({ title: `تم القفل النهائي لـ "${target?.name ?? ""}"` });
              setIsDirty(false);
              onOpenChange(false);
            } catch (err) {
              handleFormError(err, setFieldError, toast);
            }
          }}
        >
          <DirtyTracker onChange={setIsDirty} />
          <FormTextareaField name="reason" label="سبب القفل النهائي" required rows={3} />
        </FormShell>
      </DialogContent>
    </Dialog>
    {discardDialog}
    </>
  );
}

// ─── Shared error mapping ─────────────────────────────────────────────

function handleFormError(
  err: unknown,
  setFieldError: (field: string, message: string) => void,
  toast: ReturnType<typeof useToast>["toast"],
) {
  if (err instanceof ApiError) {
    if (err.field) {
      setFieldError(err.field, err.message);
      return;
    }
    toast({
      title: "تعذّر إتمام العملية",
      description: err.message,
      variant: "destructive",
    });
    return;
  }
  toast({
    title: "خطأ غير متوقّع",
    description: (err as Error).message,
    variant: "destructive",
  });
}
