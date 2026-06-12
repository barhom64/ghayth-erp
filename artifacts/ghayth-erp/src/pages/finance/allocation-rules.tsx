import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import {
  useInlineActions,
  RowActions,
  InlineDeleteConfirm,
} from "@/components/inline-actions";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatNumber } from "@/lib/formatters";
import { Plus, Workflow, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { AllocationTabsNav } from "@/components/shared/allocation-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface AllocationRule {
  id: number;
  name: string;
  documentType: string;
  lineType: string | null;
  activityType: string | null;
  entityType: string | null;
  conditionsJson: any;
  debitAccountId: number | null;
  creditAccountId: number | null;
  revenueAccountId: number | null;
  expenseAccountId: number | null;
  assetAccountId: number | null;
  inventoryAccountId: number | null;
  vatAccountId: number | null;
  costCenterStrategy: string | null;
  dimensionStrategyJson: any;
  autoCreateMissing: boolean;
  requiresEntityLink: boolean;
  priority: number;
  isActive: boolean;
  createdAt: string | null;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  invoice: "فاتورة مبيعات",
  credit_memo: "إشعار دائن",
  debit_memo: "إشعار مدين",
  purchase_order: "أمر شراء",
  purchase_request: "طلب شراء",
  grn: "إيصال استلام (GRN)",
  supplier_invoice: "فاتورة مورد",
  expense: "مصروف",
  payment: "سند صرف",
  receipt: "سند قبض",
  journal_entry: "قيد يدوي",
};

const STRATEGY_LABEL: Record<string, string> = {
  from_vehicle:      "من المركبة",
  from_property:     "من العقار",
  from_unit:         "من الوحدة",
  from_project:      "من المشروع",
  from_employee:     "من الموظف",
  from_contract:     "من العقد",
  from_umrah_agent:  "من مرشد العمرة",
  from_umrah_season: "من موسم العمرة",
  explicit:          "صريح",
  none:              "بدون",
};

