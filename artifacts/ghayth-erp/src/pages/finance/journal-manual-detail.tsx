import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EntityDetailPage, type EntityTab } from "@/components/shared/entity-detail-page";
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
} from "lucide-react";

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

  const { data: journal, isLoading, isError, refetch } = useApiQuery<any>(
    ["journal-manual-detail", id],
    id ? `/finance/journal-manual/${id}` : null,
    !!id
  );

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
    <Badge variant="outline">{statusCfg.label}</Badge>
  );

  const notFound = !isLoading && !journal;

  return (
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
      backHref="/finance/journal-manual"
      backLabel="العودة للقيود اليدوية"
      isLoading={isLoading}
      isError={isError || notFound}
      errorMessage={notFound ? "لم يتم العثور على القيد المطلوب" : "تعذر تحميل بيانات القيد"}
      onRetry={() => refetch()}
      tabs={tabs}
      defaultTab="overview"
    />
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
