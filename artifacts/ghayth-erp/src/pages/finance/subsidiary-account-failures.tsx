import { useApiQuery, useApiMutation } from "@/lib/api";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Card, CardContent } from "@/components/ui/card";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, RefreshCw, CheckCircle2 } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

/**
 * طابور فشل تأسيس الحسابات الفرعية (accounting-engine).
 *
 * Surfaces subsidiary_account_provisioning_failures — entities (vehicle /
 * property / employee / …) whose per-entity subsidiary accounts could not be
 * auto-provisioned, blocking their postings. The engine + retry existed with no
 * UI (FINANCE hidden-services). This lists the open failures and exposes the
 * per-row retry.
 *
 *   GET  /finance/subsidiary-account-failures            → { data, total, openCount }
 *   POST /finance/subsidiary-account-failures/:id/retry  → { id, resolved, message }
 */

const ENTITY_LABEL: Record<string, string> = {
  vehicle:  "مركبة",
  property: "عقار",
  employee: "موظف",
  project:  "مشروع",
  client:   "عميل",
  supplier: "مورد",
  unit:     "وحدة",
};

interface ProvisioningFailure {
  id: number;
  entityType: string;
  entityId: number;
  entityName?: string;
  missingAccountTypes?: string[] | string;
  reason?: string;
  retryCount: number;
  resolved: boolean;
  resolvedAt?: string;
  firstSeenAt: string;
  lastAttemptAt?: string;
}

export default function SubsidiaryAccountFailuresPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["subsidiary-account-failures", scopeQueryString],
    `/finance/subsidiary-account-failures${scopeSuffix}`,
  );
  const items: ProvisioningFailure[] = (data?.data || []) as ProvisioningFailure[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);

  const retryMut = useApiMutation<void, { id: number }>(
    (body) => `/finance/subsidiary-account-failures/${body.id}/retry`,
    "POST",
    [["subsidiary-account-failures"]],
    { successMessage: "تمت إعادة محاولة التأسيس" },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const openCount = items.filter((r) => !r.resolved).length;
  const resolvedCount = items.length - openCount;

  const missingList = (m: ProvisioningFailure["missingAccountTypes"]): string[] =>
    Array.isArray(m) ? m : typeof m === "string" && m ? m.split(",").map((x) => x.trim()) : [];

  const columns: DataTableColumn<ProvisioningFailure>[] = [
    {
      key: "entityName",
      header: "الجهة",
      searchable: true,
      sortable: true,
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">{r.entityName || `#${r.entityId}`}</span>
          <span className="text-xs text-muted-foreground">{ENTITY_LABEL[r.entityType] || r.entityType}</span>
        </div>
      ),
    },
    {
      key: "missingAccountTypes",
      header: "الحسابات الناقصة",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {missingList(r.missingAccountTypes).map((t) => (
            <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
          )) || <span className="text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      key: "reason",
      header: "السبب",
      searchable: true,
      render: (r) => <span className="text-sm text-muted-foreground">{r.reason || "—"}</span>,
    },
    {
      key: "retryCount",
      header: "المحاولات",
      sortable: true,
      render: (r) => <span className="tabular-nums">{r.retryCount ?? 0}</span>,
    },
    {
      key: "resolved",
      header: "الحالة",
      render: (r) =>
        r.resolved
          ? <Badge variant="outline" className="text-emerald-600 border-emerald-200">مُغلق</Badge>
          : <Badge variant="destructive">مفتوح</Badge>,
    },
    {
      key: "lastAttemptAt",
      header: "آخر محاولة",
      sortable: true,
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.lastAttemptAt ? formatDateAr(r.lastAttemptAt) : (r.firstSeenAt ? formatDateAr(r.firstSeenAt) : "—")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <GuardedButton
            perm="finance:create"
            variant="ghost"
            size="icon"
            title="إعادة محاولة التأسيس"
            disabled={retryMut.isPending || r.resolved}
            onClick={() => retryMut.mutate({ id: r.id })}
          >
            <RefreshCw className="h-4 w-4 text-status-info-foreground" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="فشل تأسيس الحسابات الفرعية"
      subtitle="جهات تعذّر إنشاء حساباتها الفرعية تلقائياً فتعطّلت قيودها — أعد المحاولة بعد إصلاح شجرة الحسابات"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "فشل الحسابات الفرعية" }]}
      loading={isLoading}
      actions={
        <PrintButton
          entityType="report_finance_subsidiary_account_failures"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "فشل تأسيس الحسابات الفرعية", total: printRows.length },
            items: printRows.map((r: any) => ({
              "الجهة": r.entityName || `#${r.entityId}`,
              "النوع": ENTITY_LABEL[r.entityType] || r.entityType,
              "الحسابات الناقصة": missingList(r.missingAccountTypes).join("، ") || "—",
              "السبب": r.reason || "—",
              "المحاولات": r.retryCount ?? 0,
              "الحالة": r.resolved ? "مُغلق" : "مفتوح",
            })),
          })}
        />
      }
    >
      <FinanceTabsNav />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-red-50 border border-red-100">
              <ShieldAlert className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">مفتوحة</p>
              <p className="text-xl font-bold text-red-600">{openCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-emerald-50 border border-emerald-100">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">مُغلقة</p>
              <p className="text-xl font-bold text-emerald-600">{resolvedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">الإجمالي</p>
            <p className="text-xl font-bold">{items.length}</p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={items}
        onSortedDataChange={setPrintRows}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد حالات فشل — كل الحسابات الفرعية مؤسَّسة"
        emptyIcon={<CheckCircle2 className="h-10 w-10 mx-auto opacity-30 text-emerald-500" />}
        searchPlaceholder="بحث بالجهة أو السبب..."
      />
    </PageShell>
  );
}
