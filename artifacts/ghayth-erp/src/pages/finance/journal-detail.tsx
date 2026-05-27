import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
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
import { EntityPrintButton } from "@/components/shared/entity-print";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { ScrollText, ArrowLeftRight, ExternalLink, Hash, Calendar, FileText } from "lucide-react";

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
  costCenterId: number | null;
  vehicleId: number | null;
  propertyId: number | null;
  projectId: number | null;
  contractId: number | null;
  umrahSeasonId: number | null;
  umrahAgentId: number | null;
}

interface JournalDetail {
  id: number;
  ref: string;
  description: string | null;
  type: string;
  status: string;
  balancesApplied: boolean;
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

  const { data: je, isLoading, isError } = useApiQuery<JournalDetail>(
    ["journal-detail", id ?? ""],
    id ? `/finance/journal/${id}` : null,
    !!id,
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
        if (l.costCenterId)   dims.push(`CC:${l.costCenterId}`);
        if (l.vehicleId)      dims.push(`V:${l.vehicleId}`);
        if (l.propertyId)     dims.push(`P:${l.propertyId}`);
        if (l.projectId)      dims.push(`PR:${l.projectId}`);
        if (l.contractId)     dims.push(`C:${l.contractId}`);
        if (l.umrahSeasonId)  dims.push(`US:${l.umrahSeasonId}`);
        if (l.umrahAgentId)   dims.push(`UA:${l.umrahAgentId}`);
        return dims.length === 0
          ? <span className="text-muted-foreground italic text-xs">—</span>
          : <span className="font-mono text-[10px]">{dims.join(" / ")}</span>;
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
          {je.balancesApplied
            ? <PageStatusBadge status="active">مُرَحَّل</PageStatusBadge>
            : <PageStatusBadge status="pending">مسودة</PageStatusBadge>}
          {je.reversedById && <PageStatusBadge status="reversed" />}
          <EntityPrintButton entityType="journal_entry" entityId={id ?? ""} formats={["a4"]} />
        </div>
      }
    >
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
        <Link href="/finance/journal">
          <Button variant="outline" size="sm">العودة لقائمة القيود</Button>
        </Link>
      </div>
    </PageShell>
  );
}

