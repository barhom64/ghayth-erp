import { useState } from "react";
import { useRoute } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { EntityDetailPage, type EntityTab, type EntityHeaderAction } from "@/components/shared/entity-detail-page";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline, ProcessStages, type StageStep } from "@/components/shared/entity-timeline";
import { EntityComments } from "@/components/shared/entity-comments";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  FileText,
  Activity,
  History,
  MessageCircle,
  FolderOpen,
  User,
  Calendar,
  Hash,
  ClipboardCheck,
  CheckCircle,
  Undo2,
} from "lucide-react";
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

/**
 * Manual journal detail page — migrated in R.2 iter 2 to unified
 * templates with a **visible lifecycle**. This is the page where
 * Phase 8's state machine (draft → pending_review → approved →
 * posted, with reject branching to rejected) most needs to be
 * legible to the user: reviewers and approvers should see at a
 * glance where the journal is in its flow.
 *
 * Before: a static `STATUS_CONFIG` map, a flat status badge in the
 * page header, a raw `useMutation` for the reversal action, manual
 * toast wiring. No explicit progression visualisation — a user
 * reading the page had to infer the current stage from the badge.
 *
 * After:
 *   • ProcessStages component (already existed in entity-timeline.tsx)
 *     rendered as a persistent "lifecycle strip" between the KPIs and
 *     the tabs. Four dots: مسودة → بانتظار المراجعة → معتمد → مُرحَّل.
 *     Rejected journals render with the rejected dot highlighted.
 *     Current step pulses blue.
 *   • PageStatusBadge drives the chip in the header (via the variant
 *     mapping below) and the reverse markers in the badges slot.
 *     Single source of truth for labels + tones.
 *   • useApiMutation replaces useMutation for the reverse action,
 *     with pathFn composition for the `:id` in the URL. All errors
 *     flow through the R.1.2 typed-error toast pipeline — if the
 *     server returns 409 CONFLICT with meta.currentStatus (for
 *     example, trying to reverse an already-reversed journal), the
 *     toast surfaces "الحالة الحالية: reversed" automatically.
 *
 * No endpoint, data shape, or tab wiring changed.
 */

// Map Phase 8 approvalStatus values to the four visual stages.
// Rejected is a terminal branch off pending_review, so it gets its
// own step rendering rather than collapsing into the main 4-stage
// strip.
const LIFECYCLE_STEPS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "draft",           label: "مسودة" },
  { key: "pending_review",  label: "بانتظار المراجعة" },
  { key: "approved",        label: "معتمد" },
  { key: "posted",          label: "مُرحَّل" },
];

