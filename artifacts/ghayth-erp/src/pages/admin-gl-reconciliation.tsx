import {
  PageShell,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
} from "@workspace/ui-core";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, CheckCircle, AlertTriangle, Scale,
} from "lucide-react";
import { PrintButton } from "@/components/shared/print-button";

function formatAmount(n: number | string): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

export default function AdminGlReconciliation() {
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["gl-reconciliation"], "/admin/governance/gl-reconciliation"
  );

  const healthy = data?.healthy ?? true;
  const driftCount = data?.driftCount ?? 0;
  const mismatches = data?.mismatches ?? [];

  const [filters, setFilters] = useFilters();
  const filteredMismatches = applyFilters(mismatches, filters, {
    searchFields: ["code", "name"],
  });

  const mismatchColumns: DataTableColumn<any>[] = [
    { key: "code", header: "الكود", searchable: true, render: (r: any) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "name", header: "اسم الحساب", searchable: true },
    { key: "stored_balance", header: "الرصيد المخزن", render: (r: any) => <span className="text-xs font-mono">{formatAmount(r.stored_balance)}</span> },
    { key: "computed_balance", header: "الرصيد المحسوب", render: (r: any) => <span className="text-xs font-mono">{formatAmount(r.computed_balance)}</span> },
    { key: "drift", header: "الانحراف", sortable: true, render: (r: any) => (
      <Badge className={Number(r.drift) > 0 ? "bg-status-error-surface text-status-error-foreground" : "bg-status-warning-surface text-status-warning-foreground"}>
        {formatAmount(r.drift)}
      </Badge>
    )},
  ];

  return (
    <PageShell
      title="مطابقة دفتر الأستاذ"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "مطابقة دفتر الأستاذ" },
      ]}
      subtitle="مقارنة الأرصدة المخزنة بالأرصدة المحسوبة من القيود"
      loading={isLoading}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_gl_reconciliation"
            entityId="list"
            size="icon"
            label="طباعة تقرير المطابقة"
            payload={() => ({
              entity: {
                title: "مطابقة دفتر الأستاذ",
                healthy,
                driftCount,
                totalMismatches: mismatches.length,
                status: healthy ? "جميع الحسابات متطابقة" : `${driftCount} حساب بانحراف`,
              },
              items: mismatches.map((r: any) => ({
                "الكود": r.code,
                "اسم الحساب": r.name,
                "الرصيد المخزن": formatAmount(r.stored_balance),
                "الرصيد المحسوب": formatAmount(r.computed_balance),
                "الانحراف": formatAmount(r.drift),
              })),
            })}
          />
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 me-1" />فحص
          </Button>
        </div>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="space-y-6">
          <Card className={healthy ? "border-status-success-surface bg-status-success-surface" : "border-status-error-surface bg-status-error-surface"}>
            <CardContent className="p-6 flex items-center gap-4">
              {healthy ? (
                <CheckCircle className="w-12 h-12 text-status-success-foreground" />
              ) : (
                <AlertTriangle className="w-12 h-12 text-status-error-foreground" />
              )}
              <div>
                <p className="text-lg font-bold">
                  {healthy
                    ? "جميع الحسابات متطابقة — لا يوجد انحراف"
                    : `${driftCount} حساب بانحراف في الرصيد`}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  يقارن الرصيد الحالي (currentBalance) بمجموع قيود اليومية (مدين − دائن) لكل حساب
                </p>
              </div>
            </CardContent>
          </Card>

          {mismatches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2 text-status-error-foreground">
                  <Scale className="w-4 h-4" />
                  حسابات بانحراف ({mismatches.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="p-4 pb-0">
                  <AdvancedFilters
                    config={{ searchPlaceholder: "بحث بالكود أو اسم الحساب…", showDateRange: false }}
                    values={filters}
                    onChange={setFilters}
                    resultCount={filteredMismatches.length}
                  />
                </div>
                <DataTable
                  columns={mismatchColumns}
                  data={filteredMismatches}
                  noToolbar
                  pageSize={0}
                />
              </CardContent>
            </Card>
          )}

          {healthy && data && (
            <Card className="border-status-success-surface">
              <CardContent className="p-8 text-center">
                <Scale className="w-12 h-12 mx-auto mb-3 text-status-success" />
                <p className="text-lg font-bold text-status-success-foreground">مطابقة تامة</p>
                <p className="text-sm text-muted-foreground mt-1">
                  جميع الأرصدة المخزنة تتطابق مع مجاميع قيود اليومية بفارق أقل من 0.01
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}
