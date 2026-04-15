import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { formatDateAr as formatDate } from "@/lib/formatters";
import { Plus, ScrollText } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
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
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { cn } from "@/lib/utils";

/**
 * Manual journal list — migrated in R.2 iter 2 to the unified template
 * stack.
 *
 * Before: raw <h2> + local STATUS_CONFIG with dynamic tailwind class
 * names (`bg-${color}-100` — silently broken because the purger
 * can't see template literals), three `useMutation` calls with
 * hand-rolled `useToast` + `useQueryClient` + manual error catching,
 * status filter pills as a loose row of buttons.
 *
 * After:
 *   • PageShell with title, subtitle, breadcrumbs, actions, filters
 *     slot for the status pill row
 *   • PageStatusBadge replaces STATUS_CONFIG (the five statuses
 *     draft / pending_review / approved / posted / rejected all live
 *     in the canonical shared STATUS_MAP now)
 *   • useApiMutation wraps every state transition (submit / review /
 *     post) with uniform invalidation, uniform success toast, and
 *     automatic Phase 8 CONFLICT / FORBIDDEN / VALIDATION surface
 *     through R.1.2's `toastDescriptionForError`
 *
 * No change to:
 *   • Endpoint paths (`/finance/journal-manual`, `.../:id/submit`,
 *     `.../:id/review`, `.../:id/post`)
 *   • Action payload shapes (`{ approved, notes }` for review)
 *   • Row click / DataTable columns / sorting
 */

interface JournalManualRow {
  id: number;
  ref: string;
  description: string;
  createdAt: string;
  approvalStatus: string;
  createdByName?: string;
  reviewedByName?: string;
  approvedByName?: string;
}

type ActionModal =
  | { type: "submit"; journal: JournalManualRow }
  | { type: "review"; journal: JournalManualRow }
  | { type: "post";   journal: JournalManualRow };

const STATUS_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "",                label: "الكل" },
  { value: "draft",           label: "مسودة" },
  { value: "pending_review",  label: "بانتظار المراجعة" },
  { value: "approved",        label: "معتمدة" },
  { value: "posted",          label: "مُرحَّلة" },
  { value: "rejected",        label: "مرفوضة" },
];

