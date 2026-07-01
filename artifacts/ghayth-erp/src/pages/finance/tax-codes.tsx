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
import { Plus, Percent, Trash2, Pencil, Layers, Receipt } from "lucide-react";
import { useAppContext } from "@/contexts/app-context";
import { PageStateWrapper } from "@/components/shared/page-state";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";

/**
 * Tax Codes management page — UI for the Daftra-style tax-code
 * registry shipped in #989 / migration 205.
 *
 * Operators pick a tax code on each invoice line (or set a default
 * on the invoice header); the engine then computes net / VAT /
 * gross automatically. This page is the admin surface that lets the
 * accounting team configure rates, GL accounts, inclusive defaults
 * and ZATCA categories per company.
 */

interface TaxCode {
  id: number;
  code: string;
  name: string;
  nameEn?: string | null;
  rate: number | string;
  taxType: "standard" | "zero" | "exempt" | "out_of_scope" | "reverse_charge";
  accountId?: number | null;
  inputAccountId?: number | null;
  zatcaCategoryCode?: string | null;
  zatcaExemptionReason?: string | null;
  isInclusiveDefault?: boolean;
  isActive: boolean;
  createdAt: string;
}

const typeLabels: Record<TaxCode["taxType"], string> = {
  standard: "قياسي",
  zero: "صفري",
  exempt: "معفى",
  out_of_scope: "خارج النطاق",
  reverse_charge: "عكس الالتزام",
};

const typeBadgeVariant: Record<TaxCode["taxType"], "default" | "secondary" | "outline" | "destructive"> = {
  standard: "default",
  zero: "secondary",
  exempt: "outline",
  out_of_scope: "outline",
  reverse_charge: "destructive",
};

export default function TaxCodesPage() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, error, refetch } = useApiQuery<{ data: TaxCode[] }>(
    ["tax-codes", scopeQueryString],
    `/finance/tax-codes${scopeSuffix}`,
  );
  const items = data?.data ?? [];
  const [pendingDelete, setPendingDelete] = useState<TaxCode | null>(null);

  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filtered = applyFilters(items, filters, {
    searchFields: ["code", "name", "nameEn", "zatcaCategoryCode"],
  }) as TaxCode[];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  const columns: DataTableColumn<TaxCode>[] = [
    {
      key: "code",
      header: "الرمز",
      sortable: true,
      render: (t) => (
        <span className="font-mono font-medium text-status-info-foreground">{t.code}</span>
      ),
    },
    {
      key: "name",
      header: "الاسم بالعربية",
      sortable: true,
      render: (t) => <span className="font-medium">{t.name}</span>,
    },
    {
      key: "nameEn",
      header: "الاسم بالإنجليزية",
      render: (t) => <span className="text-muted-foreground text-sm" dir="ltr">{t.nameEn || "—"}</span>,
    },
    {
      key: "rate",
      header: "النسبة %",
      sortable: true,
      render: (t) => (
        <span className="font-mono font-semibold text-emerald-700">
          {Number(t.rate).toFixed(2)}%
        </span>
      ),
    },
    {
      key: "taxType",
      header: "النوع",
      render: (t) => (
        <Badge variant={typeBadgeVariant[t.taxType]}>{typeLabels[t.taxType]}</Badge>
      ),
    },
    {
      key: "zatcaCategoryCode",
      header: "فئة زاتكا",
      render: (t) => (
        <span className="font-mono text-xs text-muted-foreground">
          {t.zatcaCategoryCode || "—"}
        </span>
      ),
    },
    {
      key: "isInclusiveDefault",
      header: "شامل افتراضياً",
      render: (t) => (t.isInclusiveDefault
        ? <Badge variant="secondary">شامل</Badge>
        : <span className="text-muted-foreground text-xs">غير شامل</span>),
    },
    {
      key: "isActive",
      header: "الحالة",
      render: (t) => (t.isActive
        ? <Badge variant="default">نشط</Badge>
        : <Badge variant="outline">موقوف</Badge>),
    },
    {
      key: "_actions",
      header: "",
      width: "120px",
      render: (t) => (
        <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
          <GuardedButton perm="finance:update" size="icon" title="تعديل" variant="ghost" asChild>
            <Link href={`/finance/tax-codes/${t.id}/edit`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </GuardedButton>
          <GuardedButton perm="finance:delete" size="icon" title="حذف" variant="ghost"
            onClick={() => setPendingDelete(t)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="رموز الضريبة"
      subtitle="إدارة فئات ضريبة القيمة المضافة (شامل / غير شامل / صفري / معفى / خارج النطاق / عكس الالتزام)"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "رموز الضريبة" }]}
      loading={isLoading}
      actions={
        <>
          <Button asChild variant="outline" size="sm"><Link href="/finance/wht-categories">
              <Layers className="h-4 w-4 me-1" />فئات WHT
            </Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/finance/vat-filing-readiness">
              <Receipt className="h-4 w-4 me-1" />جاهزية VAT
            </Link></Button>
          <GuardedButton perm="finance:create" size="sm" asChild>
            <Link href="/finance/tax-codes/create">
              <Plus className="h-4 w-4 me-1" />
              إضافة رمز ضريبة
            </Link>
          </GuardedButton>
          <PrintButton
            entityType="report_finance_tax_codes"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "رموز الضرائب", total: printRows.length },
              items: printRows.map((c: any) => ({
                "الرمز": c.code || "—",
                "الاسم": c.name || "—",
                "النسبة (%)": c.ratePercent ?? c.rate ?? "—",
                "النوع": c.type || "—",
                "الحساب المرتبط": c.accountCode || "—",
                "الحالة": c.isActive ? "نشط" : "غير نشط",
              })),
            })}
          />
        </>
      }
    >
      <FinanceTabsNav />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالرمز / الاسم / فئة زاتكا...",
          showDateRange: false,
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        onExportCSV={() => exportToCSV(filtered, [
          { key: "code", label: "الرمز" },
          { key: "name", label: "الاسم" },
          { key: "nameEn", label: "الاسم (إنجليزي)" },
          { key: "rate", label: "النسبة %" },
          { key: "taxType", label: "النوع" },
          { key: "zatcaCategoryCode", label: "فئة زاتكا" },
          { key: "isInclusiveDefault", label: "شامل افتراضياً" },
          { key: "isActive", label: "نشط" },
        ], "رموز الضريبة")}
        resultCount={filtered.length}
      />

      <PageStateWrapper
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        emptyText="لا توجد رموز ضريبة. ابدأ بإضافة رمز جديد."
      >
        <DataTable
          columns={columns}
          onSortedDataChange={setPrintRows}
          data={filtered}
          onRowClick={(t) => navigate(`/finance/tax-codes/${t.id}/edit`)}
          pageSize={pageSize}
          emptyMessage="لا توجد رموز ضريبة مطابقة للبحث"
          emptyIcon={<Percent className="h-6 w-6 text-slate-400" />}
          noToolbar
        />
      </PageStateWrapper>

      {pendingDelete && (
        <ConfirmDeleteDialog
          open
          onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
          entity={{
            type: "tax_code",
            id: pendingDelete.id,
            name: `${pendingDelete.code} — ${pendingDelete.name}`,
          }}
          deletePath={`/finance/tax-codes/${pendingDelete.id}`}
          invalidateKeys={[["tax-codes"]]}
          successMessage="تم حذف رمز الضريبة"
          onDeleted={() => { setPendingDelete(null); refetch(); }}
        />
      )}
    </PageShell>
  );
}
