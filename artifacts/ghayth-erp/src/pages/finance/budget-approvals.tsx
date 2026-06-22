import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock, Target, Grid3x3, TrendingUp } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface BudgetApprovalRequest {
  id: number;
  accountCode: string;
  accountName: string | null;
  period: string;
  requestedAmount: number | string;
  budgetAmount: number | string;
  utilizationBefore: number | string;
  utilizationAfter: number | string;
  approvalLevel: "auto" | "cfo" | "gm";
  status: "pending" | "approved" | "rejected";
  sourceType: string | null;
  sourceId: number | null;
  reason: string | null;
  requestedBy: number | null;
  requestedAt: string;
  decidedBy: number | null;
  decidedAt: string | null;
  decisionNotes: string | null;
}

const LEVEL_LABEL: Record<BudgetApprovalRequest["approvalLevel"], string> = {
  auto: "تلقائي",
  cfo:  "المدير المالي",
  gm:   "المدير العام",
};

const LEVEL_COLOR: Record<BudgetApprovalRequest["approvalLevel"], string> = {
  auto: "bg-emerald-100 text-emerald-800",
  cfo:  "bg-amber-100 text-status-warning-foreground",
  gm:   "bg-red-100 text-status-error-foreground",
};

export default function BudgetApprovalsPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useFilters({ status: "pending" });
  const [decideId, setDecideId] = useState<number | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<string>("");
  const [decisionType, setDecisionType] = useState<"approve" | "reject" | null>(null);

  const { data, isLoading, isError } = useApiQuery<{ data: BudgetApprovalRequest[] }>(
    ["budget-approvals", filters.status],
    `/finance/budget/approval-requests${filters.status ? `?status=${filters.status}` : ""}`,
  );

  const decideMut = useApiMutation<unknown, { id: number; decision: string; notes?: string }>(
    (b) => `/finance/budget/approval-requests/${b.id}/decide`,
    "POST",
    [["budget-approvals"]],
  );

  const rows = data?.data ?? [];
  const filtered = applyFilters(rows, filters, {
    searchFields: ["accountCode", "accountName", "reason"],
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;


  const totalRequested = rows.reduce((s, r) => s + Number(r.requestedAmount ?? 0), 0);
  const gmCount = rows.filter((r) => r.approvalLevel === "gm").length;
  const cfoCount = rows.filter((r) => r.approvalLevel === "cfo").length;

  const handleDecide = async () => {
    if (decideId == null || !decisionType) return;
    try {
      await decideMut.mutateAsync({
        id: decideId,
        decision: decisionType === "approve" ? "approved" : "rejected",
        notes: decisionNotes || undefined,
      });
      toast({ title: decisionType === "approve" ? "تم الاعتماد" : "تم الرفض" });
      setDecideId(null);
      setDecisionType(null);
      setDecisionNotes("");
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر تنفيذ القرار", description: getErrorMessage(err) });
    }
  };

  const cols: DataTableColumn<BudgetApprovalRequest>[] = [
    {
      key: "requestedAt",
      header: "تاريخ الطلب",
      render: (r) => <span className="text-xs">{formatDateAr(r.requestedAt)}</span>,
    },
    {
      key: "period",
      header: "الفترة",
      render: (r) => <Badge variant="outline" className="font-mono text-[10px]">{r.period}</Badge>,
    },
    {
      key: "accountCode",
      header: "الحساب",
      render: (r) => (
        <div className="flex flex-col">
          <Link href={`/finance/accounts/${r.accountCode}`}
            className="font-mono text-xs text-status-info-foreground hover:underline">
            {r.accountCode}
          </Link>
          {r.accountName && <span className="text-[10px] text-muted-foreground">{r.accountName}</span>}
        </div>
      ),
    },
    {
      key: "requestedAmount",
      header: "المبلغ المطلوب",
      render: (r) => <span className="font-mono text-xs font-semibold">{formatCurrency(Number(r.requestedAmount))}</span>,
    },
    {
      key: "utilizationAfter",
      header: "% الاستخدام بعد",
      render: (r) => {
        const pct = Number(r.utilizationAfter ?? 0);
        const color = pct > 100 ? "text-status-error-foreground" : pct > 95 ? "text-status-warning-foreground" : "text-emerald-700";
        return (
          <span className={`font-mono text-xs font-semibold ${color}`}>
            {Number(r.utilizationBefore ?? 0).toFixed(0)}% → {pct.toFixed(0)}%
          </span>
        );
      },
    },
    {
      key: "approvalLevel",
      header: "مستوى الاعتماد",
      render: (r) => (
        <Badge className={`text-[10px] ${LEVEL_COLOR[r.approvalLevel]}`}>
          {LEVEL_LABEL[r.approvalLevel]}
        </Badge>
      ),
    },
    {
      key: "source",
      header: "المصدر",
      render: (r) => r.sourceType
        ? <Badge variant="outline" className="text-[10px]">{r.sourceType}{r.sourceId ? ` #${r.sourceId}` : ""}</Badge>
        : <span className="text-muted-foreground italic text-xs">—</span>,
    },
    {
      key: "reason",
      header: "السبب",
      render: (r) => r.reason
        ? <span className="text-xs text-muted-foreground line-clamp-2 max-w-xs">{r.reason}</span>
        : <span className="text-muted-foreground italic">—</span>,
    },
    {
      key: "_actions",
      header: "القرار",
      render: (r) => {
        if (r.status !== "pending") {
          return r.status === "approved"
            ? <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">✓ معتمد</Badge>
            : <Badge className="bg-red-100 text-status-error-foreground text-[10px]">✗ مرفوض</Badge>;
        }
        return (
          <div className="flex items-center gap-1">
            <GuardedButton perm="finance:approve" variant="ghost" size="sm"
              className="h-7 text-xs text-emerald-700"
              onClick={() => { setDecideId(r.id); setDecisionType("approve"); }}>
              <CheckCircle2 className="h-3 w-3 me-1" /> اعتماد
            </GuardedButton>
            <GuardedButton perm="finance:approve" variant="ghost" size="sm"
              className="h-7 text-xs text-status-error-foreground"
              onClick={() => { setDecideId(r.id); setDecisionType("reject"); }}>
              <XCircle className="h-3 w-3 me-1" /> رفض
            </GuardedButton>
          </div>
        );
      },
    },
  ];

  return (
    <PageShell
      title="اعتمادات تجاوز الميزانية"
      subtitle="طلبات تجاوز الموازنة — تحتاج اعتماد المدير المالي (80%-99%) أو المدير العام (99%-110%)، وفوق 110% تُرفض تلقائياً"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/budget", label: "الميزانية" },
        { label: "اعتمادات التجاوز" },
      ]}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/budget-variance">
              <Target className="h-3.5 w-3.5 ml-1" />
              انحرافات الميزانية
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/budget-heatmap">
              <Grid3x3 className="h-3.5 w-3.5 ml-1" />
              خريطة الميزانية
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/reports/is-vs-budget">
              <TrendingUp className="h-3.5 w-3.5 ml-1" />
              P&L vs Budget
            </Link></Button>
          <PrintButton
            entityType="report_finance_budget_approvals"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "اعتمادات تجاوز الميزانية", total: printRows.length },
              items: printRows.map((r) => ({
                "الحساب": r.accountCode,
                "الاسم": r.accountName || "—",
                "الفترة": r.period,
                "المطلوب": Number(r.requestedAmount || 0),
                "الميزانية": Number(r.budgetAmount || 0),
                "% قبل": Number(r.utilizationBefore || 0).toFixed(1),
                "% بعد": Number(r.utilizationAfter || 0).toFixed(1),
                "المستوى": LEVEL_LABEL[r.approvalLevel as keyof typeof LEVEL_LABEL] || r.approvalLevel,
                "السبب": r.reason || "—",
                "الحالة": r.status,
              })),
            })}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> منطق التصعيد
          </p>
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
            <li><strong>≤ 80%</strong> — يُعتمد تلقائياً ولا يطلب قرار</li>
            <li><strong>80% – 99%</strong> — يحتاج اعتماد <span className="font-semibold">المدير المالي</span></li>
            <li><strong>99% – 110%</strong> — يحتاج اعتماد <span className="font-semibold">المدير العام</span></li>
            <li><strong>&gt; 110%</strong> — مرفوض نهائياً (لا يصل لهذي الصفحة)</li>
          </ul>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="border-status-warning-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" /> طلبات معلّقة
            </p>
            <p className="text-lg font-bold font-mono text-status-warning-foreground">{formatNumber(rows.filter((r) => r.status === "pending").length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي مبلغ مطلوب</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(totalRequested)}</p>
          </CardContent>
        </Card>
        <Card className="border-status-error-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> يحتاج GM
            </p>
            <p className="text-lg font-bold font-mono text-status-error-foreground">{formatNumber(gmCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">يحتاج CFO</p>
            <p className="text-lg font-bold font-mono text-status-warning-foreground">{formatNumber(cfoCount)}</p>
          </CardContent>
        </Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث برمز/اسم الحساب أو السبب...",
          statuses: [
            { value: "pending", label: "معلّقة" },
            { value: "approved", label: "معتمدة" },
            { value: "rejected", label: "مرفوضة" },
          ],
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">الطلبات ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={filtered}
            onSortedDataChange={setPrintRows}
            pageSize={30}
            noToolbar
            emptyMessage={
              filters.status === "pending"
                ? "ما في طلبات اعتماد معلّقة — كل التزامات الفترة ضمن الميزانية أو معتمدة"
                : `لا توجد طلبات بحالة ${filters.status || "—"}`
            }
          />
        </CardContent>
      </Card>

      {/* Approve dialog */}
      {(() => {
        const r = rows.find((row) => row.id === decideId);
        return (
          <>
            <ConfirmActionDialog
              open={decideId !== null && decisionType === "approve"}
              onOpenChange={(o) => { if (!o) { setDecideId(null); setDecisionType(null); } }}
              variant="confirm"
              title="اعتماد طلب تجاوز الميزانية"
              description={r ? `حساب ${r.accountCode} — مبلغ ${formatCurrency(Number(r.requestedAmount))} — سيرفع الاستخدام إلى ${Number(r.utilizationAfter ?? 0).toFixed(0)}%` : ""}
              confirmLabel={decideMut.isPending ? "جاري الاعتماد…" : "اعتماد"}
              pending={decideMut.isPending}
              onConfirm={handleDecide}
              confirmPerm="finance:approve"
            >
              <div className="my-2">
                <Label className="text-xs">ملاحظات (اختياري)</Label>
                <Textarea value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} rows={2} />
              </div>
            </ConfirmActionDialog>

            <ConfirmActionDialog
              open={decideId !== null && decisionType === "reject"}
              onOpenChange={(o) => { if (!o) { setDecideId(null); setDecisionType(null); } }}
              variant="destructive"
              title="رفض طلب تجاوز الميزانية"
              description={r ? `حساب ${r.accountCode} — مبلغ ${formatCurrency(Number(r.requestedAmount))}` : ""}
              confirmLabel={decideMut.isPending ? "جاري الرفض…" : "رفض"}
              pending={decideMut.isPending}
              onConfirm={handleDecide}
              confirmPerm="finance:approve"
            >
              <div className="my-2">
                <Label className="text-xs">سبب الرفض</Label>
                <Textarea value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} rows={2} placeholder="مثال: تجاوز السقف العام للإدارة" />
              </div>
            </ConfirmActionDialog>
          </>
        );
      })()}
    </PageShell>
  );
}
