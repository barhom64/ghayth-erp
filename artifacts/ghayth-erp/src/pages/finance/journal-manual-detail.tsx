import { useState } from "react";
import { useRoute } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";

// Existing-page kit adoption (UNIFICATION_PLAN §P8 Phase 3). The four
// primitives below moved from @/components/... to @workspace/* imports
// — same components via the re-export shim, just routed through the
// public kit surface so any later physical move stays transparent.
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { DetailPageLayout, ProcessStages, type StageStep } from "@workspace/entity-kit";

import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Undo2, Send, CheckCircle, CheckCircle2, XCircle, Upload } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { useAuth } from "@/lib/auth";

const LIFECYCLE_STEPS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "draft",           label: "مسودة" },
  { key: "pending_review",  label: "بانتظار المراجعة" },
  { key: "approved",        label: "معتمد" },
  { key: "posted",          label: "مُرحَّل" },
];

function buildLifecycleSteps(approvalStatus: string | undefined): StageStep[] {
  const current = approvalStatus ?? "draft";
  if (current === "rejected") {
    return [
      { label: "مسودة",              status: "completed" },
      { label: "بانتظار المراجعة",   status: "completed" },
      { label: "مرفوض",              status: "rejected"  },
    ];
  }
  const currentIdx = LIFECYCLE_STEPS.findIndex((s) => s.key === current);
  return LIFECYCLE_STEPS.map((step, i): StageStep => {
    if (currentIdx === -1) return { label: step.label, status: "pending" };
    if (i < currentIdx)    return { label: step.label, status: "completed" };
    if (i === currentIdx)  return { label: step.label, status: "current"   };
    return { label: step.label, status: "pending" };
  });
}

const STATUS_TONE: Record<string, "success" | "warning" | "info" | "muted" | "destructive" | "default"> = {
  draft: "default",
  pending_review: "warning",
  approved: "info",
  posted: "success",
  rejected: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  pending_review: "بانتظار المراجعة",
  approved: "معتمد",
  posted: "مُرحَّل",
  rejected: "مرفوض",
};

