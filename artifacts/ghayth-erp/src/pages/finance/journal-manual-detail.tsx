import { useState } from "react";
import { useRoute } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import { ProcessStages, type StageStep } from "@/components/shared/entity-timeline";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import {
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
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

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
  const [reversalOpen, setReversalOpen] = useState(false);
  const [reversalReason, setReversalReason] = useState("");

  const { data: journal, isLoading, isError, refetch } = useApiQuery<any>(
    ["journal-manual-detail", id],
    id ? `/finance/journal-manual/${id}` : null,
    !!id,
  );

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

  const approvalStatus = journal?.approvalStatus ?? "draft";
  const statusLabel = STATUS_LABEL[approvalStatus] ?? approvalStatus;
  const statusTone = STATUS_TONE[approvalStatus] ?? "default";
  const lifecycleSteps = buildLifecycleSteps(journal?.approvalStatus);

  const overview = (
    <>
      {journal?.reversedById && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          هذا القيد مُعكوس — القيد العاكس: #{journal.reversedById}
        </div>
      )}
      {journal?.reversalOfId && (
        <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
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

  const actions = (
    <div className="flex items-center gap-1.5">
      {journal?.reversedById && <PageStatusBadge status="reversed" domain="shared" />}
      {journal?.reversalOfId && <PageStatusBadge status="active">قيد عاكس</PageStatusBadge>}
      {journal && !journal.reversedById && !journal.reversalOfId && (
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setReversalOpen(true)}>
          <Undo2 className="h-4 w-4" />
          عكس القيد
        </Button>
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
