import { useState } from "react";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Link2, AlertTriangle, Tags, Tag, Pencil } from "lucide-react";
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

const FAILURE_CATEGORIES = [
  "parent_account", "missing_mapping", "missing_party", "missing_config",
  "unlinked_analytic", "period_closed", "unbalanced_entry", "other",
] as const;
const FAILURE_LABEL: Record<string, string> = {
  parent_account: "حساب أب مفقود", missing_mapping: "تعيين مفقود", missing_party: "طرف مفقود",
  missing_config: "إعداد مفقود", unlinked_analytic: "تحليلي غير مربوط", period_closed: "فترة مُقفلة",
  unbalanced_entry: "قيد غير متوازن", other: "أخرى",
};
const LINK_STATUSES = ["active", "needs_linking", "closed", "archived"] as const;

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

  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<AnalyticAccount>(analytic);

  const [linkFor, setLinkFor] = useState<AnalyticAccount | null>(null);
  const [linkForm, setLinkForm] = useState({ status: "active", partyRole: "", partyId: "", seasonId: "", reason: "" });
  const [classifyFor, setClassifyFor] = useState<PostingFailure | null>(null);
  const [classifyForm, setClassifyForm] = useState({ failureCategory: "other", failureReason: "", suggestedFix: "" });

  const linkMut = useApiMutation<unknown, { id: number } & Record<string, unknown>>(
    (body) => `/finance/classification-center/analytic-accounts/${body.id}/link`,
    "PATCH",
    [["classification-center"]],
    { successMessage: "تم ربط الحساب التحليلي" },
  );
  const classifyMut = useApiMutation<unknown, { id: number } & Record<string, unknown>>(
    (body) => `/finance/classification-center/posting-failures/${body.id}/classify`,
    "POST",
    [["classification-center"]],
    { successMessage: "تم تصنيف الإخفاق" },
  );

  const submitLink = () => {
    if (!linkFor) return;
    const b: { id: number } & Record<string, unknown> = { id: linkFor.id, status: linkForm.status };
    if (linkForm.partyRole.trim()) b.partyRole = linkForm.partyRole.trim();
    if (Number(linkForm.partyId) > 0) b.partyId = Number(linkForm.partyId);
    if (Number(linkForm.seasonId) > 0) b.seasonId = Number(linkForm.seasonId);
    if (linkForm.reason.trim()) b.reason = linkForm.reason.trim();
    linkMut.mutate(b, { onSuccess: () => setLinkFor(null) });
  };
  const submitClassify = () => {
    if (!classifyFor) return;
    const b: { id: number } & Record<string, unknown> = { id: classifyFor.id, failureCategory: classifyForm.failureCategory };
    if (classifyForm.failureReason.trim()) b.failureReason = classifyForm.failureReason.trim();
    if (classifyForm.suggestedFix.trim()) b.suggestedFix = classifyForm.suggestedFix.trim();
    classifyMut.mutate(b, { onSuccess: () => setClassifyFor(null) });
  };

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
    {
      key: "_link",
      header: "",
      render: (r) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <GuardedButton perm="finance:create" variant="ghost" size="icon" title="ربط الحساب"
            onClick={() => { setLinkForm({ status: "active", partyRole: r.partyRole || "", partyId: r.partyId ? String(r.partyId) : "", seasonId: r.seasonId ? String(r.seasonId) : "", reason: "" }); setLinkFor(r); }}>
            <Link2 className="h-4 w-4 text-amber-600" />
          </GuardedButton>
        </div>
      ),
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
    {
      key: "_classify",
      header: "",
      render: (r) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <GuardedButton perm="finance:create" variant="ghost" size="icon" title="تصنيف الإخفاق"
            onClick={() => { setClassifyForm({ failureCategory: r.failureCategory || "other", failureReason: r.failureReason || "", suggestedFix: r.suggestedFix || "" }); setClassifyFor(r); }}>
            <Tag className="h-4 w-4 text-status-info-foreground" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="مركز التصنيف المحاسبي"
      subtitle="حسابات تحليلية أُنشئت تلقائياً وتحتاج ربطاً بطرف/موسم، وإخفاقات ترحيل تنتظر تصنيفاً — راجِعها وخطِّط معالجتها"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "مركز التصنيف" }]}
      loading={summaryQ.isLoading}
      actions={
        <PrintButton
          entityType="report_finance_classification_analytic"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "حسابات تحليلية تحتاج ربطاً", total: printRows.length },
            items: printRows.map((r) => ({
              "الحساب التحليلي": r.name,
              "الرمز": r.code || "—",
              "المصدر": r.sourceModule || "—",
              "الطرف/الدور": r.partyRole || "—",
              "الحالة": "تحتاج ربطاً",
              "أُنشئ": formatDateAr(r.createdAt),
            })),
          })}
        />
      }
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
          <p className="text-xs text-muted-foreground">اربط كل حساب تحليلي بطرفه/موسمه من زر الربط في صفّه.</p>
          <DataTable
            columns={analyticCols}
            data={analytic}
            onSortedDataChange={setPrintRows}
            isLoading={analyticQ.isLoading}
            isError={analyticQ.isError}
            error={analyticQ.error as Error | null}
            onRetry={() => analyticQ.refetch()}
            emptyMessage="لا توجد حسابات تحليلية تنتظر الربط"
            searchPlaceholder="بحث بالاسم أو الرمز..."
          />
        </TabsContent>

        <TabsContent value="failures" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">صنِّف كل إخفاق وسجِّل الإصلاح المقترح من زر التصنيف في صفّه.</p>
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

      {/* Link analytic account */}
      <Dialog open={!!linkFor} onOpenChange={(o) => !o && setLinkFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>ربط الحساب التحليلي — {linkFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>الحالة</Label>
                <Select value={linkForm.status} onValueChange={(v) => setLinkForm({ ...linkForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LINK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>دور الطرف</Label>
                <Input value={linkForm.partyRole} onChange={(e) => setLinkForm({ ...linkForm, partyRole: e.target.value })} placeholder="tenant / supplier ..." />
              </div>
              <div className="space-y-1.5">
                <Label>معرّف الطرف</Label>
                <Input type="number" value={linkForm.partyId} onChange={(e) => setLinkForm({ ...linkForm, partyId: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>معرّف الموسم (اختياري)</Label>
                <Input type="number" value={linkForm.seasonId} onChange={(e) => setLinkForm({ ...linkForm, seasonId: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>سبب الربط (اختياري)</Label>
              <Textarea rows={2} value={linkForm.reason} onChange={(e) => setLinkForm({ ...linkForm, reason: e.target.value })} />
            </div>
            {linkMut.isError && <p className="text-sm text-destructive">{getErrorMessage(linkMut.error)}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkFor(null)}>إلغاء</Button>
            <GuardedButton perm="finance:create" onClick={submitLink} disabled={linkMut.isPending}>
              {linkMut.isPending ? "جاري الربط..." : "ربط"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Classify posting failure */}
      <Dialog open={!!classifyFor} onOpenChange={(o) => !o && setClassifyFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>تصنيف الإخفاق — {classifyFor?.sourceType} #{classifyFor?.sourceId}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>التصنيف</Label>
              <Select value={classifyForm.failureCategory} onValueChange={(v) => setClassifyForm({ ...classifyForm, failureCategory: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FAILURE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{FAILURE_LABEL[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>السبب (اختياري)</Label>
              <Textarea rows={2} value={classifyForm.failureReason} onChange={(e) => setClassifyForm({ ...classifyForm, failureReason: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>الإصلاح المقترح (اختياري)</Label>
              <Textarea rows={2} value={classifyForm.suggestedFix} onChange={(e) => setClassifyForm({ ...classifyForm, suggestedFix: e.target.value })} />
            </div>
            {classifyMut.isError && <p className="text-sm text-destructive">{getErrorMessage(classifyMut.error)}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClassifyFor(null)}>إلغاء</Button>
            <GuardedButton perm="finance:create" onClick={submitClassify} disabled={classifyMut.isPending}>
              {classifyMut.isPending ? "جاري التصنيف..." : "تصنيف"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