export default function AllocationRulesPage() {
  const [docTypeFilter, setDocTypeFilter] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("");
  // ConfirmDeleteDialog fires DELETE /finance/allocation-rules/:id
  // itself (audit scanner picks up the deletePath prop). No separate
  // mutation needed here — the dialog owns the call.
  const [deleting, setDeleting] = useState<AllocationRule | null>(null);

  const params = new URLSearchParams();
  if (docTypeFilter) params.set("documentType", docTypeFilter);
  if (activeFilter) params.set("isActive", activeFilter);
  const qs = params.toString();

  const ruleActions = useInlineActions({
    endpoint: "/finance/allocation-rules",
    queryKeys: [["allocation-rules", docTypeFilter, activeFilter]],
  });

  const { data, isLoading, isError } = useApiQuery<{ data: AllocationRule[]; total: number }>(
    ["allocation-rules", docTypeFilter, activeFilter],
    `/finance/allocation-rules${qs ? `?${qs}` : ""}`,
  );

  const rows = data?.data ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;

  const activeCount = rows.filter((r) => r.isActive).length;
  const requiresLink = rows.filter((r) => r.requiresEntityLink).length;

  const cols: DataTableColumn<AllocationRule>[] = [
    { key: "priority", header: "أولوية",
      render: (r) => <span className="font-mono text-xs">{r.priority}</span> },
    { key: "name", header: "اسم القاعدة",
      render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "documentType", header: "نوع المستند",
      render: (r) => <Badge variant="outline" className="text-xs">{DOC_TYPE_LABEL[r.documentType] ?? r.documentType}</Badge> },
    { key: "lineType", header: "نوع البند",
      render: (r) => r.lineType ?? <span className="text-muted-foreground italic">—</span> },
    { key: "activityType", header: "النشاط",
      render: (r) => r.activityType
        ? <Badge variant="outline" className="text-[10px]">{r.activityType}</Badge>
        : <span className="text-muted-foreground italic">—</span> },
    { key: "entityType", header: "كيان",
      render: (r) => r.entityType
        ? <Badge variant="outline" className="text-[10px]">{r.entityType}</Badge>
        : <span className="text-muted-foreground italic">—</span> },
    { key: "accounts", header: "الحسابات",
      render: (r) => {
        const accounts: string[] = [];
        if (r.revenueAccountId) accounts.push(`R:${r.revenueAccountId}`);
        if (r.expenseAccountId) accounts.push(`E:${r.expenseAccountId}`);
        if (r.assetAccountId) accounts.push(`A:${r.assetAccountId}`);
        if (r.inventoryAccountId) accounts.push(`I:${r.inventoryAccountId}`);
        if (r.vatAccountId) accounts.push(`V:${r.vatAccountId}`);
        if (r.debitAccountId) accounts.push(`DR:${r.debitAccountId}`);
        if (r.creditAccountId) accounts.push(`CR:${r.creditAccountId}`);
        return accounts.length === 0
          ? <span className="text-muted-foreground italic text-xs">لا توجد</span>
          : <span className="font-mono text-[10px]">{accounts.join(" / ")}</span>;
      },
    },
    { key: "costCenterStrategy", header: "مركز التكلفة",
      render: (r) => r.costCenterStrategy
        ? <Badge variant="outline" className="text-[10px]">{STRATEGY_LABEL[r.costCenterStrategy] ?? r.costCenterStrategy}</Badge>
        : <span className="text-muted-foreground italic">—</span> },
    { key: "requiresEntityLink", header: "يتطلب ربطاً",
      render: (r) => r.requiresEntityLink
        ? <Badge className="bg-amber-100 text-status-warning-foreground text-[10px]">إلزامي</Badge>
        : <span className="text-muted-foreground italic">—</span> },
    { key: "autoCreateMissing", header: "إنشاء تلقائي",
      render: (r) => r.autoCreateMissing
        ? <Badge className="bg-purple-100 text-purple-800 text-[10px]">مفعّل</Badge>
        : <span className="text-muted-foreground italic">—</span> },
    { key: "isActive", header: "الحالة",
      render: (r) => r.isActive
        ? <Badge className="bg-emerald-100 text-emerald-800 text-xs">نشطة</Badge>
        : <Badge variant="outline" className="text-xs">معطّلة</Badge> },
    { key: "_actions", header: "إجراءات",
      render: (r) => (
        <div className="flex items-center gap-1">
          <Link href={`/finance/allocation-rules/${r.id}/edit`}>
            <Button variant="ghost" size="sm" className="h-7 px-2" title="تعديل القاعدة">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <RowActions
            onDelete={() => ruleActions.startDelete(r.id)}
            canEdit={false}
            deletePerm="finance:delete"
          />
        </div>
      ) },
  ];

  return (
    <PageShell
      title="قواعد التوجيه المحاسبي"
      subtitle="قواعد التوجيه المحاسبي — تحدد كيف يُوجَّه كل بند مالي إلى حسابه ومركز تكلفته وكيانه التشغيلي تلقائياً"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/accounts", label: "الحسابات" },
        { label: "قواعد التوجيه" },
      ]}
      actions={
        <>
          <Link href="/finance/allocation-rules/create">
            <GuardedButton perm="finance:create">
              <Plus className="h-4 w-4 me-1" /> قاعدة جديدة
            </GuardedButton>
          </Link>
          <PrintButton
            entityType="report_finance_allocation_rules"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "قواعد التوجيه المحاسبي", total: printRows.length },
              items: printRows.map((r) => ({
                "الاسم": r.name || "—",
                "نوع المستند": DOC_TYPE_LABEL[r.documentType] || r.documentType || "—",
                "نوع السطر": r.lineType || "—",
                "النشاط": r.activityType || "—",
                "نوع الكيان": r.entityType || "—",
                "استراتيجية مركز التكلفة": STRATEGY_LABEL[r.costCenterStrategy || ""] || r.costCenterStrategy || "—",
                "الأولوية": r.priority,
                "نشطة": r.isActive ? "نعم" : "لا",
              })),
            })}
          />
        </>
      }
    >
      <FinanceTabsNav />
      <AllocationTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Workflow className="h-4 w-4" /> كيف تعمل قواعد التوجيه؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            عند حفظ أي مستند مالي (فاتورة / أمر شراء / مصروف / إلخ)، الـ resolver
            (<code className="bg-muted px-1 rounded">lib/accountingAllocation.ts</code>) يستشير
            هذي القواعد بترتيب الأولوية لكل بند. كل قاعدة تحدد:
          </p>
          <ul className="text-xs text-muted-foreground list-disc list-inside mt-2 space-y-0.5">
            <li>على أي نوع مستند تطبق (Document Type)</li>
            <li>على أي نوع بند تطبق (Line Type / Activity Type / Entity Type)</li>
            <li>الحسابات المُستخدَمة (إيراد / مصروف / أصل / مخزون / VAT / مدين-دائن مباشر)</li>
            <li>استراتيجية مركز التكلفة (من المركبة / العقار / المشروع / صريح / بدون)</li>
            <li>هل يتطلب ربطاً إلزامياً بكيان (يمنع الاعتماد لو غير موجود)</li>
            <li>هل ينشئ الحساب/مركز التكلفة تلقائياً عند عدم وجوده</li>
          </ul>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي القواعد</p>
            <p className="text-lg font-bold font-mono">{formatNumber(rows.length)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">قواعد نشطة</p>
            <p className="text-lg font-bold font-mono text-emerald-700">{formatNumber(activeCount)}</p>
          </CardContent>
        </Card>
        <Card className="border-status-warning-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> تتطلب ربطاً
            </p>
            <p className="text-lg font-bold font-mono text-status-warning-foreground">{formatNumber(requiresLink)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إنشاء تلقائي</p>
            <p className="text-lg font-bold font-mono">{formatNumber(rows.filter((r) => r.autoCreateMissing).length)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-muted-foreground">نوع المستند:</span>
        <Badge
          variant={docTypeFilter === "" ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => setDocTypeFilter("")}
        >الكل</Badge>
        {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
          <Badge
            key={k}
            variant={docTypeFilter === k ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setDocTypeFilter(k)}
          >{v}</Badge>
        ))}
        <div className="w-px h-4 bg-border mx-2" />
        <span className="text-xs text-muted-foreground">الحالة:</span>
        <Badge variant={activeFilter === "" ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => setActiveFilter("")}>الكل</Badge>
        <Badge variant={activeFilter === "true" ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => setActiveFilter("true")}>نشطة</Badge>
        <Badge variant={activeFilter === "false" ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => setActiveFilter("false")}>معطّلة</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">القواعد المعرّفة ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={rows}
            onSortedDataChange={setPrintRows}
            pageSize={50}
            emptyMessage={
              docTypeFilter || activeFilter
                ? "لا توجد قواعد بهذي الفلاتر"
                : "لا توجد قواعد بعد — الـ resolver سيستخدم المعالجة الافتراضية لكل بند"
            }
          />
        </CardContent>
      </Card>
      {ruleActions.deletingId !== null && (
        <InlineDeleteConfirm
          onConfirm={() => ruleActions.handleDelete(ruleActions.deletingId!)}
          onCancel={ruleActions.cancelDelete}
          isPending={ruleActions.isPending}
        />
      )}
    </PageShell>
  );
}
