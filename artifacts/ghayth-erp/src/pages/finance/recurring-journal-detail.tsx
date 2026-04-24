import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DetailPageLayout, type ExtraTab } from "@/components/shared/detail-page-layout";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  ListChecks, History,
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

  const overview = (
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
          <DataTable
            columns={[
              { key: "accountCode", header: "الحساب", render: (r) => <span className="font-mono text-xs">{r.accountCode}</span> },
              { key: "description", header: "البيان", render: (r) => r.description || "—" },
              { key: "debit", header: "مدين", sortable: true, render: (r) => <span className="font-mono">{Number(r.debit) > 0 ? formatCurrency(Number(r.debit)) : ""}</span> },
              { key: "credit", header: "دائن", sortable: true, render: (r) => <span className="font-mono">{Number(r.credit) > 0 ? formatCurrency(Number(r.credit)) : ""}</span> },
            ] satisfies DataTableColumn<any>[]}
            data={templateLines}
            pageSize={0}
            noToolbar
            searchPlaceholder={null}
            emptyMessage="لا توجد بنود في القالب"
            caption={
              templateLines.length > 0 ? (
                <div className="flex justify-between bg-gray-50 font-semibold px-3 py-2 text-sm">
                  <span className="text-gray-500">المجموع</span>
                  <div className="flex gap-8">
                    <span>{formatCurrency(totalDebit)}</span>
                    <span>{formatCurrency(totalCredit)}</span>
                  </div>
                </div>
              ) : null
            }
          />
        </div>
      </CardContent>
    </Card>
  );

  const historyTabContent = () => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6">
        <p className="text-sm font-semibold mb-3">سجل التنفيذات السابقة</p>
        <div className="rounded-xl border overflow-hidden text-sm">
          <DataTable
            columns={[
              { key: "runDate", header: "تاريخ التنفيذ", render: (r) => r.runDate ? formatDateAr(r.runDate) : "—" },
              { key: "journalRef", header: "القيد الناتج", render: (r) => <span className="font-mono text-xs">{r.journalRef || `#${r.journalEntryId}` || "—"}</span> },
              { key: "status", header: "الحالة", render: (r) => r.status === "success" ? <Badge className="bg-green-100 text-green-700">نجاح</Badge> : <Badge className="bg-red-100 text-red-700">فشل</Badge> },
              { key: "triggeredBy", header: "الطريقة", render: (r) => <span className="text-xs text-gray-500">{r.triggeredBy === "manual" ? "يدوي" : "تلقائي"}</span> },
            ] satisfies DataTableColumn<any>[]}
            data={rj?.history ?? []}
            pageSize={0}
            noToolbar
            searchPlaceholder={null}
            emptyMessage="لا توجد تنفيذات سابقة"
          />
        </div>
      </CardContent>
    </Card>
  );

  const extraTabs: ExtraTab[] = [
    { key: "template", label: "قالب القيد", icon: ListChecks, content: templateTabContent },
    { key: "history", label: "السجل", icon: History, content: historyTabContent, badge: rj?.history?.length },
  ];

  return (
    <DetailPageLayout
      title={rj?.name ? `قيد دوري: ${rj.name}` : "القيد الدوري"}
      subtitle={rj?.description}
      backPath="/finance/recurring-journals"
      backLabel="العودة للقيود الدورية"
      status={
        rj
          ? rj.active
            ? { label: "نشط", tone: "success" }
            : { label: "متوقف", tone: "muted" }
          : undefined
      }
      createdAt={rj?.createdAt}
      updatedAt={rj?.updatedAt}
      entityType="recurring_journal"
      entityId={id}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={() => refetch()}
      overview={overview}
      extraTabs={extraTabs}
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
