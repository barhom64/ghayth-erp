import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { CheckCircle2 } from "lucide-react";
import { formatNumber } from "@/lib/formatters";

/**
 * Account-usage gaps report (#1715). Lists chart-of-accounts rows the
 * auto-classifier could not classify (accountUsage IS NULL), so an operator
 * can «classify before posting». Postable accounts are the highest priority
 * because they may be picked as payment sources. Consumes the existing
 * /finance/accounts/usage-gaps endpoint.
 */

const TYPE_LABELS: Record<string, string> = {
  asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات",
};

interface GapAccount {
  id: number;
  code: string;
  name: string;
  type: string;
  allowPosting: boolean;
  branchId: number | null;
}
interface GapsResponse {
  data: GapAccount[];
  total: number;
  byType: Record<string, number>;
}

export default function AccountsUsageGaps() {
  const { data, isLoading, isError } = useApiQuery<GapsResponse>(["accounts-usage-gaps"], "/finance/accounts/usage-gaps");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const byType = data?.byType ?? {};

  const columns: DataTableColumn<GapAccount>[] = [
    { key: "code", header: "الرمز", render: (a) => <span className="font-mono text-status-info-foreground text-xs">{a.code}</span> },
    { key: "name", header: "اسم الحساب", render: (a) => <span className="font-medium">{a.name}</span> },
    { key: "type", header: "النوع", render: (a) => <Badge className="text-xs">{TYPE_LABELS[a.type] ?? a.type}</Badge> },
    {
      key: "allowPosting", header: "الأولوية",
      render: (a) => a.allowPosting
        ? <Badge className="bg-status-warning-surface text-status-warning-foreground text-xs">قابل للترحيل — صنّفه أولاً</Badge>
        : <span className="text-muted-foreground text-xs">تجميعي</span>,
    },
    {
      key: "actions", header: "",
      render: (a) => <Link href={`/finance/accounts/${a.id}/edit`} className="text-status-info-foreground text-xs hover:underline">تصنيف الآن</Link>,
    },
  ];

  return (
    <PageShell
      title="فجوات تصنيف الحسابات"
      subtitle="حسابات بلا تصنيف استخدام (accountUsage) — صنّفها قبل الترحيل حتى تعمل ضوابط طرق الدفع والتوحيد بدقّة (#1715)"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/accounts", label: "الحسابات" },
        { label: "فجوات التصنيف" },
      ]}
    >
      {total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center flex flex-col items-center gap-2 text-status-success-foreground">
            <CheckCircle2 className="h-8 w-8" />
            <div className="font-medium">كل الحسابات مُصنّفة — لا توجد فجوات.</div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-status-warning-foreground tabular-nums">{formatNumber(total)}</div>
                <div className="text-xs text-muted-foreground">إجمالي غير المصنّف</div>
              </CardContent>
            </Card>
            {Object.entries(byType).map(([t, c]) => (
              <Card key={t}>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold tabular-nums">{formatNumber(c)}</div>
                  <div className="text-xs text-muted-foreground">{TYPE_LABELS[t] ?? t}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <DataTable columns={columns} data={rows} emptyMessage="—" pageSize={50} />
        </>
      )}
    </PageShell>
  );
}
