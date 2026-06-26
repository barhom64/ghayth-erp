import { useRoute, Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  PageShell,
  DataTable,
  PageStatusBadge,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { ScrollText, ArrowLeftRight, ExternalLink, Hash, Calendar, FileText, CheckCircle, Send } from "lucide-react";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
// Detail view for any journal entry (sourced from invoice / expense /
// voucher / reversal / fx_revaluation / manual / ...). The list page at
// /finance/journal navigated rows to /finance/journal/:id but no route
// handled it — clicking a row 404'd. This page fills that hole.

interface JournalLine {
  id: number;
  journalId: number;
  accountCode: string;
  accountName: string | null;
  description: string | null;
  debit: number | string;
  credit: number | string;
  // Full dimensional payload — every column journal_lines carries.
  // Pre-fix the type omitted 9 of the 16 dim columns so the UI couldn't
  // render them even when the engine wrote them. Backend `SELECT jl.*`
  // returns all of these.
  costCenter: string | null;
  costCenterId: number | null;
  vehicleId: number | null;
  propertyId: number | null;
  projectId: number | null;
  contractId: number | null;
  umrahSeasonId: number | null;
  umrahAgentId: number | null;
  employeeId: number | null;
  departmentId: number | null;
  unitId: number | null;
  assetId: number | null;
  productId: number | null;
  clientId: number | null;
  vendorId: number | null;
  driverId: number | null;
  activityType: string | null;
}

interface JournalDetail {
  id: number;
  ref: string;
  description: string | null;
  type: string;
  status: string;
  balancesApplied: boolean;
  // FIN-CORRECTION (A2): the /finance/journal/:id read returns the canonical
  // posting axis (migration-311 trigger, via je.*). The DISPLAY badge consumes
  // it; the action gates below intentionally keep using balancesApplied/
  // approvalStatus (server-owned posting/approval decisions, untouched).
  postingStatus: string;
  reversalOfId: number | null;
  reversedById: number | null;
  reversedAt: string | null;
  reversedById_user: number | null;
  reversalReason: string | null;
  approvalStatus: string | null;
  createdAt: string | null;
  postedAt: string | null;
  postedBy: number | null;
  sourceKey: string | null;
  sourceType: string | null;
  sourceId: number | null;
  branchId: number | null;
  lines: JournalLine[];
  reversalOf: { id: number; ref: string; description: string | null } | null;
  reversedBy: { id: number; ref: string; description: string | null } | null;
}

const TYPE_LABEL: Record<string, string> = {
  manual:              "يدوي",
  invoice:             "فاتورة",
  expense:             "مصروف",
  voucher:             "سند",
  payment:             "دفع",
  receipt:             "قبض",
  reversal:            "عكس",
  fx_revaluation:      "إعادة تقييم عملة",
  customer_advance:    "دفعة مقدمة",
  bad_debt_provision:  "مخصص ديون مشكوك",
  depreciation:        "إهلاك",
  year_end_close:      "إقفال سنة",
  opening_balance:     "رصيد افتتاحي",
};

export default function JournalDetailPage() {
  const [, params] = useRoute<{ id: string }>("/finance/journal/:id");
  const id = params?.id;
  const [, setLocation] = useLocation();

  const { data: je, isLoading, isError } = useApiQuery<JournalDetail>(
    ["journal-detail", id ?? ""],
    id ? `/finance/journal/${id}` : null,
    !!id,
  );

  // POST /finance/journal/:id/approve — moves draft → approved with
  // permission gate. POST /finance/journal/:id/post moves approved →
  // posted (applies balances to the chart of accounts).
  const approveMut = useApiMutation<unknown, Record<string, never>>(
    `/finance/journal/${id}/approve`,
    "POST",
    [["journal-detail", id ?? ""], ["journal"]],
    { successMessage: "تم اعتماد القيد" },
  );
  const postMut = useApiMutation<unknown, Record<string, never>>(
    `/finance/journal/${id}/post`,
    "POST",
    [["journal-detail", id ?? ""], ["journal"]],
    { successMessage: "تم ترحيل القيد" },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !je) return <ErrorState />;

  const totalDebit  = je.lines.reduce((s, l) => s + Number(l.debit  ?? 0), 0);
  const totalCredit = je.lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const cols: DataTableColumn<JournalLine>[] = [
    {
      key: "accountCode",
      header: "الحساب",
      render: (l) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs">{l.accountCode}</span>
          {l.accountName && (
            <span className="text-[10px] text-muted-foreground">{l.accountName}</span>
          )}
        </div>
      ),
    },
    {
      key: "description",
      header: "الوصف",
      render: (l) => l.description ?? <span className="text-muted-foreground italic">—</span>,
    },
    {
      key: "debit",
      header: "مدين",
      render: (l) => {
        const v = Number(l.debit ?? 0);
        return v === 0
          ? <span className="text-muted-foreground italic">—</span>
          : <span className="font-mono font-semibold text-emerald-700">{formatCurrency(v)}</span>;
      },
    },
    {
      key: "credit",
      header: "دائن",
      render: (l) => {
        const v = Number(l.credit ?? 0);
        return v === 0
          ? <span className="text-muted-foreground italic">—</span>
          : <span className="font-mono font-semibold text-status-error-foreground">{formatCurrency(v)}</span>;
      },
    },
    {
      key: "dimensions",
      header: "الأبعاد",
      render: (l) => {
        const dims: string[] = [];
        // Render every dimension the GL line carries so reviewers can
        // verify per-entity attribution at a glance. Order matters: the
        // most-used dims (cost-center, employee, vehicle, property,
        // project, contract) come first; less-common ones (umrah,
        // asset, product, client/vendor, driver, unit) follow.
        if (l.costCenter)     dims.push(`CC:${l.costCenter}`);
        else if (l.costCenterId) dims.push(`CC#:${l.costCenterId}`);
        if (l.employeeId)     dims.push(`E:${l.employeeId}`);
        if (l.departmentId)   dims.push(`D:${l.departmentId}`);
        if (l.vehicleId)      dims.push(`V:${l.vehicleId}`);
        if (l.driverId)       dims.push(`DR:${l.driverId}`);
        if (l.propertyId)     dims.push(`P:${l.propertyId}`);
        if (l.unitId)         dims.push(`U:${l.unitId}`);
        if (l.projectId)      dims.push(`PR:${l.projectId}`);
        if (l.contractId)     dims.push(`C:${l.contractId}`);
        if (l.clientId)       dims.push(`CL:${l.clientId}`);
        if (l.vendorId)       dims.push(`VN:${l.vendorId}`);
        if (l.productId)      dims.push(`PD:${l.productId}`);
        if (l.assetId)        dims.push(`A:${l.assetId}`);
        if (l.umrahSeasonId)  dims.push(`US:${l.umrahSeasonId}`);
        if (l.umrahAgentId)   dims.push(`UA:${l.umrahAgentId}`);
        if (l.activityType)   dims.push(`AT:${l.activityType}`);
        return dims.length === 0
          ? <span className="text-muted-foreground italic text-xs">—</span>
          : <span className="font-mono text-[10px]" title={dims.join(" • ")}>{dims.join(" / ")}</span>;
      },
    },
  ];

  return (
    <PageShell
      title={`قيد محاسبي ${je.ref}`}
      subtitle={je.description ?? ""}
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/journal", label: "القيود" },
        { label: je.ref },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {je.postingStatus === "posted"
            ? <PageStatusBadge status="active">مُرَحَّل</PageStatusBadge>
            : <PageStatusBadge status="pending">غير مُرحَّل</PageStatusBadge>}
          {(je.reversedById || je.postingStatus === "reversed") && <PageStatusBadge status="reversed" />}
          {je.approvalStatus === "draft" && (
            <GuardedButton
              perm="finance:approve"
              size="sm"
              variant="outline"
              onClick={() => approveMut.mutate({})}
              disabled={approveMut.isPending}
              rateLimitAware
              className="gap-1"
            >
              <Send className="h-4 w-4" />
              اعتماد
            </GuardedButton>
          )}
          {je.approvalStatus === "approved" && !je.balancesApplied && (
            <GuardedButton
              perm="finance:approve"
              size="sm"
              variant="outline"
              onClick={() => postMut.mutate({})}
              disabled={postMut.isPending}
              rateLimitAware
              className="gap-1"
            >
              <CheckCircle className="h-4 w-4" />
              ترحيل
            </GuardedButton>
          )}
          {/* م٧ — عكس القيد إجراءٌ على صفحة التفاصيل (لا صفحة إنشاء، doc 25 §٤):
              يظهر للقيد المُرحَّل غير المعكوس، ويفتح تدفّق العكس القائم مُسبق الاختيار. */}
          {je.postingStatus === "posted" && !je.reversedById && je.status !== "reversed" && (
            <GuardedButton
              perm="finance:approve"
              size="sm"
              variant="outline"
              onClick={() => setLocation(`/finance/journal/reverse?id=${id}`)}
              className="gap-1"
            >
              <ArrowLeftRight className="h-4 w-4" />
              عكس القيد
            </GuardedButton>
          )}
          <PrintButton entityType="journal_entry" entityId={id ?? ""} />
        </div>
      }
    >
      <FinanceTabsNav />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Hash className="h-3 w-3" /> النوع
            </p>
            <p className="text-sm font-semibold mt-1">{TYPE_LABEL[je.type] ?? je.type}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> تاريخ القيد
            </p>
            <p className="text-sm font-mono mt-1">
              {je.postedAt ? formatDateAr(je.postedAt) : (je.createdAt ? formatDateAr(je.createdAt) : "—")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">إجمالي المدين</p>
            <p className="text-sm font-mono font-bold text-emerald-700 mt-1">
              {formatCurrency(totalDebit)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">إجمالي الدائن</p>
            <p className="text-sm font-mono font-bold text-status-error-foreground mt-1">
              {formatCurrency(totalCredit)}
            </p>
          </CardContent>
        </Card>
      </div>

      {!balanced && (
        <Card className="mb-4 border-status-error-surface bg-status-error-surface">
          <CardContent className="p-3 text-sm text-status-error-foreground">
            ⚠ قيد غير متوازن! فرق = {formatCurrency(totalDebit - totalCredit)}
          </CardContent>
        </Card>
      )}

      {(je.sourceType || je.sourceId) && (
        <Card className="mb-4 bg-status-info-surface/30">
          <CardContent className="p-3 text-xs flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">المصدر:</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {je.sourceType ?? "?"}
            </Badge>
            {je.sourceId && (
              <span className="font-mono text-[10px] text-muted-foreground">#{je.sourceId}</span>
            )}
            {je.sourceKey && (
              <span className="font-mono text-[10px] text-muted-foreground ms-2">
                key: {je.sourceKey}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {(je.reversalOf || je.reversedBy) && (
        <Card className="mb-4 border-status-warning-surface bg-status-warning-surface/30">
          <CardContent className="p-3 text-xs space-y-2">
            <p className="flex items-center gap-2 font-semibold text-amber-900">
              <ArrowLeftRight className="h-3.5 w-3.5" /> سلسلة العكس
            </p>
            {je.reversalOf && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">هذا القيد يعكس:</span>
                <Link href={`/finance/journal/${je.reversalOf.id}`}
                  className="text-status-info-foreground hover:underline inline-flex items-center gap-1">
                  <span className="font-mono">{je.reversalOf.ref}</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
                {je.reversalOf.description && (
                  <span className="text-muted-foreground">— {je.reversalOf.description}</span>
                )}
              </div>
            )}
            {je.reversedBy && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">عُكس بـ:</span>
                <Link href={`/finance/journal/${je.reversedBy.id}`}
                  className="text-status-info-foreground hover:underline inline-flex items-center gap-1">
                  <span className="font-mono">{je.reversedBy.ref}</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
                {je.reversedBy.description && (
                  <span className="text-muted-foreground">— {je.reversedBy.description}</span>
                )}
              </div>
            )}
            {je.reversalReason && (
              <p className="text-muted-foreground"><strong>السبب:</strong> {je.reversalReason}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ScrollText className="h-4 w-4" /> بنود القيد ({je.lines.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols}
            data={je.lines}
            pageSize={100}
            emptyMessage="لا توجد بنود لهذا القيد"
          />
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end">
        <Button asChild variant="outline" size="sm"><Link href="/finance/journal">العودة لقائمة القيود</Link></Button>
      </div>
    </PageShell>
  );
}

