import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ScrollText } from "lucide-react";

// Fourth existing-page kit migration. journal-manual is a deliberately
// complex test case: server-side status filtering, pill-style filter
// tabs (not AdvancedFilters config), per-row action buttons with
// permission gates, row click navigation, and a global action modal.
// It exercises the ListPage extensions added in the same commit
// (`customFilterBar`, `onRowClick`) — proves the composite scales beyond
// the simple cases without being forced into a wrong shape.
import {
  ListPage,
  type DataTableColumn,
  PageStatusBadge,
} from "@workspace/ui-core";

import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatDateAr as formatDate } from "@/lib/formatters";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApiMutation } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { cn } from "@/lib/utils";

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
  | { type: "post"; journal: JournalManualRow };

const STATUS_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "الكل" },
  { value: "draft", label: "مسودة" },
  { value: "pending_review", label: "بانتظار المراجعة" },
  { value: "approved", label: "معتمدة" },
  { value: "posted", label: "مُرحَّلة" },
  { value: "rejected", label: "مرفوضة" },
];

export default function JournalManualPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [statusFilter, setStatusFilter] = useState("");
  const [actionModal, setActionModal] = useState<ActionModal | null>(null);
  const [actionNotes, setActionNotes] = useState("");

  // Server-side status filtering: the URL query param drives the SQL
  // WHERE clause on the backend, so the cache key must include the
  // status value to trigger a refetch when the user clicks a pill.
  const filterSuffix = statusFilter
    ? scopeSuffix
      ? `${scopeSuffix}&status=${statusFilter}`
      : `?status=${statusFilter}`
    : scopeSuffix;
  const endpoint = `/finance/journal-manual${filterSuffix}`;
  const queryKey = ["journal-manual", statusFilter, scopeQueryString ?? ""];

  // Three lifecycle transitions, all routed through useApiMutation so
  // VALIDATION_ERROR / CONFLICT / FORBIDDEN from the Phase 8 engine
  // automatically render a structured toast with `meta.currentStatus`,
  // `meta.requiredRoles`, or `err.fix` surfaced inline.
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
      onSuccess: () => setActionModal(null),
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
      render: (row) => (
        <span className="font-mono text-status-info-foreground text-xs">
          {row.ref}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground text-xs">
          {row.createdAt ? formatDate(row.createdAt) : "-"}
        </span>
      ),
    },
    { key: "description", header: "البيان", sortable: true },
    { key: "createdByName", header: "أنشأه", sortable: true },
    {
      key: "approvalStatus",
      header: "الحالة",
      sortable: true,
      render: (row) => (
        <PageStatusBadge status={row.approvalStatus} domain="shared" />
      ),
    },
    {
      key: "reviewedByName",
      header: "راجعه",
      render: (row) => row.reviewedByName ?? "—",
    },
    {
      key: "approvedByName",
      header: "اعتمده",
      render: (row) => row.approvedByName ?? "—",
    },
  ];

  return (
    <>
      <ListPage<JournalManualRow>
        title="القيود اليدوية"
        subtitle="إنشاء ومتابعة دورة اعتماد القيود اليدوية (مسودة ← مراجعة ← اعتماد ← ترحيل)"
        breadcrumbs={[
          { href: "/finance", label: "المالية" },
          { label: "القيود اليدوية" },
        ]}
        queryKey={queryKey}
        endpoint={endpoint}
        columns={columns}
        rowKey={(row) => String(row.id)}
        onRowClick={(row) => navigate(`/finance/journal-manual/${row.id}`)}
        rowActions={(row) => (
          <div
            className="flex gap-2 flex-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            <Link href={`/finance/journal-manual/${row.id}`}>
              <button className="text-status-info-foreground hover:underline text-xs">
                عرض
              </button>
            </Link>
            {row.approvalStatus === "draft" && (
              <GuardedButton
                perm="finance:create"
                variant="link"
                size="sm"
                className="text-status-warning-foreground hover:underline text-xs p-0 h-auto"
                onClick={() => setActionModal({ type: "submit", journal: row })}
              >
                إرسال للمراجعة
              </GuardedButton>
            )}
            {row.approvalStatus === "pending_review" && (
              <GuardedButton
                perm="finance:approve"
                variant="link"
                size="sm"
                className="text-indigo-600 hover:underline text-xs p-0 h-auto"
                onClick={() => {
                  setActionNotes("");
                  setActionModal({ type: "review", journal: row });
                }}
              >
                مراجعة
              </GuardedButton>
            )}
            {row.approvalStatus === "approved" && (
              <GuardedButton
                perm="finance:approve"
                variant="link"
                size="sm"
                className="text-emerald-600 hover:underline text-xs p-0 h-auto"
                onClick={() => setActionModal({ type: "post", journal: row })}
              >
                ترحيل
              </GuardedButton>
            )}
          </div>
        )}
        customFilterBar={
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
        primaryAction={{
          label: "قيد يدوي جديد",
          onClick: () => navigate("/finance/journal-manual/create"),
          testid: "create-journal-manual",
        }}
        emptyMessage="لا توجد قيود يدوية"
        emptyIcon={<ScrollText className="h-6 w-6 text-slate-400" />}
      />

      {actionModal && (
        <AlertDialog open onOpenChange={() => setActionModal(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader className="text-right">
              <AlertDialogTitle>
                {actionModal.type === "submit" && "إرسال للمراجعة"}
                {actionModal.type === "review" && "مراجعة القيد"}
                {actionModal.type === "post" && "ترحيل القيد"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-1 text-start">
                  {actionModal.type === "submit" && (
                    <p className="text-sm text-muted-foreground">
                      هل تريد إرسال القيد{" "}
                      <span className="font-mono text-foreground">
                        {actionModal.journal.ref}
                      </span>{" "}
                      للمراجعة والاعتماد؟
                    </p>
                  )}
                  {actionModal.type === "post" && (
                    <p className="text-sm text-muted-foreground">
                      هل تريد ترحيل القيد{" "}
                      <span className="font-mono text-foreground">
                        {actionModal.journal.ref}
                      </span>
                      ؟ لا يمكن التراجع عن الترحيل بعد إتمامه.
                    </p>
                  )}
                  {actionModal.type === "review" && (
                    <div>
                      <label className="block text-sm font-medium mb-1.5">
                        ملاحظات
                      </label>
                      <Textarea
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
                <GuardedButton
                  perm="finance:create"
                  disabled={submitMutation.isPending}
                  onClick={() =>
                    submitMutation.mutate({ id: actionModal.journal.id })
                  }
                >
                  {submitMutation.isPending ? "جارٍ الإرسال..." : "إرسال"}
                </GuardedButton>
              )}
              {actionModal.type === "review" && (
                <>
                  <GuardedButton
                    perm="finance:approve"
                    variant="outline"
                    className="border-status-error-surface text-status-error-foreground"
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
                  </GuardedButton>
                  <GuardedButton
                    perm="finance:approve"
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
                  </GuardedButton>
                </>
              )}
              {actionModal.type === "post" && (
                <GuardedButton
                  perm="finance:approve"
                  disabled={postMutation.isPending}
                  onClick={() =>
                    postMutation.mutate({ id: actionModal.journal.id })
                  }
                >
                  {postMutation.isPending ? "جارٍ الترحيل..." : "ترحيل"}
                </GuardedButton>
              )}
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
