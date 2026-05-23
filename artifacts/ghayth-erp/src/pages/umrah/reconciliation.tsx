import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency } from "@/lib/formatters";
import { Scale, Users, AlertTriangle } from "lucide-react";

// Reconciliation report — backs GET /api/umrah/reports/reconciliation
// (PR #312). Three read-only diff tables: NUSK invoice totals vs posted
// GL, NUSK mutamer count vs system pilgrim count, and overstay rows
// missing a corresponding violation. No mutations — ops eyeballs the
// list, drills into the underlying record from whatever page owns it.

interface AmountDiff {
  id: number;
  nuskInvoiceNumber: string;
  fileTotal: number;
  nuskStatus: string;
  purchaseInvoiceId: number | null;
  journalEntryId: number | null;
  postedAp: number;
  postedRefund: number;
  diff: number;
}

interface CountDiff {
  id: number;
  nuskInvoiceNumber: string;
  fileCount: number;
  groupId: number | null;
  groupName: string | null;
  systemCount: number;
}

interface OverstayGap {
  id: number;
  nuskNumber: string;
  fullName: string;
  overstayDays: number;
  groupId: number | null;
  groupName: string | null;
  subAgentName: string | null;
}

interface Payload {
  summary: {
    amountDiffs: number;
    countDiffs: number;
    overstayGaps: number;
  };
  amountDiffs: AmountDiff[];
  countDiffs: CountDiff[];
  overstayGaps: OverstayGap[];
}

export default function UmrahReconciliation() {
  const { data, isLoading, isError } = useApiQuery<Payload>(
    ["umrah-reconciliation"],
    "/umrah/reports/reconciliation",
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const summary = data?.summary ?? { amountDiffs: 0, countDiffs: 0, overstayGaps: 0 };
  const amountDiffs = data?.amountDiffs ?? [];
  const countDiffs = data?.countDiffs ?? [];
  const overstayGaps = data?.overstayGaps ?? [];

  const amountCols: DataTableColumn<AmountDiff>[] = [
    { key: "nuskInvoiceNumber", header: "رقم نسك", render: (r) => <span className="font-medium">{r.nuskInvoiceNumber}</span> },
    { key: "nuskStatus", header: "الحالة" },
    { key: "fileTotal", header: "إجمالي الملف (ريال)", render: (r) => formatCurrency(Number(r.fileTotal)) },
    { key: "postedAp", header: "AP مرحّل (ريال)", render: (r) => formatCurrency(Number(r.postedAp)) },
    { key: "postedRefund", header: "إرجاع مرحّل (ريال)", render: (r) => formatCurrency(Number(r.postedRefund)) },
    {
      key: "diff",
      header: "الفرق (ريال)",
      render: (r) => (
        <span className={`font-bold ${Number(r.diff) >= 0 ? "text-status-error-foreground" : "text-emerald-700"}`}>
          {formatCurrency(Number(r.diff))}
        </span>
      ),
    },
  ];

  const countCols: DataTableColumn<CountDiff>[] = [
    { key: "nuskInvoiceNumber", header: "رقم نسك", render: (r) => <span className="font-medium">{r.nuskInvoiceNumber}</span> },
    { key: "groupName", header: "المجموعة", render: (r) => r.groupName || "—" },
    { key: "fileCount", header: "العدد بالملف" },
    { key: "systemCount", header: "العدد بالنظام" },
    {
      key: "delta" as any,
      header: "الفرق",
      render: (r) => {
        const d = Number(r.fileCount) - Number(r.systemCount);
        return <span className={`font-bold ${d === 0 ? "" : "text-status-error-foreground"}`}>{d > 0 ? `+${d}` : d}</span>;
      },
    },
  ];

  const overstayCols: DataTableColumn<OverstayGap>[] = [
    { key: "nuskNumber", header: "رقم نسك" },
    { key: "fullName", header: "المعتمر", render: (r) => <span className="font-medium">{r.fullName}</span> },
    { key: "groupName", header: "المجموعة", render: (r) => r.groupName || "—" },
    { key: "subAgentName", header: "الوكيل الفرعي", render: (r) => r.subAgentName || "—" },
    {
      key: "overstayDays",
      header: "أيام التجاوز",
      render: (r) => <span className="font-bold text-status-error-foreground">{r.overstayDays}</span>,
    },
  ];

  const kpis = [
    {
      label: "فروقات المبلغ",
      value: summary.amountDiffs,
      icon: Scale,
      color: summary.amountDiffs > 0 ? "text-status-error-foreground bg-status-error-surface" : "text-emerald-700 bg-emerald-50",
    },
    {
      label: "فروقات العدد",
      value: summary.countDiffs,
      icon: Users,
      color: summary.countDiffs > 0 ? "text-status-warning-foreground bg-status-warning-surface" : "text-emerald-700 bg-emerald-50",
    },
    {
      label: "تجاوزات بلا مخالفة",
      value: summary.overstayGaps,
      icon: AlertTriangle,
      color: summary.overstayGaps > 0 ? "text-status-error-foreground bg-status-error-surface" : "text-emerald-700 bg-emerald-50",
    },
  ];

  return (
    <div dir="rtl" lang="ar" className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">تقرير المطابقة — نسك ↔ النظام</h1>
        <p className="text-sm text-muted-foreground">
          ثلاثة فحوصات للكشف عن انحرافات الاستيراد: مبالغ الفواتير، أعداد المعتمرين، تجاوزات بلا مخالفة مفتوحة
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`rounded-md p-2 ${k.color}`}>
                <k.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="text-xl font-bold">{k.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">فروقات المبلغ ({summary.amountDiffs})</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          الفرق = إجمالي الملف − (AP المرحّل − الإرجاع المرحّل). موجب يعني الملف أعلى من القيود.
        </p>
        <DataTable data={amountDiffs} columns={amountCols} emptyMessage="لا فروقات في المبالغ" />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">فروقات العدد ({summary.countDiffs})</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          مقارنة `mutamerCount` في فاتورة نسك مع عدد المعتمرين الفعليين في المجموعة المربوطة.
        </p>
        <DataTable data={countDiffs} columns={countCols} emptyMessage="لا فروقات في الأعداد" />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">تجاوزات بلا مخالفة ({summary.overstayGaps})</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          معتمرون لديهم `overstayDays &gt; 0` ولا توجد مخالفة مفتوحة عليهم — قد يكون كرون C27 لم يطلق.
        </p>
        <DataTable data={overstayGaps} columns={overstayCols} emptyMessage="لا تجاوزات بلا مخالفة" />
      </section>
    </div>
  );
}