function buildLifecycleSteps(approvalStatus: string | undefined): StageStep[] {
  const current = approvalStatus ?? "draft";
  if (current === "rejected") {
    // Rejected is a terminal state — show the strip up to
    // pending_review as completed, then a rejected dot.
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

// Phase 8 approvalStatus → EntityDetailPage `status.variant` shape.
// The detail page's variant-driven Badge is preserved so the header
// chip colour matches the canonical tone without forcing a second
// migration of EntityDetailPage in this iteration.
const STATUS_VARIANT: Record<
  string,
  { label: string; variant: "default" | "success" | "warning" | "destructive" | "info" }
> = {
  draft:           { label: "مسودة",              variant: "default"    },
  pending_review:  { label: "بانتظار المراجعة",   variant: "warning"    },
  approved:        { label: "معتمد",              variant: "info"       },
  posted:          { label: "مُرحَّل",             variant: "success"    },
  rejected:        { label: "مرفوض",              variant: "destructive" },
};

export default function JournalManualDetailPage() {
  const [, params] = useRoute("/finance/journal-manual/:id");
  const id = params?.id || "";
  const { toast } = useToast();
  const [reversalOpen, setReversalOpen] = useState(false);
  const [reversalReason, setReversalReason] = useState("");

  const { data: journal, isLoading, isError, refetch } = useApiQuery<any>(
    ["journal-manual-detail", id],
    id ? `/finance/journal-manual/${id}` : null,
    !!id,
  );

  // R.2 iter 2 — reversal goes through useApiMutation with pathFn so
  // CONFLICT / VALIDATION errors from the server surface automatically
  // via R.1.2's toastDescriptionForError.
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

  const lines: any[] = (journal?.lines ?? []).filter((l: any) => l);
  const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);

  const statusCfg = STATUS_VARIANT[journal?.approvalStatus] ?? STATUS_VARIANT.draft;

  const overviewContent = () => (
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
          <InfoRow label="الحالة" value={statusCfg.label} />
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
            <DataTable<any>
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
  );

  const tabs: EntityTab[] = [
    { key: "overview", label: "نظرة عامة", icon: Activity, content: overviewContent },
    {
      key: "documents",
      label: "المستندات",
      icon: FolderOpen,
      content: () => <EntityDocuments entityType="journal-manual" entityId={id} />,
    },
    {
      key: "timeline",
      label: "السجل الزمني",
      icon: History,
      content: () => <EntityTimeline entityType="journal-manual" entityId={id} />,
    },
    {
      key: "comments",
      label: "التعليقات",
      icon: MessageCircle,
      content: () => <EntityComments entityType="journal-manual" entityId={id} />,
    },
  ];

  const metaItems = [
    journal?.createdByName && { icon: User, label: `أنشأه: ${journal.createdByName}` },
    journal?.reviewedByName && { icon: ClipboardCheck, label: `راجعه: ${journal.reviewedByName}` },
    journal?.approvedByName && { icon: CheckCircle, label: `اعتمده: ${journal.approvedByName}` },
    journal?.createdAt && { icon: Calendar, label: formatDateAr(journal.createdAt) },
    journal?.ref && { icon: Hash, label: journal.ref },
  ].filter(Boolean) as Array<{ icon: any; label: string }>;

  // The badges slot in EntityDetailPage sits next to the main status
  // chip. Reverse markers render via PageStatusBadge so the colour +
  // label come from the canonical STATUS_MAP.shared instead of
  // per-page tailwind classes.
  const badges = (
    <div className="flex items-center gap-1.5">
      {journal?.reversedById && <PageStatusBadge status="reversed" domain="shared" />}
      {journal?.reversalOfId && <PageStatusBadge status="active">قيد عاكس</PageStatusBadge>}
    </div>
  );

  const headerActions: EntityHeaderAction[] = [];
  if (journal && !journal.reversedById && !journal.reversalOfId) {
    headerActions.push({
      label: "عكس القيد",
      icon: Undo2,
      variant: "outline",
      onClick: () => setReversalOpen(true),
    });
  }

  const notFound = !isLoading && !journal;
  const lifecycleSteps = buildLifecycleSteps(journal?.approvalStatus);

  return (
    <>
      {journal?.reversedById && (
        <div className="mb-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          هذا القيد مُعكوس — القيد العاكس: #{journal.reversedById}
        </div>
      )}
      {journal?.reversalOfId && (
        <div className="mb-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          هذا قيد عاكس للقيد الأصلي: #{journal.reversalOfId}
        </div>
      )}

      <EntityDetailPage
        title={journal?.ref ? `قيد رقم ${journal.ref}` : (notFound ? "القيد غير موجود" : "...")}
        subtitle={journal?.description || undefined}
        avatar={{
          icon: FileText,
          gradientFrom: "from-indigo-500",
          gradientTo: "to-purple-600",
        }}
        status={{ label: statusCfg.label, variant: statusCfg.variant }}
        badges={badges}
        metaItems={metaItems}
        actions={headerActions}
        backHref="/finance/journal-manual"
        backLabel="العودة للقيود اليدوية"
        isLoading={isLoading}
        isError={isError || notFound}
        errorMessage={notFound ? "لم يتم العثور على القيد المطلوب" : "تعذر تحميل بيانات القيد"}
        onRetry={() => refetch()}
        tabs={tabs}
        defaultTab="overview"
      >
        {/* R.2 iter 2 — lifecycle strip. Rendered as a child of
            EntityDetailPage, which places it between the KPI row and
            the tabs. The ProcessStages component already existed in
            shared/entity-timeline.tsx; this page is the first finance
            consumer of it. */}
        {journal && !isLoading && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                دورة اعتماد القيد اليدوي
              </p>
              <ProcessStages steps={lifecycleSteps} />
            </CardContent>
          </Card>
        )}
      </EntityDetailPage>

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
