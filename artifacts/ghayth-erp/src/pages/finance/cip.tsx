import { useApiQuery, useApiMutation } from "@/lib/api";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { Card, CardContent } from "@/components/ui/card";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Building2, CheckCircle2, HardHat } from "lucide-react";
import { formatDateAr, formatCurrency, todayLocal } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

/**
 * الأعمال الرأسمالية تحت التنفيذ (CIP — construction_in_progress).
 *
 * Surfaces the CIP engine (finance-algorithms.ts) that had no UI: capital
 * projects accumulating cost before being capitalised into a fixed asset.
 * v1 = list + the capitalise action (the value that was unreachable). Adding
 * cost lines / creating a project keep their POST endpoints for a follow-up.
 *
 *   GET  /finance/cip                 → { data: Cip[], total }
 *   POST /finance/cip/:id/capitalize  → creates the fixed asset + JE
 */

const STATUS: Record<string, { label: string; cls: string }> = {
  in_progress: { label: "قيد التنفيذ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  capitalized: { label: "مُرسمَل",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  on_hold:     { label: "معلّق",       cls: "bg-muted text-muted-foreground" },
  cancelled:   { label: "ملغى",        cls: "bg-muted text-muted-foreground" },
};

interface Cip {
  id: number;
  code?: string;
  name: string;
  category?: string;
  totalCost: number;
  costEntryCount: number;
  startDate?: string;
  expectedCompletionDate?: string;
  status: string;
}

export default function CipPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";

  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["cip", scopeQueryString],
    `/finance/cip${scopeSuffix}`,
  );
  const items: Cip[] = (data?.data || []) as Cip[];

  // capitalizationDate defaults to today; the backend rejects a closed period.
  const capMut = useApiMutation<void, { id: number; capitalizationDate: string }>(
    (body) => `/finance/cip/${body.id}/capitalize`,
    "POST",
    [["cip"]],
    { successMessage: "تمت رسملة المشروع وإنشاء الأصل الثابت" },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const inProgress = items.filter((r) => r.status === "in_progress").length;
  const capitalized = items.filter((r) => r.status === "capitalized").length;
  const accumulated = items
    .filter((r) => r.status === "in_progress")
    .reduce((s, r) => s + Number(r.totalCost ?? 0), 0);

  const columns: DataTableColumn<Cip>[] = [
    {
      key: "name",
      header: "المشروع",
      searchable: true,
      sortable: true,
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">{r.name}</span>
          {r.code && <span className="text-xs text-muted-foreground tabular-nums">{r.code}</span>}
        </div>
      ),
    },
    {
      key: "category",
      header: "الفئة",
      render: (r) => <span className="text-sm text-muted-foreground">{r.category || "—"}</span>,
    },
    {
      key: "totalCost",
      header: "التكلفة المتراكمة",
      sortable: true,
      render: (r) => <span className="tabular-nums font-medium">{formatCurrency(Number(r.totalCost ?? 0))}</span>,
    },
    {
      key: "costEntryCount",
      header: "بنود التكلفة",
      render: (r) => <span className="tabular-nums">{r.costEntryCount ?? 0}</span>,
    },
    {
      key: "expectedCompletionDate",
      header: "الإنجاز المتوقع",
      sortable: true,
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.expectedCompletionDate ? formatDateAr(r.expectedCompletionDate) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (r) => {
        const s = STATUS[r.status] || STATUS.on_hold;
        return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
      },
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
          <GuardedButton
            perm="finance:approve"
            variant="outline"
            size="sm"
            title="رسملة المشروع إلى أصل ثابت"
            disabled={capMut.isPending || r.status !== "in_progress" || Number(r.totalCost ?? 0) <= 0}
            onClick={() => capMut.mutate({ id: r.id, capitalizationDate: todayLocal() })}
          >
            <CheckCircle2 className="h-4 w-4 me-1" />
            رسملة
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="الأعمال الرأسمالية تحت التنفيذ"
      subtitle="مشاريع رأسمالية تُجمَّع تكاليفها قبل رسملتها إلى أصل ثابت — تابع التكلفة المتراكمة وارسمِل المكتمل"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الأعمال الرأسمالية" }]}
      loading={isLoading}
    >
      <FinanceTabsNav />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-amber-50 border border-amber-100">
              <HardHat className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">قيد التنفيذ</p>
              <p className="text-xl font-bold text-amber-600">{inProgress}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-emerald-50 border border-emerald-100">
              <Building2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">مُرسمَلة</p>
              <p className="text-xl font-bold text-emerald-600">{capitalized}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">إجمالي الجداول</p>
            <p className="text-xl font-bold">{items.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">تكلفة متراكمة (قيد التنفيذ)</p>
            <p className="text-xl font-bold tabular-nums">{formatCurrency(accumulated)}</p>
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
        emptyMessage="لا توجد مشاريع رأسمالية تحت التنفيذ"
        emptyIcon={<HardHat className="h-10 w-10 mx-auto opacity-30" />}
        searchPlaceholder="بحث بالاسم أو الرمز..."
      />
    </PageShell>
  );
}
