import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EntityDetailPage, type EntityTab } from "@/components/shared/entity-detail-page";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { EntityComments } from "@/components/shared/entity-comments";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  Activity, CalendarClock, History, MessageCircle, ListChecks, FileText, Calendar, Hash,
} from "lucide-react";

const FREQUENCY_LABEL: Record<string, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
  quarterly: "ربع سنوي",
  yearly: "سنوي",
};

export default function RecurringJournalDetailPage() {
  const [, params] = useRoute("/finance/recurring-journals/:id");
  const id = params?.id || "";

  const { data: rj, isLoading, isError, refetch } = useApiQuery<any>(
    ["recurring-journal-detail", id],
    id ? `/finance/recurring-journals/${id}` : null,
    !!id
  );

  const templateLines: any[] = (() => {
    if (!rj) return [];
    const raw = rj.templateLines;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return []; }
    }
    return [];
  })();

  const totalDebit = templateLines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
  const totalCredit = templateLines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);

  const overviewContent = () => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="الاسم" value={rj?.name} />
          <InfoRow label="التكرار" value={FREQUENCY_LABEL[rj?.frequency] || rj?.frequency} />
          <InfoRow label="تاريخ البدء" value={rj?.startDate ? formatDateAr(rj.startDate) : "—"} />
          <InfoRow label="التنفيذ القادم" value={rj?.nextRunDate ? formatDateAr(rj.nextRunDate) : "—"} />
          <InfoRow label="آخر تنفيذ" value={rj?.lastRunDate ? formatDateAr(rj.lastRunDate) : "—"} />
          <InfoRow label="عدد التنفيذات" value={String(rj?.runsCount ?? 0)} />
          <InfoRow label="الحالة" value={rj?.active ? "نشط" : "متوقف"} />
          <InfoRow label="الوصف" value={rj?.description} />
        </div>
      </CardContent>
    </Card>
  );

  const templateTabContent = () => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6">
        <p className="text-sm font-semibold mb-3">قالب بنود القيد</p>
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
              {templateLines.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-gray-400">لا توجد بنود في القالب</td></tr>
              ) : templateLines.map((l: any, i: number) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{l.accountCode}</td>
                  <td className="px-3 py-2">{l.description || "—"}</td>
                  <td className="px-3 py-2 font-mono">{Number(l.debit) > 0 ? formatCurrency(Number(l.debit)) : ""}</td>
                  <td className="px-3 py-2 font-mono">{Number(l.credit) > 0 ? formatCurrency(Number(l.credit)) : ""}</td>
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
      </CardContent>
    </Card>
  );

  const historyTabContent = () => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6">
        <p className="text-sm font-semibold mb-3">سجل التنفيذات السابقة</p>
        {!rj?.history || rj.history.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">لا توجد تنفيذات سابقة</p>
        ) : (
          <div className="rounded-xl border overflow-hidden text-sm">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">تاريخ التنفيذ</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">القيد الناتج</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">الحالة</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">الطريقة</th>
                </tr>
              </thead>
              <tbody>
                {rj.history.map((h: any) => (
                  <tr key={h.id} className="border-t">
                    <td className="px-3 py-2">{h.runDate ? formatDateAr(h.runDate) : "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{h.journalRef || `#${h.journalEntryId}` || "—"}</td>
                    <td className="px-3 py-2">
                      {h.status === "success"
                        ? <Badge className="bg-green-100 text-green-700">نجاح</Badge>
                        : <Badge className="bg-red-100 text-red-700">فشل</Badge>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{h.triggeredBy === "manual" ? "يدوي" : "تلقائي"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const tabs: EntityTab[] = [
    { key: "overview", label: "نظرة عامة", icon: Activity, content: overviewContent },
    { key: "template", label: "قالب القيد", icon: ListChecks, content: templateTabContent },
    { key: "history", label: "السجل", icon: History, content: historyTabContent, badge: rj?.history?.length },
    {
      key: "timeline",
      label: "السجل الزمني",
      icon: History,
      content: () => <EntityTimeline entityType="recurring-journal" entityId={id} />,
    },
    {
      key: "comments",
      label: "التعليقات",
      icon: MessageCircle,
      content: () => <EntityComments entityType="recurring-journal" entityId={id} />,
    },
  ];

  const metaItems = [
    rj?.frequency && { icon: CalendarClock, label: FREQUENCY_LABEL[rj.frequency] || rj.frequency },
    rj?.nextRunDate && { icon: Calendar, label: `قادم: ${formatDateAr(rj.nextRunDate)}` },
    rj?.runsCount != null && { icon: Hash, label: `${rj.runsCount} تنفيذ` },
  ].filter(Boolean) as Array<{ icon: any; label: string }>;

  return (
    <EntityDetailPage
      title={rj?.name ? `قيد دوري: ${rj.name}` : "..."}
      subtitle={rj?.description}
      avatar={{ icon: FileText, gradientFrom: "from-purple-500", gradientTo: "to-indigo-600" }}
      status={
        rj
          ? rj.active
            ? { label: "نشط", variant: "success" }
            : { label: "متوقف", variant: "default" }
          : undefined
      }
      metaItems={metaItems}
      backHref="/finance/recurring-journals"
      backLabel="العودة للقيود الدورية"
      isLoading={isLoading}
      isError={isError}
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
