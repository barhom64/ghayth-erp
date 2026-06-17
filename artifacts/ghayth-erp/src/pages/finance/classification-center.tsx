import { useApiQuery } from "@/lib/api";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Link2, AlertTriangle, Tags } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

/**
 * مركز التصنيف المحاسبي (accounting-engine, #2197).
 *
 * Surfaces the dynamic-analytic-accounts diagnostic engine that had no UI:
 *  - analytic accounts auto-created with status='needs_linking' (a posting ran
 *    against a party/season/… that wasn't pre-linked), and
 *  - financial_posting_failures awaiting a category/fix.
 *
 * v1 = the read surface (summary + both worklists). The link (party pickers)
 * and classify (category/reason/fix) write actions keep their PATCH/POST
 * endpoints for a follow-up — see the v2 note in each tab.
 *
 *   GET /finance/classification-center                    → summary
 *   GET /finance/classification-center/analytic-accounts  → { data, total }
 *   GET /finance/classification-center/posting-failures   → { data, total }
 */

interface AnalyticAccount {
  id: number;
  name: string;
  code: string | null;
  sourceModule: string | null;
  seasonId: number | null;
  partyId: number | null;
  partyRole: string | null;
  linkingNote: string | null;
  createdAt: string;
}

interface PostingFailure {
  id: number;
  sourceType: string;
  sourceId: number | null;
  error: string;
  failureCategory: string | null;
  failureReason: string | null;
  suggestedFix: string | null;
  createdAt: string;
}

export default function ClassificationCenterPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const andScope = scopeQueryString ? `&${scopeQueryString}` : "";

  const summaryQ = useApiQuery<any>(
    ["classification-center", "summary", scopeQueryString],
    `/finance/classification-center${scopeSuffix}`,
  );
  const analyticQ = useApiQuery<any>(
    ["classification-center", "analytic", scopeQueryString],
    `/finance/classification-center/analytic-accounts?status=needs_linking${andScope}`,
  );
  const failuresQ = useApiQuery<any>(
    ["classification-center", "failures", scopeQueryString],
    `/finance/classification-center/posting-failures${scopeSuffix}`,
  );

  const summary = summaryQ.data || {};
  const analytic: AnalyticAccount[] = (analyticQ.data?.data || []) as AnalyticAccount[];
  const failures: PostingFailure[] = (failuresQ.data?.data || []) as PostingFailure[];
  const byCategory: Array<{ category: string; count: number }> = summary.postingFailuresByCategory || [];

  if (summaryQ.isLoading) return <LoadingSpinner />;
  if (summaryQ.isError) return <ErrorState />;

  const analyticCols: DataTableColumn<AnalyticAccount>[] = [
    {
      key: "name",
      header: "الحساب التحليلي",
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
      key: "sourceModule",
      header: "المصدر",
      render: (r) => <span className="text-sm text-muted-foreground">{r.sourceModule || "—"}</span>,
    },
    {
      key: "partyRole",
      header: "الطرف/الدور",
      render: (r) => (
        <span className="text-sm">{r.partyRole || "—"}{r.partyId ? <span className="text-xs text-muted-foreground"> #{r.partyId}</span> : null}</span>
      ),
    },
    {
      key: "linkingNote",
      header: "ملاحظة الربط",
      render: (r) => <span className="text-xs text-muted-foreground">{r.linkingNote || "—"}</span>,
    },
    {
      key: "createdAt",
      header: "أُنشئ",
      sortable: true,
      render: (r) => <span className="text-xs text-muted-foreground">{formatDateAr(r.createdAt)}</span>,
    },
  ];

  const failureCols: DataTableColumn<PostingFailure>[] = [
    {
      key: "sourceType",
      header: "المصدر",
      searchable: true,
      sortable: true,
      render: (r) => (
        <span className="text-sm">{r.sourceType}{r.sourceId ? <span className="text-xs text-muted-foreground"> #{r.sourceId}</span> : null}</span>
      ),
    },
    {
      key: "failureCategory",
      header: "التصنيف",
      sortable: true,
      render: (r) =>
        r.failureCategory
          ? <Badge variant="outline">{r.failureCategory}</Badge>
          : <Badge variant="destructive">غير مصنّف</Badge>,
    },
    {
      key: "error",
      header: "الخطأ",
      searchable: true,
      render: (r) => <span className="text-xs text-muted-foreground line-clamp-2">{r.failureReason || r.error || "—"}</span>,
    },
    {
      key: "suggestedFix",
      header: "الإصلاح المقترح",
      render: (r) => <span className="text-xs text-muted-foreground">{r.suggestedFix || "—"}</span>,
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (r) => <span className="text-xs text-muted-foreground">{formatDateAr(r.createdAt)}</span>,
    },
  ];

  return (
    <PageShell
      title="مركز التصنيف المحاسبي"
      subtitle="حسابات تحليلية أُنشئت تلقائياً وتحتاج ربطاً بطرف/موسم، وإخفاقات ترحيل تنتظر تصنيفاً — راجِعها وخطِّط معالجتها"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "مركز التصنيف" }]}
      loading={summaryQ.isLoading}
    >
      <FinanceTabsNav />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-amber-50 border border-amber-100">
              <Link2 className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">تحتاج ربطاً</p>
              <p className="text-xl font-bold text-amber-600">{Number(summary.needsLinkingCount ?? analytic.length)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-red-50 border border-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إخفاقات ترحيل غير محلولة</p>
              <p className="text-xl font-bold text-red-600">{Number(summary.postingFailuresUnresolved ?? failures.length)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Tags className="h-3.5 w-3.5" /> الإخفاقات حسب التصنيف</p>
            <div className="flex flex-wrap gap-1">
              {byCategory.length === 0
                ? <span className="text-sm text-muted-foreground">—</span>
                : byCategory.map((c) => (
                    <Badge key={c.category} variant="outline" className="text-xs">{c.category}: {c.count}</Badge>
                  ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="analytic" className="mt-2">
        <TabsList>
          <TabsTrigger value="analytic">حسابات تحتاج ربطاً ({analytic.length})</TabsTrigger>
          <TabsTrigger value="failures">إخفاقات الترحيل ({failures.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="analytic" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">الربط بطرف/موسم يُدار حالياً من الواجهة الخلفية — أداة الربط ضمن الواجهة قادمة.</p>
          <DataTable
            columns={analyticCols}
            data={analytic}
            isLoading={analyticQ.isLoading}
            isError={analyticQ.isError}
            error={analyticQ.error as Error | null}
            onRetry={() => analyticQ.refetch()}
            emptyMessage="لا توجد حسابات تحليلية تنتظر الربط"
            searchPlaceholder="بحث بالاسم أو الرمز..."
          />
        </TabsContent>

        <TabsContent value="failures" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">تصنيف الإخفاق وإصلاحه يُدار حالياً من الواجهة الخلفية — أداة التصنيف ضمن الواجهة قادمة.</p>
          <DataTable
            columns={failureCols}
            data={failures}
            isLoading={failuresQ.isLoading}
            isError={failuresQ.isError}
            error={failuresQ.error as Error | null}
            onRetry={() => failuresQ.refetch()}
            emptyMessage="لا توجد إخفاقات ترحيل غير محلولة"
            searchPlaceholder="بحث بالمصدر أو الخطأ..."
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
