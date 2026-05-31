import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { formatDateAr } from "@/lib/formatters";
import { ShieldAlert } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { AllocationTabsNav } from "@/components/shared/allocation-tabs-nav";

/**
 * Allocation Override Log — audit trail of approvals that bypassed the
 * `finance.enforce_line_allocation` gate via `finance.allocation.override`.
 *
 * Each row records: the document that was approved with unmapped lines,
 * the actor, the written reason, and the blocker list the resolver
 * objected to at approval time. Read-only for compliance review.
 *
 * Endpoint: GET /finance/allocation-override-log
 */

interface OverrideRow {
  id: number;
  companyId: number;
  branchId: number | null;
  actorAssignmentId: number | null;
  actorUserId: number | null;
  documentType: string;
  documentId: number;
  sourceTable: string;
  blockersJson: string[] | null;
  overrideReason: string;
  createdAt: string;
}

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  invoice: "فاتورة",
  purchase_order: "أمر شراء",
  grn: "إيصال استلام (GRN)",
  expense: "مصروف",
  journal_entry: "قيد يومية",
};

const DOCUMENT_PATH: Record<string, (id: number) => string> = {
  invoice: (id) => `/finance/invoices/${id}`,
  purchase_order: (id) => `/finance/purchase-orders/${id}`,
  grn: (id) => `/finance/goods-receipts/${id}`,
};

export default function AllocationOverrideLogPage() {
  const { data, isLoading, isError } = useApiQuery<{ data: OverrideRow[]; total: number }>(
    ["allocation-override-log"],
    "/finance/allocation-override-log",
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const rows = data?.data ?? [];

  const columns: DataTableColumn<OverrideRow>[] = [
    {
      key: "createdAt",
      header: "تاريخ التجاوز",
      sortable: true,
      render: (r) => <span className="text-xs">{r.createdAt ? formatDateAr(r.createdAt) : "—"}</span>,
    },
    {
      key: "documentType",
      header: "نوع المستند",
      render: (r) => (
        <Badge variant="outline" className="text-xs">
          {DOCUMENT_TYPE_LABEL[r.documentType] ?? r.documentType}
        </Badge>
      ),
    },
    {
      key: "documentId",
      header: "المستند",
      render: (r) => {
        const path = DOCUMENT_PATH[r.documentType];
        if (path) {
          return (
            <Link href={path(r.documentId)} className="font-mono text-xs text-status-info-foreground hover:underline">
              #{r.documentId}
            </Link>
          );
        }
        return <span className="font-mono text-xs">#{r.documentId}</span>;
      },
    },
    {
      key: "actorUserId",
      header: "المُعتمد",
      render: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          assignment #{r.actorAssignmentId ?? "—"} / user #{r.actorUserId ?? "—"}
        </span>
      ),
    },
    {
      key: "overrideReason",
      header: "السبب المكتوب",
      render: (r) => (
        <span className="text-xs whitespace-normal max-w-md block" title={r.overrideReason}>
          {r.overrideReason}
        </span>
      ),
    },
    {
      key: "blockersJson",
      header: "الـ blockers (وقت الاعتماد)",
      render: (r) => {
        const list = Array.isArray(r.blockersJson) ? r.blockersJson : [];
        if (list.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <ul className="text-xs space-y-0.5 list-disc list-inside text-status-warning-foreground">
            {list.slice(0, 3).map((b, i) => <li key={i} className="leading-snug">{b}</li>)}
            {list.length > 3 && <li className="text-muted-foreground">+ {list.length - 3} أخرى</li>}
          </ul>
        );
      },
    },
  ];

  return (
    <PageShell
      title="سجل تجاوزات تخصيص البنود"
      subtitle="كل اعتماد تجاوز enforce_line_allocation بصلاحية finance.allocation.override — للحوكمة والمراجعة"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/settings", label: "الإعدادات" },
        { label: "تجاوزات التخصيص" },
      ]}
    >
      <FinanceTabsNav />
      <AllocationTabsNav />
      <Card className="mb-4 border-status-warning-surface bg-status-warning-surface/30">
        <CardContent className="p-4 text-sm flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-status-warning-foreground shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">عن هذا السجل</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              عند تفعيل <code className="px-1 bg-muted rounded">finance.enforce_line_allocation</code> على
              مستوى الشركة، يرفض النظام اعتماد أي مستند يحتوي على بنود بدون تخصيص محاسبي (status=unmapped).
              المستخدم الحامل لصلاحية <code className="px-1 bg-muted rounded">finance.allocation.override</code> (CFO/مدير مالي)
              يستطيع تجاوز الرفض بإدخال سبب مكتوب يُحفظ هنا مع قائمة الـ blockers
              التي رفض الـ resolver بسببها — حتى لو تغيّرت القواعد لاحقاً يبقى السبب
              الذي رآه المعتمد في حينه قابلاً للمراجعة.
            </p>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        emptyMessage="لا توجد تجاوزات مسجّلة — كل الاعتمادات مرّت بدون استثناء"
        emptyIcon={<ShieldAlert className="h-6 w-6 text-muted-foreground" />}
        pageSize={50}
      />
    </PageShell>
  );
}
