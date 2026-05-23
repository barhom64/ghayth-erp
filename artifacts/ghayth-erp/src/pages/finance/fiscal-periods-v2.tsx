import { useState } from "react";
import { Calendar, Lock, Unlock, Plus, AlertTriangle } from "lucide-react";

// First real consumer of @workspace/ui-core (UNIFICATION_PLAN §P8 Phase 3).
// Every shell / table / form / status / filter primitive is imported from
// the kit, not from @/components. The shadcn raw Dialog/Button stay at
// @/components/ui/* (they're the foundation layer that the kit builds on).
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  dateColumn,
  statusColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  FormShell,
  FormTextField,
  FormDateField,
  FormTextareaField,
} from "@workspace/ui-core";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useApiQuery, useApiMutation, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { z } from "zod";

/**
 * Fiscal periods — v2 management page (FIN-014).
 *
 * Replaces the v1 `/finance/fiscal-periods` page that was read-only and
 * heuristic. This v2 page consumes the real CRUD endpoints under
 * `/api/finance/fiscal-periods-v2`:
 *
 *   GET    /finance/fiscal-periods-v2          → list
 *   POST   /finance/fiscal-periods-v2          → create
 *   POST   /finance/fiscal-periods-v2/:id/close   → close (refuses if
 *                                                   pending manual journals)
 *   POST   /finance/fiscal-periods-v2/:id/reopen  → reopen (reason required)
 *
 * The close endpoint returns 409 ConflictError with `meta.pendingCount`
 * when the period still holds unposted manual journals; the UI surfaces
 * that count and the suggested fix instead of a generic error toast.
 */

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
  const { data, isLoading, isError, error, refetch } = useApiQuery<{
    data: FiscalPeriodV2Row[];
    total: number;
  }>(["fiscal-periods-v2"], "/finance/fiscal-periods-v2");

  const rows: FiscalPeriodV2Row[] = data?.data ?? [];
  const [filters, setFilters] = useFilters();

  const [createOpen, setCreateOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<FiscalPeriodV2Row | null>(null);
  const [reopenTarget, setReopenTarget] = useState<FiscalPeriodV2Row | null>(null);

  const filtered = applyFilters(
    rows as unknown as Record<string, unknown>[],
    filters,
    { searchFields: ["name"], statusField: "status" },
  ) as unknown as FiscalPeriodV2Row[];

  const openCount = rows.filter((r) => r.status === "open").length;
  const closedCount = rows.filter((r) => r.status === "closed").length;

  const columns: DataTableColumn<FiscalPeriodV2Row>[] = [
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
    {
      key: "id",
      header: "إجراء",
      width: "140px",
      align: "end",
      render: (row) =>
        row.status === "open" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCloseTarget(row)}
            data-testid={`close-period-${row.id}`}
          >
            <Lock className="h-4 w-4 ml-1" />
            إقفال
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReopenTarget(row)}
            data-testid={`reopen-period-${row.id}`}
          >
            <Unlock className="h-4 w-4 ml-1" />
            إعادة فتح
          </Button>
        ),
    },
  ];

  return (
    <PageShell
      title="إقفال الفترات المالية"
      subtitle="إنشاء وإقفال وإعادة فتح الفترات المالية (نظام v2)"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "إقفال الفترات" },
      ]}
      actions={
        <Button onClick={() => setCreateOpen(true)} data-testid="create-period">
          <Plus className="h-4 w-4 ml-1" />
          فترة جديدة
        </Button>
      }
      loading={isLoading}
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <StatTile
          icon={<Calendar className="h-5 w-5 text-status-info-foreground" />}
          tone="info"
          label="إجمالي الفترات"
          value={rows.length}
        />
        <StatTile
          icon={<Unlock className="h-5 w-5 text-emerald-600" />}
          tone="emerald"
          label="مفتوحة"
          value={openCount}
        />
        <StatTile
          icon={<Lock className="h-5 w-5 text-slate-600" />}
          tone="slate"
          label="مُغلقة"
          value={closedCount}
        />
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث باسم الفترة...",
          statuses: [
            { value: "open", label: "مفتوحة" },
            { value: "closed", label: "مُغلقة" },
          ],
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={refetch}
        noToolbar
        rowKey={(p) => String(p.id)}
        emptyMessage="لا توجد فترات مالية"
        emptyIcon={<Calendar className="h-10 w-10 opacity-30" />}
        pageSize={20}
      />

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          refetch();
        }}
      />

      <CloseDialog
        target={closeTarget}
        onOpenChange={(open) => !open && setCloseTarget(null)}
        onClosed={() => {
          setCloseTarget(null);
          refetch();
        }}
      />

      <ReopenDialog
        target={reopenTarget}
        onOpenChange={(open) => !open && setReopenTarget(null)}
        onReopened={() => {
          setReopenTarget(null);
          refetch();
        }}
      />
    </PageShell>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "info" | "emerald" | "slate";
}) {
  const bg =
    tone === "info"
      ? "bg-status-info-surface"
      : tone === "emerald"
      ? "bg-emerald-50"
      : "bg-slate-100";
  const fg =
    tone === "info"
      ? "text-status-info-foreground"
      : tone === "emerald"
      ? "text-emerald-600"
      : "text-slate-600";
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 ${bg} rounded-lg`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-xl font-bold ${fg}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Create dialog ────────────────────────────────────────────────────

function CreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const create = useApiMutation<FiscalPeriodV2Row, CreateValues>(
    "/finance/fiscal-periods-v2",
    "POST",
    [["fiscal-periods-v2"]],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              onCreated();
            } catch (err) {
              handleFormError(err, setFieldError, toast);
            }
          }}
        >
          <FormTextField name="name" label="اسم الفترة" required />
          <FormDateField name="startDate" label="تاريخ البداية" required />
          <FormDateField name="endDate" label="تاريخ النهاية" required />
          <FormTextareaField name="notes" label="ملاحظات (اختياري)" rows={2} />
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

// ─── Close dialog ─────────────────────────────────────────────────────

function CloseDialog({
  target,
  onOpenChange,
  onClosed,
}: {
  target: FiscalPeriodV2Row | null;
  onOpenChange: (open: boolean) => void;
  onClosed: () => void;
}) {
  const { toast } = useToast();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const close = useApiMutation<{ message: string }, CloseValues>(
    () => `/finance/fiscal-periods-v2/${target!.id}/close`,
    "POST",
    [["fiscal-periods-v2"]],
  );

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) setPendingCount(null);
        onOpenChange(open);
      }}
    >
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
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm flex gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <div className="font-medium text-amber-900">
                لا يمكن إقفال الفترة
              </div>
              <div className="text-amber-800 mt-1">
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
              onClosed();
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
          <FormTextareaField
            name="notes"
            label="ملاحظات الإقفال (اختياري)"
            rows={3}
          />
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reopen dialog ────────────────────────────────────────────────────

function ReopenDialog({
  target,
  onOpenChange,
  onReopened,
}: {
  target: FiscalPeriodV2Row | null;
  onOpenChange: (open: boolean) => void;
  onReopened: () => void;
}) {
  const { toast } = useToast();
  const reopen = useApiMutation<{ message: string }, ReopenValues>(
    () => `/finance/fiscal-periods-v2/${target!.id}/reopen`,
    "POST",
    [["fiscal-periods-v2"]],
  );

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
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
              onReopened();
            } catch (err) {
              handleFormError(err, setFieldError, toast);
            }
          }}
        >
          <FormTextareaField name="reason" label="سبب إعادة الفتح" required rows={3} />
        </FormShell>
      </DialogContent>
    </Dialog>
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