export default function JournalManualDetailPage() {
  const [, params] = useRoute("/finance/journal-manual/:id");
  const id = params?.id || "";
  const { toast } = useToast();
  const { extraTabs, hideTabs } = useRegistryTabs("journal_entry", id);
  // Set of the current user's assignment IDs. journal.createdBy holds the
  // assignment ID of whoever inserted the entry (see businessHelpers
  // createJournalEntry); if it's in this set, the user is the creator and
  // the server's "creator cannot review own entry" rule (finance-hardening
  // /:id/review) will reject any approve/reject they attempt. Disable the
  // buttons up-front so the user sees the constraint instead of clicking
  // and getting a FORBIDDEN toast.
  const { assignments } = useAuth();
  const myAssignmentIds = new Set(assignments.map((a) => a.id));
  const [reversalOpen, setReversalOpen] = useState(false);
  const [reversalReason, setReversalReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

  const { data: journal, isLoading, isError, refetch } = useApiQuery<any>(
    ["journal-manual-detail", id],
    id ? `/finance/journal-manual/${id}` : null,
    !!id,
  );

  const invalidateKeys = [
    ["journal-manual-detail", id],
    ["journal-manual"],
    ["journal"],
  ];

  const reverseMut = useApiMutation<void, { reason: string }>(
    () => `/finance/journal/${id}/reverse`,
    "POST",
    [
      ["journal-manual-detail", id],
      ["journal"],
    ],
    {
      successMessage: "تم عكس القيد بنجاح",
      onSuccess: () => {
        setReversalOpen(false);
        setReversalReason("");
        refetch();
      },
    },
  );

  // FIN-013 — lifecycle action mutations (draft → pending_review →
  // approved → posted). All use PATCH against the finance-hardening
  // endpoints; the server's applyTransition gate is the source of truth
  // for which transition is legal at any given status, so the buttons
  // below show/hide on the current status but the server still enforces
  // the rule. The simpler POST /journal/:id/approve|post endpoints on
  // finance-journal.ts remain as a fallback path but are not wired here.
  const submitMut = useApiMutation<{ approvalStatus: string }, Record<string, never>>(
    () => `/finance/journal-manual/${id}/submit`,
    "PATCH",
    invalidateKeys,
    {
      successMessage: "تم إرسال القيد للمراجعة",
      onSuccess: () => refetch(),
    },
  );

  const approveMut = useApiMutation<{ approvalStatus: string }, { approved: boolean }>(
    () => `/finance/journal-manual/${id}/review`,
    "PATCH",
    invalidateKeys,
    {
      successMessage: "تم اعتماد القيد",
      onSuccess: () => refetch(),
    },
  );

  const rejectMut = useApiMutation<{ approvalStatus: string }, { approved: boolean; notes: string }>(
    () => `/finance/journal-manual/${id}/review`,
    "PATCH",
    invalidateKeys,
    {
      onSuccess: () => {
        setRejectOpen(false);
        setRejectNotes("");
        toast({ title: "تم رفض القيد" });
        refetch();
      },
    },
  );

  const postMut = useApiMutation<{ approvalStatus: string; status: string }, Record<string, never>>(
    () => `/finance/journal-manual/${id}/post`,
    "PATCH",
    invalidateKeys,
    {
      successMessage: "تم ترحيل القيد بنجاح",
      onSuccess: () => refetch(),
    },
  );

  const lines: any[] = (journal?.lines ?? []).filter((l: any) => l);
  const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);

  const approvalStatus = journal?.approvalStatus ?? "draft";
  const statusLabel = STATUS_LABEL[approvalStatus] ?? approvalStatus;
  const statusTone = STATUS_TONE[approvalStatus] ?? "default";
  const lifecycleSteps = buildLifecycleSteps(journal?.approvalStatus);

  const overview = (
    <>
      {journal?.reversedById && (
        <div className="text-sm text-status-warning-foreground bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2">
          هذا القيد مُعكوس — القيد العاكس: #{journal.reversedById}
        </div>
      )}
      {journal?.reversalOfId && (
        <div className="text-sm text-status-info-foreground bg-status-info-surface border border-status-info-surface rounded-lg px-4 py-2">
          هذا قيد عاكس للقيد الأصلي: #{journal.reversalOfId}
        </div>
      )}

      {journal && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              دورة اعتماد القيد اليدوي
            </p>
            <ProcessStages steps={lifecycleSteps} />
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="المرجع" value={journal?.ref} />
            <InfoRow label="البيان" value={journal?.description} />
            <InfoRow label="مركز التكلفة" value={journal?.costCenter} />
            <InfoRow label="تاريخ الإنشاء" value={journal?.createdAt ? formatDateAr(journal.createdAt) : undefined} />
            <InfoRow label="أنشأه" value={journal?.createdByName} />
            <InfoRow label="راجعه" value={journal?.reviewedByName} />
            <InfoRow label="اعتمده" value={journal?.approvedByName} />
            <InfoRow label="الحالة" value={statusLabel} />
          </div>

          {journal?.approvalNotes && (
            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات الاعتماد</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{journal.approvalNotes}</p>
            </div>
          )}

          <div className="pt-4 border-t">
            <p className="text-sm font-semibold mb-2">بنود القيد</p>
            <div className="rounded-xl border overflow-hidden text-sm">
              <DataTable
                columns={[
                  { key: "accountCode", header: "الحساب", render: (r) => <span className="font-mono text-xs">{r.accountCode}</span> },
                  { key: "description", header: "البيان" },
                  { key: "debit", header: "مدين", sortable: true, render: (r) => <span className="font-mono">{r.debit > 0 ? formatCurrency(r.debit) : ""}</span> },
                  { key: "credit", header: "دائن", sortable: true, render: (r) => <span className="font-mono">{r.credit > 0 ? formatCurrency(r.credit) : ""}</span> },
                ] satisfies DataTableColumn<any>[]}
                data={lines}
                pageSize={0}
                noToolbar
                searchPlaceholder={null}
                emptyMessage="لا توجد بنود"
                caption={
                  lines.length > 0 ? (
                    <div className="flex justify-between bg-muted/40 font-semibold px-3 py-2 text-sm">
                      <span className="text-muted-foreground">المجموع</span>
                      <div className="flex gap-8">
                        <span>{formatCurrency(totalDebit)}</span>
                        <span>{formatCurrency(totalCredit)}</span>
                      </div>
                    </div>
                  ) : null
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );

  // FIN-013 — lifecycle action buttons. The set surfaces the legal next
  // transition for the current approvalStatus; the server is still the
  // authority (applyTransition fromStates check + creator-can't-review-own
  // rule), so a wrong click surfaces as a typed FORBIDDEN/CONFLICT toast
  // rather than corrupt state. Reverse stays available only on posted +
  // not-already-reversed entries — gated on `status` (the posting status)
  // rather than `approvalStatus` since a draft can never be reversed.
  const canShowLifecycle = journal && !journal.reversedById && !journal.reversalOfId;
  const status = journal?.status as string | undefined;
  const actions = (
    <div className="flex items-center gap-1.5">
      {journal?.reversedById && <PageStatusBadge status="reversed" domain="shared" />}
      {journal?.reversalOfId && <PageStatusBadge status="active">قيد عاكس</PageStatusBadge>}

      {canShowLifecycle && approvalStatus === "draft" && (
        <GuardedButton
          perm="finance:create"
          variant="default"
          size="sm"
          className="gap-1"
          disabled={submitMut.isPending}
          onClick={() => submitMut.mutate({})}
          rateLimitAware
        >
          <Send className="h-4 w-4" />
          {submitMut.isPending ? "جارٍ الإرسال…" : "إرسال للمراجعة"}
        </GuardedButton>
      )}

      {canShowLifecycle && approvalStatus === "pending_review" && (() => {
        // The server (finance-hardening /:id/review) enforces a "creator
        // cannot review own entry" rule by rejecting with FORBIDDEN. Mirror
        // that rule on the client so the user sees disabled buttons with a
        // tooltip instead of clicking and getting a toast.
        const isCreator = journal?.createdBy != null && myAssignmentIds.has(Number(journal.createdBy));
        const creatorTooltip = isCreator
          ? "لا يمكن للمُنشئ مراجعة قيده الخاص — يجب مراجعة محاسب آخر"
          : undefined;
        return (
          <>
            <GuardedButton
              perm="finance:approve"
              variant="default"
              size="sm"
              className="gap-1 bg-emerald-600 hover:bg-emerald-700"
              disabled={approveMut.isPending || rejectMut.isPending || isCreator}
              deniedTooltip={creatorTooltip}
              onClick={() => approveMut.mutate({ approved: true })}
              title={creatorTooltip}
              rateLimitAware
            >
              <CheckCircle2 className="h-4 w-4" />
              {approveMut.isPending ? "جارٍ الاعتماد…" : "اعتماد"}
            </GuardedButton>
            <GuardedButton
              perm="finance:approve"
              variant="outline"
              size="sm"
              className="gap-1 border-status-error-surface text-status-error-foreground"
              disabled={approveMut.isPending || rejectMut.isPending || isCreator}
              deniedTooltip={creatorTooltip}
              onClick={() => setRejectOpen(true)}
              title={creatorTooltip}
              rateLimitAware
            >
              <XCircle className="h-4 w-4" />
              رفض
            </GuardedButton>
          </>
        );
      })()}

      {canShowLifecycle && approvalStatus === "approved" && (
        <GuardedButton
          perm="finance:approve"
          variant="default"
          size="sm"
          className="gap-1"
          disabled={postMut.isPending}
          onClick={() => postMut.mutate({})}
          rateLimitAware
        >
          <Upload className="h-4 w-4" />
          {postMut.isPending ? "جارٍ الترحيل…" : "ترحيل"}
        </GuardedButton>
      )}

      {/* Reverse only on posted, non-already-reversed entries — gated on
          `status` (posting status) since a draft can never be reversed.
          Backend rule: original.reversedById IS NULL AND reversalOfId IS NULL. */}
      {canShowLifecycle && status === "posted" && (
        <GuardedButton perm="finance:delete" variant="outline" size="sm" className="gap-1" onClick={() => setReversalOpen(true)}>
          <Undo2 className="h-4 w-4" />
          عكس القيد
        </GuardedButton>
      )}
    </div>
  );

  return (
    <>
      <DetailPageLayout
        title={journal?.ref ? `قيد رقم ${journal.ref}` : "القيد"}
        subtitle={journal?.description || undefined}
        backPath="/finance/journal"
        backLabel="العودة للقيود اليدوية"
        status={{ label: statusLabel, tone: statusTone }}
        refNumber={journal?.ref}
        createdAt={journal?.createdAt}
        updatedAt={journal?.updatedAt}
        createdByName={journal?.createdByName}
        entityType="journal-entry"
        entityId={id}
        isLoading={isLoading}
        error={isError ? true : undefined}
        onRetry={() => refetch()}
        overview={overview}
        extraTabs={extraTabs}
        hideTabs={hideTabs}
        actions={actions}
      />

      {/* FIN-013 — reject dialog (peer reviewer rejects with required notes) */}
      <AlertDialog
        open={rejectOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRejectOpen(false);
            setRejectNotes("");
          }
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle>رفض القيد {journal?.ref}</AlertDialogTitle>
            <AlertDialogDescription>
              سيُحوَّل القيد إلى حالة "مرفوض" وسيرى المُنشئ سبب الرفض. لا يمكن
              للمُنشئ مراجعة قيده الخاص — الزر متاح فقط لمحاسب آخر.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-1 block">سبب الرفض *</label>
            <Textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="اكتب سبب رفض القيد لإفادة المنشئ..."
              rows={3}
            />
          </div>
          <AlertDialogFooter className="flex-row justify-start gap-2">
            <AlertDialogAction
              className="bg-status-error-foreground hover:opacity-90"
              onClick={(e) => {
                e.preventDefault();
                if (!rejectNotes.trim()) {
                  toast({ variant: "destructive", title: "سبب الرفض مطلوب" });
                  return;
                }
                rejectMut.mutate({ approved: false, notes: rejectNotes });
              }}
              disabled={rejectMut.isPending}
            >
              {rejectMut.isPending ? "جارٍ الرفض…" : "تأكيد الرفض"}
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={reversalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setReversalOpen(false);
            setReversalReason("");
          }
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle>عكس القيد {journal?.ref}</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إنشاء قيد جديد بنفس البنود مع عكس المدين والدائن. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-1 block">سبب عكس القيد *</label>
            <Textarea
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder="أدخل سبب عكس القيد..."
              rows={3}
            />
          </div>
          <AlertDialogFooter className="flex-row justify-start gap-2">
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={(e) => {
                e.preventDefault();
                if (!reversalReason.trim()) {
                  toast({ variant: "destructive", title: "السبب مطلوب" });
                  return;
                }
                reverseMut.mutate({ reason: reversalReason });
              }}
              disabled={reverseMut.isPending}
            >
              {reverseMut.isPending ? "جاري العكس..." : "تأكيد العكس"}
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground mt-0.5">{value || "—"}</p>
    </div>
  );
}
