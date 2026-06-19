import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { formatNumber, formatDateAr } from "@/lib/formatters";
import { Eye, AlertCircle, CheckCircle2, Pencil } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { AllocationTabsNav } from "@/components/shared/allocation-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface AllocationResult {
  id: number;
  sourceTable: string;
  sourceLineId: number;
  documentType: string | null;
  resolvedAccountId: number | null;
  resolvedAccountCode: string | null;
  costCenterId: number | null;
  dimensionsJson: any;
  ruleId: number | null;
  resolutionStatus: "resolved" | "unmapped" | "manual_override" | "partial" | string;
  warningsJson: any;
  resolvedBy: number | null;
  resolvedAt: string | null;
  manualOverrideBy: number | null;
  manualOverrideReason: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  invoice_lines: "بند فاتورة",
  purchase_order_items: "بند أمر شراء",
  purchase_request_items: "بند طلب شراء",
  goods_receipt_items: "بند GRN",
  journal_lines: "سطر قيد",
  expense_lines: "بند مصروف",
};

const STATUS_INFO: Record<string, { label: string; tone: string; icon: any }> = {
  resolved: { label: "موجَّه", tone: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  manual_override: { label: "تعديل يدوي", tone: "bg-purple-100 text-purple-800", icon: Pencil },
  partial: { label: "جزئي", tone: "bg-amber-100 text-status-warning-foreground", icon: AlertCircle },
  unmapped: { label: "غير موجَّه", tone: "bg-red-100 text-status-error-foreground", icon: AlertCircle },
};

function getEntityLink(sourceTable: string, sourceLineId: number): string | null {
  // Best-effort deep-link. Some sources don't have a direct route for a line —
  // those fall back to the parent document's detail page (we don't know the
  // invoiceId from sourceLineId alone, so we let the operator open the
  // entity registry).
  if (sourceTable === "invoice_lines") return `/finance/invoices?lineId=${sourceLineId}`;
  if (sourceTable === "purchase_order_items") return `/finance/purchase-orders?lineId=${sourceLineId}`;
  return null;
}

export default function AllocationResultsPage() {
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const params = new URLSearchParams();
  if (sourceFilter) params.set("sourceTable", sourceFilter);
  if (statusFilter) params.set("status", statusFilter);
  const qs = params.toString();

  const { data, isLoading, isError } = useApiQuery<{ data: AllocationResult[]; total: number }>(
    ["allocation-results", sourceFilter, statusFilter],
    `/finance/allocation-results${qs ? `?${qs}` : ""}`,
  );

  const rows = data?.data ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;


  const counts = rows.reduce((acc, r) => {
    acc.total += 1;
    if (r.resolutionStatus === "resolved") acc.resolved += 1;
    else if (r.resolutionStatus === "manual_override") acc.override += 1;
    else if (r.resolutionStatus === "unmapped") acc.unmapped += 1;
    if (r.ruleId) acc.viaRule += 1;
    return acc;
  }, { total: 0, resolved: 0, override: 0, unmapped: 0, viaRule: 0 });

  const cols: DataTableColumn<AllocationResult>[] = [
    { key: "resolvedAt", header: "تاريخ التوجيه",
      render: (r) => <span className="text-xs">{r.resolvedAt ? formatDateAr(r.resolvedAt) : "—"}</span> },
    { key: "sourceTable", header: "المصدر",
      render: (r) => (
        <Badge variant="outline" className="text-xs">
          {SOURCE_LABEL[r.sourceTable] ?? r.sourceTable}
        </Badge>
      ),
    },
    { key: "sourceLineId", header: "البند",
      render: (r) => {
        const href = getEntityLink(r.sourceTable, r.sourceLineId);
        return href
          ? <Link href={href} className="font-mono text-xs text-status-info-foreground hover:underline">#{r.sourceLineId}</Link>
          : <span className="font-mono text-xs">#{r.sourceLineId}</span>;
      },
    },
    { key: "resolvedAccountCode", header: "الحساب",
      render: (r) => r.resolvedAccountCode
        ? <span className="font-mono text-xs">{r.resolvedAccountCode}</span>
        : <span className="text-muted-foreground italic text-xs">—</span> },
    { key: "costCenterId", header: "مركز تكلفة",
      render: (r) => r.costCenterId
        ? <span className="font-mono text-xs">cc:{r.costCenterId}</span>
        : <span className="text-muted-foreground italic text-xs">—</span> },
    { key: "dimensions", header: "الأبعاد",
      render: (r) => {
        const dims = r.dimensionsJson || {};
        const parts: string[] = [];
        if (dims.vehicleId) parts.push(`V:${dims.vehicleId}`);
        if (dims.propertyId) parts.push(`P:${dims.propertyId}`);
        if (dims.projectId) parts.push(`Pr:${dims.projectId}`);
        if (dims.contractId) parts.push(`C:${dims.contractId}`);
        if (dims.umrahAgentId) parts.push(`UA:${dims.umrahAgentId}`);
        if (dims.assetId) parts.push(`A:${dims.assetId}`);
        return parts.length
          ? <span className="font-mono text-[10px]">{parts.join(" / ")}</span>
          : <span className="text-muted-foreground italic text-xs">—</span>;
      },
    },
    { key: "ruleId", header: "القاعدة المُستخدَمة",
      render: (r) => r.ruleId
        ? (
          <Link href={`/finance/allocation-rules`}
            className="text-status-info-foreground hover:underline font-mono text-xs">
            #{r.ruleId}
          </Link>
        )
        : <span className="text-muted-foreground italic text-xs">افتراضي</span> },
    { key: "resolutionStatus", header: "الحالة",
      render: (r) => {
        const info = STATUS_INFO[r.resolutionStatus] ?? STATUS_INFO.unmapped;
        const Icon = info.icon;
        return (
          <Badge className={`text-xs ${info.tone}`}>
            <Icon className="h-3 w-3 me-1" />
            {info.label}
          </Badge>
        );
      },
    },
    { key: "manualOverrideReason", header: "سبب التعديل",
      render: (r) => r.manualOverrideReason
        ? <span className="text-xs italic">{r.manualOverrideReason}</span>
        : "—" },
    { key: "warnings", header: "تحذيرات",
      render: (r) => {
        const warnings = Array.isArray(r.warningsJson) ? r.warningsJson : [];
        return warnings.length > 0
          ? <Badge className="bg-amber-100 text-status-warning-foreground text-[10px]">{warnings.length}</Badge>
          : <span className="text-muted-foreground italic text-xs">—</span>;
      },
    },
  ];

  return (
    <PageShell
      title="سجل توجيه البنود"
      subtitle="نتائج التوجيه المحاسبي — أي بند تم توجيهه، بأي قاعدة، إلى أي حساب ومركز تكلفة، ومن قام بالتجاوز اليدوي"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/accounts", label: "الحسابات" },
        { label: "سجل التوجيه" },
      ]}
      actions={
        <PrintButton
          entityType="report_finance_allocation_results"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "سجل توجيه البنود", total: printRows.length },
            items: printRows.map((r) => ({
              "المصدر": SOURCE_LABEL[r.sourceTable] || r.sourceTable,
              "رقم البند": r.sourceLineId,
              "نوع الوثيقة": r.documentType || "—",
              "الحساب": r.resolvedAccountCode || "—",
              "القاعدة": r.ruleId ?? "—",
              "تاريخ الحل": r.resolvedAt || "—",
              "الحالة": STATUS_INFO[r.resolutionStatus]?.label || r.resolutionStatus,
            })),
          })}
        />
      }
    >
      <FinanceTabsNav />
      <AllocationTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Eye className="h-4 w-4" /> هذه الصفحة تجاوب على السؤال:
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            "<strong>لماذا تم توجيه بند الفاتورة رقم X لحساب 4100 ومركز تكلفة Vehicle 27؟</strong>"
            — كل قرار توجيه يحفظه الـ resolver في `accounting_allocation_results` مع:
            القاعدة التي طُبِّقت، الحساب الناتج، مركز التكلفة، الأبعاد، والـ user الذي قام بالـ override
            (لو كان هناك تعديل يدوي). سجل audit كامل لكل سطر مالي.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي القرارات</p>
            <p className="text-lg font-bold font-mono">{formatNumber(counts.total)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">موجَّه</p>
            <p className="text-lg font-bold font-mono text-emerald-700">{formatNumber(counts.resolved)}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">تعديل يدوي</p>
            <p className="text-lg font-bold font-mono text-purple-700">{formatNumber(counts.override)}</p>
          </CardContent>
        </Card>
        <Card className="border-status-error-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">غير موجَّه</p>
            <p className="text-lg font-bold font-mono text-status-error-foreground">{formatNumber(counts.unmapped)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">عبر قاعدة</p>
            <p className="text-lg font-bold font-mono">{formatNumber(counts.viaRule)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-muted-foreground">المصدر:</span>
        <Badge variant={sourceFilter === "" ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => setSourceFilter("")}>الكل</Badge>
        {Object.entries(SOURCE_LABEL).map(([k, v]) => (
          <Badge
            key={k}
            variant={sourceFilter === k ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setSourceFilter(k)}
          >{v}</Badge>
        ))}
        <div className="w-px h-4 bg-border mx-2" />
        <span className="text-xs text-muted-foreground">الحالة:</span>
        <Badge variant={statusFilter === "" ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => setStatusFilter("")}>الكل</Badge>
        {Object.entries(STATUS_INFO).map(([k, v]) => (
          <Badge
            key={k}
            variant={statusFilter === k ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setStatusFilter(k)}
          >{v.label}</Badge>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">قرارات التوجيه ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={rows}
            onSortedDataChange={setPrintRows}
            pageSize={50}
            emptyMessage={
              sourceFilter || statusFilter
                ? "لا توجد قرارات بهذي الفلاتر"
                : "لا توجد قرارات بعد — الـ resolver يحفظ كل قرار توجيه آلي ويدوي هنا"
            }
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
