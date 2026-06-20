import { useApiQuery } from "@/lib/api";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight, ShieldAlert, Wrench } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

/**
 * حسابات فرعية مغلوطة الأبوّة — datafix review (READ ONLY, #2090).
 *
 * Surfaces buildMisparentedSubsidiaryInventory: legacy per-entity subsidiary
 * sheets opened under the WRONG control parent (pre-#2070). The backend is
 * intentionally report-only (no reparent/migration); this page mirrors that —
 * it REVIEWS and PLANS, with no mutation. The correction ships in a separate
 * finance-reviewed PR.
 *
 *   GET /finance/datafix/misparented-subsidiaries
 *       → { data: MisparentedSubsidiaryRow[], total, summary }
 */

const SEVERITY: Record<string, { label: string; cls: string }> = {
  high:   { label: "مرتفع",  cls: "bg-red-50 text-red-700 border-red-200" },
  medium: { label: "متوسط",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  low:    { label: "منخفض",  cls: "bg-muted text-muted-foreground" },
};

interface MisparentedRow {
  subsidiaryId: number;
  accountCode: string;
  accountName: string;
  entityType: string;
  entityName: string | null;
  currentParentCode: string | null;
  currentParentName: string | null;
  proposedParentCode: string | null;
  proposedParentName: string | null;
  currentBalance: number;
  suspicionReason: string;
  severity: string;
  autoFixable: boolean;
}

export default function MisparentedSubsidiariesPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["misparented-subsidiaries", scopeQueryString],
    `/finance/datafix/misparented-subsidiaries${scopeSuffix}`,
  );
  const items: MisparentedRow[] = (data?.data || []) as MisparentedRow[];
  const autoFixable = items.filter((r) => r.autoFixable).length;
  const needsReview = items.length - autoFixable;
  const balanceAtRisk = items.reduce((s, r) => s + Math.abs(Number(r.currentBalance ?? 0)), 0);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const columns: DataTableColumn<MisparentedRow>[] = [
    {
      key: "accountCode",
      header: "الحساب الفرعي",
      searchable: true,
      sortable: true,
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium tabular-nums">{r.accountCode}</span>
          <span className="text-xs text-muted-foreground">{r.accountName}</span>
        </div>
      ),
    },
    {
      key: "entityName",
      header: "الجهة",
      searchable: true,
      render: (r) => (
        <span className="text-sm">{r.entityName || "—"} <span className="text-xs text-muted-foreground">({r.entityType})</span></span>
      ),
    },
    {
      key: "parent",
      header: "الأب الحالي ← المقترح",
      render: (r) => (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-red-600 tabular-nums">{r.currentParentCode || "—"}</span>
          <ArrowLeftRight className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-emerald-600 tabular-nums">{r.proposedParentCode || "—"}</span>
        </div>
      ),
    },
    {
      key: "currentBalance",
      header: "الرصيد",
      sortable: true,
      render: (r) => <span className="tabular-nums">{formatCurrency(Number(r.currentBalance ?? 0))}</span>,
    },
    {
      key: "severity",
      header: "الخطورة",
      sortable: true,
      render: (r) => {
        const s = SEVERITY[r.severity] || SEVERITY.low;
        return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
      },
    },
    {
      key: "autoFixable",
      header: "التصحيح",
      render: (r) =>
        r.autoFixable
          ? <Badge variant="outline" className="text-emerald-600 border-emerald-200">آلي</Badge>
          : <Badge variant="outline" className="text-amber-600 border-amber-200">يدوي</Badge>,
    },
    {
      key: "suspicionReason",
      header: "السبب",
      render: (r) => <span className="text-xs text-muted-foreground">{r.suspicionReason}</span>,
    },
  ];

  return (
    <PageShell
      title="حسابات فرعية مغلوطة الأبوّة"
      subtitle="مراجعة (قراءة فقط) للحسابات الفرعية المفتوحة تحت أب رقابي خاطئ — للتخطيط؛ التصحيح يُشحن في إصلاح مالي منفصل"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "تشخيص أبوّة الحسابات" }]}
      loading={isLoading}
    >
      <FinanceTabsNav />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-red-50 border border-red-100">
              <ShieldAlert className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">الإجمالي</p>
              <p className="text-xl font-bold">{items.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-emerald-50 border border-emerald-100">
              <Wrench className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">قابل للتصحيح الآلي</p>
              <p className="text-xl font-bold text-emerald-600">{autoFixable}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">يحتاج مراجعة</p>
            <p className="text-xl font-bold text-amber-600">{needsReview}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">رصيد معرّض للخطر</p>
            <p className="text-xl font-bold tabular-nums">{formatCurrency(balanceAtRisk)}</p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد حسابات فرعية مغلوطة الأبوّة"
        emptyIcon={<ShieldAlert className="h-10 w-10 mx-auto opacity-30 text-emerald-500" />}
        searchPlaceholder="بحث بالحساب أو الجهة..."
      />
    </PageShell>
  );
}