export default function JournalManualPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [statusFilter, setStatusFilter] = useState("");
  const [actionModal, setActionModal] = useState<ActionModal | null>(null);
  const [actionNotes, setActionNotes] = useState("");

  const filterSuffix = statusFilter
    ? (scopeSuffix ? `${scopeSuffix}&status=${statusFilter}` : `?status=${statusFilter}`)
    : scopeSuffix;
  const { data, isLoading } = useApiQuery<{ data?: JournalManualRow[] }>(
    ["journal-manual", statusFilter, scopeQueryString],
    `/finance/journal-manual${filterSuffix}`,
  );
  const list: JournalManualRow[] = (data?.data ?? data ?? []) as JournalManualRow[];

  // Three lifecycle transitions, all routed through useApiMutation so
  // VALIDATION_ERROR / CONFLICT / FORBIDDEN from the Phase 8 engine
  // automatically render a structured toast with `meta.currentStatus`,
  // `meta.requiredRoles`, or `err.fix` surfaced inline.
  //
  // R.2 iter 2: the hook now accepts a `pathFn: (body) => string` so
  // per-row URL composition stays inside the hook rather than
  // bypassing it with raw `useMutation`.
  const submitMutation = useApiMutation<void, { id: number }>(
    (body) => `/finance/journal-manual/${body.id}/submit`,
    "PATCH",
    [["journal-manual"]],
    {
      successMessage: "تم إرسال القيد للمراجعة",
      onSuccess: () => setActionModal(null),
    },
  );
  const reviewMutation = useApiMutation<
    void,
    { id: number; approved: boolean; notes: string }
  >(
    (body) => `/finance/journal-manual/${body.id}/review`,
    "PATCH",
    [["journal-manual"]],
    {
      onSuccess: (_data, body) => {
        setActionModal(null);
        // The hook's default success toast is disabled here because
        // the arabic label depends on the approve/reject decision.
        // The hook's error pipeline still fires for 4xx/5xx.
      },
      successMessage: false,
    },
  );
  const postMutation = useApiMutation<void, { id: number }>(
    (body) => `/finance/journal-manual/${body.id}/post`,
    "PATCH",
    [["journal-manual"]],
    {
      successMessage: "تم ترحيل القيد بنجاح",
      onSuccess: () => setActionModal(null),
    },
  );

  const columns: DataTableColumn<JournalManualRow>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (row) => <span className="font-mono text-blue-600 text-xs">{row.ref}</span>,
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (row) => (
        <span className="text-gray-500 text-xs">{row.createdAt ? formatDate(row.createdAt) : "-"}</span>
      ),
    },
    { key: "description", header: "البيان", sortable: true },
    { key: "createdByName", header: "أنشأه", sortable: true },
    {
      key: "approvalStatus",
      header: "الحالة",
      sortable: true,
      render: (row) => <PageStatusBadge status={row.approvalStatus} domain="shared" />,
    },
    { key: "reviewedByName", header: "راجعه", render: (row) => row.reviewedByName ?? "—" },
    { key: "approvedByName", header: "اعتمده", render: (row) => row.approvedByName ?? "—" },
    {
      key: "actions",
      header: "إجراءات",
      render: (row) => (
        <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
          <Link href={`/finance/journal-manual/${row.id}`}>
            <button className="text-blue-600 hover:underline text-xs">عرض</button>
          </Link>
          {row.approvalStatus === "draft" && (
            <button
              onClick={() => setActionModal({ type: "submit", journal: row })}
              className="text-amber-600 hover:underline text-xs"
            >
              إرسال للمراجعة
            </button>
          )}
          {row.approvalStatus === "pending_review" && (
            <button
              onClick={() => {
                setActionNotes("");
                setActionModal({ type: "review", journal: row });
              }}
              className="text-indigo-600 hover:underline text-xs"
            >
              مراجعة
            </button>
          )}
          {row.approvalStatus === "approved" && (
            <button
              onClick={() => setActionModal({ type: "post", journal: row })}
              className="text-emerald-600 hover:underline text-xs"
            >
              ترحيل
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageShell
        title="القيود اليدوية"
        subtitle="إنشاء ومتابعة دورة اعتماد القيود اليدوية (مسودة ← مراجعة ← اعتماد ← ترحيل)"
        breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "القيود اليدوية" }]}
        loading={isLoading}
        actions={
          <Button size="sm" asChild>
            <Link href="/finance/journal-manual/create">
              <Plus className="h-4 w-4 me-1" />
              قيد يدوي جديد
            </Link>
          </Button>
        }
        filters={
          <div className="flex gap-2 flex-wrap">
            {STATUS_FILTERS.map((opt) => (
              <button
                key={opt.value || "all"}
                onClick={() => setStatusFilter(opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm border transition-colors",
                  statusFilter === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      >
        <DataTable
          columns={columns}
          data={list}
          isLoading={isLoading}
          emptyMessage="لا توجد قيود يدوية"
          emptyIcon={<ScrollText className="h-6 w-6 text-slate-400" />}
          onRowClick={(row) => navigate(`/finance/journal-manual/${row.id}`)}
          noToolbar
        />
      </PageShell>

      {actionModal && (
        <AlertDialog open onOpenChange={() => setActionModal(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader className="text-right">
              <AlertDialogTitle>
                {actionModal.type === "submit" && "إرسال للمراجعة"}
                {actionModal.type === "review" && "مراجعة القيد"}
                {actionModal.type === "post"   && "ترحيل القيد"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-1 text-start">
                  {actionModal.type === "submit" && (
                    <p className="text-sm text-muted-foreground">
                      هل تريد إرسال القيد <span className="font-mono text-foreground">{actionModal.journal.ref}</span> للمراجعة والاعتماد؟
                    </p>
                  )}
                  {actionModal.type === "post" && (
                    <p className="text-sm text-muted-foreground">
                      هل تريد ترحيل القيد <span className="font-mono text-foreground">{actionModal.journal.ref}</span>؟ لا يمكن التراجع عن الترحيل بعد إتمامه.
                    </p>
                  )}
                  {actionModal.type === "review" && (
                    <div>
                      <label className="block text-sm font-medium mb-1.5">ملاحظات</label>
                      <textarea
                        className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                        rows={3}
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                        placeholder="ملاحظات الرفض مطلوبة عند الرفض"
                      />
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row justify-start gap-2">
              {actionModal.type === "submit" && (
                <AlertDialogAction
                  disabled={submitMutation.isPending}
                  onClick={() => submitMutation.mutate({ id: actionModal.journal.id })}
                >
                  {submitMutation.isPending ? "جارٍ الإرسال..." : "إرسال"}
                </AlertDialogAction>
              )}
              {actionModal.type === "review" && (
                <>
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-600"
                    disabled={reviewMutation.isPending}
                    onClick={() =>
                      reviewMutation.mutate({
                        id: actionModal.journal.id,
                        approved: false,
                        notes: actionNotes,
                      })
                    }
                  >
                    رفض
                  </Button>
                  <AlertDialogAction
                    disabled={reviewMutation.isPending}
                    onClick={() =>
                      reviewMutation.mutate({
                        id: actionModal.journal.id,
                        approved: true,
                        notes: actionNotes,
                      })
                    }
                  >
                    موافقة
                  </AlertDialogAction>
                </>
              )}
              {actionModal.type === "post" && (
                <AlertDialogAction
                  disabled={postMutation.isPending}
                  onClick={() => postMutation.mutate({ id: actionModal.journal.id })}
                >
                  {postMutation.isPending ? "جارٍ الترحيل..." : "ترحيل"}
                </AlertDialogAction>
              )}
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
