import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Button } from "@/components/ui/button";
import { Plus, ScrollText, ArrowLeftRight, Undo2, Calendar, FileEdit } from "lucide-react";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useAppContext } from "@/contexts/app-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";

/**
 * Journal entries list — migrated in R.5 iter 5 to the unified template
 * stack. This is the central ledger page showing every GL entry (not
 * just manual journals which live in journal-manual.tsx — that's the
 * one with the approval workflow; this page is the posted GL view).
 *
 * Before: raw <h1>, raw `useMutation` for the reverse action with
 * manual `useToast`+`useQueryClient` plumbing, ad-hoc balanced/reversed
 * chips with literal tailwind color classes.
 *
 * After: PageShell + `useApiMutation(pathFn)` for the reverse action +
 * PageStatusBadge (shared: reversed) for the reversed marker.
 *
 * The inline "reversal reason" AlertDialog is preserved — it's a
 * one-off form that doesn't fit ConfirmDeleteDialog's shape (it's a
 * POST with a required `reason`, not a DELETE).
 */

export default function JournalPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["journal", scopeQueryString],
    `/finance/journal${scopeSuffix}`,
  );
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const [reversalTarget, setReversalTarget] = useState<any>(null);
  const [reversalReason, setReversalReason] = useState("");
  const { toast } = useToast();

  const reverseMut = useApiMutation<void, { id: number; reason: string }>(
    (body) => `/finance/journal/${body.id}/reverse`,
    "POST",
    [["journal"]],
    {
      successMessage: "تم عكس القيد بنجاح",
      onSuccess: () => {
        setReversalTarget(null);
        setReversalReason("");
      },
    },
  );

  const filtered = applyFilters(items, filters, {
    searchFields: ["description", "ref"],
    dateField: "createdAt",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (v) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} />
        </span>
      ),
    },
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (j) => (
        <span className="font-mono text-blue-600 text-xs">{j.ref || `JE-${j.id}`}</span>
      ),
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (j) => (
        <span className="text-muted-foreground text-xs">
          {j.createdAt ? formatDateAr(j.createdAt) : "-"}
        </span>
      ),
    },
    {
      key: "description",
      header: "البيان",
      sortable: true,
      render: (j) => <span className="font-medium">{j.description || "-"}</span>,
    },
    {
      key: "amount",
      header: "المبلغ",
      render: (j) => {
        const lines = (j.lines || []).filter((l: any) => l && l.accountCode);
        const totalD = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
        return <span className="text-sm text-foreground">{formatCurrency(totalD)}</span>;
      },
    },
    {
      key: "balanced",
      header: "التوازن",
      render: (j) => {
        const lines = (j.lines || []).filter((l: any) => l && l.accountCode);
        const totalD = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
        const totalC = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
        const isBalanced = Math.abs(totalD - totalC) < 0.01;
        return (
          <div className="flex items-center gap-1 flex-wrap">
            <PageStatusBadge status={isBalanced ? "active" : "rejected"}>
              {isBalanced ? "متوازن" : "غير متوازن"}
            </PageStatusBadge>
            {j.reversedById && <PageStatusBadge status="reversed" />}
            {j.reversalOfId && (
              <PageStatusBadge status="active">قيد عاكس</PageStatusBadge>
            )}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (j) => (
        <Button
          variant="ghost"
          size="icon"
          title="عكس القيد"
          disabled={!!j.reversedById || !!j.reversalOfId}
          onClick={(e) => {
            e.stopPropagation();
            setReversalTarget(j);
            setReversalReason("");
          }}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const totalEntries = items.length;
  const totalDebit = items.reduce((s: number, j: any) => {
    const lines = j.lines || [];
    return s + lines.reduce((ls: number, l: any) => ls + Number(l?.debit || 0), 0);
  }, 0);

  return (
    <PageShell
      title="القيود اليومية"
      subtitle="دفتر اليومية العام — كل القيود المُرحَّلة مع إمكانية عكس قيد مُرحَّل"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "القيود اليومية" }]}
      loading={isLoading}
      actions={
        <Button size="sm" asChild>
          <Link href="/finance/journal/create">
            <Plus className="h-4 w-4 me-1" />
            قيد جديد
          </Link>
        </Button>
      }
    >
      <KpiGrid items={[
        { label: "إجمالي القيود", value: formatNumber(totalEntries), icon: ScrollText, color: "text-blue-600 bg-blue-50" },
        { label: "هذا الشهر", value: formatNumber(items.filter((j: any) => { const d = new Date(j.createdAt); const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length), icon: Calendar, color: "text-orange-600 bg-orange-50" },
        { label: "إجمالي المدين", value: formatCurrency(totalDebit), icon: ArrowLeftRight, color: "text-emerald-600 bg-emerald-50" },
        { label: "مسودات", value: formatNumber(items.filter((j: any) => j.status === "draft").length), icon: FileEdit, color: "text-violet-600 bg-violet-50" },
      ]} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالوصف أو المرجع...",
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            (filtered || []) as any[],
            [
              { key: "ref", label: "المرجع" },
              { key: "description", label: "الوصف" },
              { key: "createdAt", label: "التاريخ" },
            ],
            "القيود_اليومية",
          )
        }
        resultCount={filtered?.length}
      />

      <BulkActionsBar
        entityType="journal_entry"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["journal"]]}
        actions={["export"]}
        csvColumns={[
          { key: "ref", label: "المرجع" },
          { key: "description", label: "الوصف" },
          { key: "createdAt", label: "التاريخ" },
        ]}
        csvFileName="القيود_اليومية"
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد قيود"
        emptyIcon={<ScrollText className="h-6 w-6 text-slate-400" />}
        onRowClick={(j) => setExpandedId(expandedId === j.id ? null : j.id)}
        noToolbar
        renderRowExtras={(j) => {
          if (expandedId !== j.id) return null;
          const lines = (j.lines || []).filter((l: any) => l && l.accountCode);
          if (lines.length === 0) return null;
          const totalD = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
          const totalC = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
          return (
            <div className="bg-gray-50 px-6 py-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="py-1 text-start">الحساب</th>
                    <th className="py-1 text-start">مدين</th>
                    <th className="py-1 text-start">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l: any, i: number) => (
                    <tr key={i} className="border-t border-gray-200">
                      <td className="py-1.5 font-mono text-sm">{l.accountCode}</td>
                      <td className="py-1.5 text-emerald-600 font-medium">
                        {Number(l.debit || 0) > 0 ? formatCurrency(l.debit) : "-"}
                      </td>
                      <td className="py-1.5 text-red-600 font-medium">
                        {Number(l.credit || 0) > 0 ? formatCurrency(l.credit) : "-"}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 font-bold">
                    <td className="py-1.5">المجموع</td>
                    <td className="py-1.5 text-emerald-700">{formatCurrency(totalD)}</td>
                    <td className="py-1.5 text-red-700">{formatCurrency(totalC)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        }}
      />

      <AlertDialog
        open={!!reversalTarget}
        onOpenChange={(open) => {
          if (!open) {
            setReversalTarget(null);
            setReversalReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              عكس القيد {reversalTarget?.ref || `JE-${reversalTarget?.id}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إنشاء قيد جديد بنفس البنود مع عكس المدين والدائن. هذا الإجراء
              لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-1 block">سبب عكس القيد *</label>
            <Textarea
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder="أدخل سبب عكس القيد..."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={(e) => {
                e.preventDefault();
                if (!reversalReason.trim()) {
                  toast({ variant: "destructive", title: "السبب مطلوب" });
                  return;
                }
                reverseMut.mutate({
                  id: reversalTarget.id,
                  reason: reversalReason,
                });
              }}
              disabled={reverseMut.isPending}
            >
              {reverseMut.isPending ? "جاري العكس..." : "تأكيد العكس"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
