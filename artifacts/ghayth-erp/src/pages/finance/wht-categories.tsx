import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
  PageShell,
} from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { Plus, Receipt, Trash2, Pencil, Percent, FileCheck2 } from "lucide-react";
import { useAppContext } from "@/contexts/app-context";
import { PageStateWrapper } from "@/components/shared/page-state";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

/**
 * Withholding Tax categories — Saudi Income Tax Law Art. 68.
 *
 * Operators rarely change these (the 10 default categories are
 * seeded per company on bootstrap), but treaty-rate overrides
 * + custom categories happen when a tenant signs a DTAA-covered
 * supplier contract.
 */

interface WhtCategory {
  id: number;
  code: string;
  name: string;
  nameEn?: string | null;
  rate: number | string;
  appliesTo:
    | "royalties" | "technical_services" | "management_fees"
    | "dividends" | "interest" | "rent_movable"
    | "telecommunications" | "air_tickets" | "freight"
    | "insurance_premium" | "other";
  payableAccountId?: number | null;
  description?: string | null;
  isActive: boolean;
}

const appliesLabels: Record<WhtCategory["appliesTo"], string> = {
  royalties:          "إتاوات",
  technical_services: "خدمات فنية",
  management_fees:    "أتعاب إدارة",
  dividends:          "أرباح موزعة",
  interest:           "فوائد",
  rent_movable:       "تأجير منقولات",
  telecommunications: "اتصالات",
  air_tickets:        "تذاكر طيران",
  freight:            "شحن",
  insurance_premium:  "أقساط تأمين",
  other:              "أخرى",
};

export default function WhtCategoriesPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, error, refetch } = useApiQuery<{ data: WhtCategory[] }>(
    ["wht-categories", scopeQueryString],
    `/finance/wht-categories${scopeSuffix}`,
  );
  const items = data?.data ?? [];
  const [pendingDelete, setPendingDelete] = useState<WhtCategory | null>(null);

  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);

  const filtered = applyFilters(items, filters, {
    searchFields: ["code", "name", "nameEn", "appliesTo"],
  }) as WhtCategory[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const columns: DataTableColumn<WhtCategory>[] = [
    {
      key: "code",
      header: "الرمز",
      sortable: true,
      render: (c) => (
        <span className="font-mono font-medium text-status-info-foreground">{c.code}</span>
      ),
    },
    {
      key: "name",
      header: "الاسم",
      sortable: true,
      render: (c) => <span className="font-medium">{c.name}</span>,
    },
    {
      key: "nameEn",
      header: "الاسم (إنجليزي)",
      render: (c) => <span className="text-muted-foreground text-sm" dir="ltr">{c.nameEn || "—"}</span>,
    },
    {
      key: "rate",
      header: "النسبة %",
      sortable: true,
      render: (c) => (
        <span className="font-mono font-semibold text-status-warning-foreground">
          {Number(c.rate).toFixed(2)}%
        </span>
      ),
    },
    {
      key: "appliesTo",
      header: "ينطبق على",
      render: (c) => <Badge variant="outline">{appliesLabels[c.appliesTo] ?? c.appliesTo}</Badge>,
    },
    {
      key: "isActive",
      header: "الحالة",
      render: (c) => (c.isActive
        ? <Badge variant="default">نشط</Badge>
        : <Badge variant="outline">موقوف</Badge>),
    },
    {
      key: "_actions",
      header: "",
      width: "120px",
      render: (c) => (
        <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
          <GuardedButton perm="finance:update" size="icon" title="تعديل" variant="ghost" asChild>
            <Link href={`/finance/wht-categories/${c.id}/edit`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </GuardedButton>
          <GuardedButton perm="finance:delete" size="icon" title="حذف" variant="ghost"
            onClick={() => setPendingDelete(c)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="فئات استقطاع الضريبة (WHT)"
      subtitle="إدارة فئات استقطاع ضريبة الدخل لغير المقيمين — وفق نظام ضريبة الدخل السعودي (المادة 68)"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "فئات الاستقطاع" }]}
      loading={isLoading}
      actions={
        <>
          <Button asChild variant="outline" size="sm"><Link href="/finance/tax-codes">
              <Percent className="h-4 w-4 me-1" />رموز الضريبة
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/wht-filing-workbench">
              <FileCheck2 className="h-4 w-4 me-1" />منضدة WHT
            </Link></Button>
          <GuardedButton perm="finance:create" size="sm" asChild>
            <Link href="/finance/wht-categories/create">
              <Plus className="h-4 w-4 me-1" />
              إضافة فئة استقطاع
            </Link>
          </GuardedButton>
          <PrintButton
            entityType="report_finance_wht_categories"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "فئات استقطاع الضريبة", total: printRows.length },
              items: printRows.map((c) => ({
                "الرمز": c.code,
                "الاسم": c.name,
                "Name EN": c.nameEn || "—",
                "النسبة %": Number(c.rate || 0),
                "النوع": appliesLabels[c.appliesTo as keyof typeof appliesLabels] || c.appliesTo,
                "نشط": c.isActive ? "نعم" : "لا",
              })),
            })}
          />
        </>
      }
    >
      <FinanceTabsNav />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالرمز / الاسم / النوع...",
          showDateRange: false,
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        onExportCSV={() => exportToCSV(filtered, [
          { key: "code", label: "الرمز" },
          { key: "name", label: "الاسم" },
          { key: "nameEn", label: "الاسم (إنجليزي)" },
          { key: "rate", label: "النسبة %" },
          { key: "appliesTo", label: "ينطبق على" },
          { key: "isActive", label: "نشط" },
        ], "فئات الاستقطاع")}
        resultCount={filtered.length}
      />

      <PageStateWrapper
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        emptyText="لا توجد فئات استقطاع — ابدأ بإضافة فئة."
      >
        <DataTable
          columns={columns}
          onSortedDataChange={setPrintRows}
          data={filtered}
          onRowClick={(c) => navigate(`/finance/wht-categories/${c.id}/edit`)}
          pageSize={20}
          emptyMessage="لا توجد فئات استقطاع مطابقة للبحث"
          emptyIcon={<Receipt className="h-6 w-6 text-slate-400" />}
          noToolbar
        />
      </PageStateWrapper>

      {pendingDelete && (
        <ConfirmDeleteDialog
          open
          onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
          entity={{
            type: "wht_category",
            id: pendingDelete.id,
            name: `${pendingDelete.code} — ${pendingDelete.name}`,
          }}
          deletePath={`/finance/wht-categories/${pendingDelete.id}`}
          invalidateKeys={[["wht-categories"]]}
          successMessage="تم حذف فئة الاستقطاع"
          onDeleted={() => { setPendingDelete(null); refetch(); }}
        />
      )}
    </PageShell>
  );
}
