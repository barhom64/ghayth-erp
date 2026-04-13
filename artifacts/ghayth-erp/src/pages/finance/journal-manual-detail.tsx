import { useState } from "react";
import { useRoute } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EntityDetailPage, type EntityTab, type EntityHeaderAction } from "@/components/shared/entity-detail-page";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { EntityComments } from "@/components/shared/entity-comments";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "info" }> = {
  draft: { label: "مسودة", variant: "default" },
  pending_review: { label: "في انتظار المراجعة", variant: "warning" },
  approved: { label: "معتمد", variant: "info" },
  posted: { label: "مُرحَّل", variant: "success" },
  rejected: { label: "مرفوض", variant: "destructive" },
};

export default function JournalManualDetailPage() {
  const [, params] = useRoute("/finance/journal-manual/:id");
  const id = params?.id || "";
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reversalOpen, setReversalOpen] = useState(false);
  const [reversalReason, setReversalReason] = useState("");

  const { data: journal, isLoading, isError, refetch } = useApiQuery<any>(
    ["journal-manual-detail", id],
    id ? `/finance/journal-manual/${id}` : null,
    !!id
  );

  const reverseMut = useMutation({
    mutationFn: (reason: string) =>
      apiFetch(`/finance/journal/${id}/reverse`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      toast({ title: "تم عكس القيد بنجاح" });
      qc.invalidateQueries({ queryKey: ["journal-manual-detail", id] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      setReversalOpen(false);
      setReversalReason("");
      refetch();
    },
    onError: (e: any) => toast({ variant: "destructive", title: e?.message || "فشل عكس القيد" }),
  });

  const lines: any[] = (journal?.lines ?? []).filter((l: any) => l);
  const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);

  const statusCfg = STATUS_CONFIG[journal?.approvalStatus] ?? STATUS_CONFIG.draft;

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
            <p className="text-xs text-gray-500 mb-1">ملاحظات الاعتماد</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{journal.approvalNotes}</p>
          </div>
        )}

        <div className="pt-4 border-t">
          <p className="text-sm font-semibold mb-2">بنود القيد</p>
          <div className="rounded-xl border overflow-hidden text-sm">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">الحساب</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">البيان</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">مدين</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">دائن</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-6 text-gray-400">لا توجد بنود</td></tr>
                ) : lines.map((l: any, i: number) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{l.accountCode}</td>
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="px-3 py-2 font-mono">{l.debit > 0 ? formatCurrency(l.debit) : ""}</td>
                    <td className="px-3 py-2 font-mono">{l.credit > 0 ? formatCurrency(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-gray-500">المجموع</td>
                  <td className="px-3 py-2">{formatCurrency(totalDebit)}</td>
                  <td className="px-3 py-2">{formatCurrency(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
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

  const badges = (
    <div className="flex items-center gap-1">
      <Badge variant="outline">{statusCfg.label}</Badge>
      {journal?.reversedById && <Badge className="bg-yellow-100 text-yellow-700">مُعكوس</Badge>}
      {journal?.reversalOfId && <Badge className="bg-blue-100 text-blue-700">قيد عاكس</Badge>}
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

  return (
    <>
    {journal?.reversedById && (
      <div className="mb-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
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
    />
    <AlertDialog open={reversalOpen} onOpenChange={(open) => { if (!open) { setReversalOpen(false); setReversalReason(""); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
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
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-600 hover:bg-amber-700"
            onClick={(e) => {
              e.preventDefault();
              if (!reversalReason.trim()) {
                toast({ variant: "destructive", title: "السبب مطلوب" });
                return;
              }
              reverseMut.mutate(reversalReason);
            }}
            disabled={reverseMut.isPending}
          >
            {reverseMut.isPending ? "جاري العكس..." : "تأكيد العكس"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value || "—"}</p>
    </div>
  );
}
