import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, apiPatch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, GitBranch, TrendingUp, TrendingDown, Layers, BookOpen, ChevronDown, ChevronRight, CheckCircle, Search, Edit2, Trash2, Printer } from "lucide-react";
import { formatCurrency, formatNumber, formatDateAr } from "@/lib/formatters";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
// R.2 iter 2 — PageShell for the unified layout, ConfirmDeleteDialog
// for the centralised delete flow with Phase C.7b blockers surfacing.
import { PageShell } from "@/components/page-shell";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";

const typeMap: Record<string, string> = {
  asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات"
};
const typeColors: Record<string, string> = {
  asset: "bg-status-info-surface text-status-info-foreground",
  liability: "bg-status-error-surface text-status-error-foreground",
  equity: "bg-purple-100 text-purple-700",
  revenue: "bg-status-success-surface text-status-success-foreground",
  expense: "bg-orange-100 text-orange-700",
};

function AccountNode({ node, level = 0, highlightIds, onEdit, onDelete }: { node: any; level?: number; highlightIds?: Set<number>; onEdit: (acc: any) => void; onDelete: (acc: any) => void }) {
  const [expanded, setExpanded] = useState(highlightIds ? highlightIds.has(node.id) || level < 1 : level < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isMatch = highlightIds?.has(node.id) && node._matched;

  return (
    <div>
      <div
        className={`flex items-center gap-2 p-3 hover:bg-surface-subtle border-b transition-colors text-sm group ${level > 0 ? "bg-surface-subtle/30" : ""} ${isMatch ? "bg-status-warning-surface/60 ring-1 ring-inset ring-yellow-200" : ""}`}
        style={{ paddingInlineStart: `${12 + level * 20}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="flex-shrink-0 text-muted-foreground hover:text-muted-foreground">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        <span className="font-mono text-status-info-foreground text-xs w-16 flex-shrink-0 truncate">{node.code}</span>

        <Link href={`/finance/ledger/${node.code}`} className="flex-1 min-w-0 truncate font-medium text-gray-900 hover:text-status-info-foreground cursor-pointer" title={node.name}>
          {node.name}
          {node.nameEn && <span className="text-muted-foreground text-xs ms-2 font-normal">{node.nameEn}</span>}
        </Link>

        <div className="w-20 flex-shrink-0 flex justify-center">
          <Badge className={`${typeColors[node.type] || ""} text-xs whitespace-nowrap`}>{typeMap[node.type] || node.type}</Badge>
        </div>

        <div className="w-16 flex-shrink-0 flex justify-center">
          {node.isAnalytical
            ? <Badge className="bg-indigo-100 text-indigo-700 text-xs">تحليلي</Badge>
            : !node.allowPosting
              ? <Badge className="bg-surface-subtle text-muted-foreground text-xs">تجميعي</Badge>
              : <span className="text-gray-300 text-xs">—</span>}
        </div>

        <div className="w-16 flex-shrink-0 flex justify-center">
          {node.isActive === false
            ? <Badge className="bg-status-error-surface text-status-error-foreground text-xs">موقوف</Badge>
            : <Badge className="bg-status-success-surface text-status-success-foreground text-xs">نشط</Badge>}
        </div>

        <span className={`w-28 flex-shrink-0 font-semibold text-sm text-start tabular-nums ${Number(node.balance || node.currentBalance || 0) >= 0 ? "text-status-success-foreground" : "text-status-error-foreground"}`}>
          {formatCurrency(Number(node.balance || node.currentBalance || 0))}
        </span>

        <div className="w-16 flex-shrink-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(node)} className="p-1 rounded hover:bg-status-info-surface text-muted-foreground hover:text-status-info-foreground" title="تعديل">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onDelete(node)} className="p-1 rounded hover:bg-red-100 text-muted-foreground hover:text-status-error-foreground" title="حذف">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {expanded && hasChildren && node.children.map((child: any) => (
        <AccountNode key={child.code} node={child} level={level + 1} highlightIds={highlightIds} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}

export default function AccountsPage() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError } = useApiQuery<any>(["accounts"], "/finance/accounts");
  const items = data?.data || [];
  const [filters, setFilters] = useFilters();
  const [viewMode, setViewMode] = useState<"tree" | "flat">("tree");
  // R.2 iter 2 — delete flow routed through ConfirmDeleteDialog. The
  // dialog owns its own loading / error / blockers state, so the page
  // only tracks which row is currently being deleted.
  const [deleteAccount, setDeleteAccount] = useState<{ id: number; code: string; name: string } | null>(null);

  const hasActiveSearch = !!(filters.search || filters.type);

  const filtered = applyFilters(items, filters, {
    searchFields: ["name", "code", "nameEn"],
    extraFields: { type: "type" },
  });

  const totalAccounts = items.length;
  const assetCount = items.filter((a: any) => a.type === "asset").length;
  const liabilityCount = items.filter((a: any) => a.type === "liability").length;
  const revenueCount = items.filter((a: any) => a.type === "revenue").length;
  const analyticalCount = items.filter((a: any) => a.isAnalytical).length;

  const { tree, highlightIds } = useMemo(() => {
    if (!hasActiveSearch) {
      const map = new Map<number, any>();
      items.forEach((a: any) => map.set(a.id, { ...a, children: [] }));
      const roots: any[] = [];
      items.forEach((a: any) => {
        const node = map.get(a.id);
        if (a.parentId && map.has(a.parentId)) {
          map.get(a.parentId).children.push(node);
        } else {
          roots.push(node);
        }
      });
      return { tree: roots, highlightIds: undefined };
    }

    const matchedIds = new Set<number>(filtered.map((a: any) => a.id));
    const ancestorIds = new Set<number>();
    const idToAccount = new Map<number, any>();
    items.forEach((a: any) => idToAccount.set(a.id, a));

    for (const id of matchedIds) {
      let current = idToAccount.get(id);
      while (current?.parentId) {
        if (ancestorIds.has(current.parentId)) break;
        ancestorIds.add(current.parentId);
        current = idToAccount.get(current.parentId);
      }
    }

    const visibleIds = new Set<number>([...matchedIds, ...ancestorIds]);
    const visibleItems = items.filter((a: any) => visibleIds.has(a.id));

    const map = new Map<number, any>();
    visibleItems.forEach((a: any) => map.set(a.id, { ...a, children: [], _matched: matchedIds.has(a.id) }));
    const roots: any[] = [];
    visibleItems.forEach((a: any) => {
      const node = map.get(a.id);
      if (a.parentId && map.has(a.parentId)) {
        map.get(a.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    });

    const allHighlightIds = new Set<number>([...matchedIds, ...ancestorIds]);
    return { tree: roots, highlightIds: allHighlightIds };
  }, [items, filtered, hasActiveSearch]);

  const sortedFlat = [...filtered].sort((a: any, b: any) => (a.code || "").localeCompare(b.code || ""));

  const flatColumns: DataTableColumn<any>[] = [
    {
      key: "code",
      header: "الرمز",
      sortable: true,
      render: (acc) => <span className="font-mono text-status-info-foreground text-xs">{acc.code}</span>,
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (acc) => <span className="text-muted-foreground text-xs">{acc.createdAt ? formatDateAr(acc.createdAt) : "-"}</span>,
    },
    {
      key: "name",
      header: "الاسم",
      sortable: true,
      render: (acc) => (
        <div>
          <Link href={`/finance/ledger/${acc.code}`}>
            <span className="font-medium hover:text-status-info-foreground cursor-pointer">{acc.name}</span>
          </Link>
          {acc.nameEn && <div className="text-xs text-muted-foreground">{acc.nameEn}</div>}
        </div>
      ),
    },
    {
      key: "type",
      header: "النوع",
      sortable: true,
      render: (acc) => <Badge className={`${typeColors[acc.type] || ""} text-xs`}>{typeMap[acc.type] || acc.type}</Badge>,
    },
    { key: "level", header: "المستوى", sortable: true, align: "center" },
    {
      key: "allowPosting",
      header: "يقبل حركة",
      align: "center",
      render: (acc) => acc.allowPosting ? <CheckCircle className="h-4 w-4 text-status-success mx-auto" /> : <span className="text-gray-300">-</span>,
    },
    {
      key: "isAnalytical",
      header: "تحليلي",
      align: "center",
      render: (acc) => acc.isAnalytical ? <CheckCircle className="h-4 w-4 text-indigo-500 mx-auto" /> : <span className="text-gray-300">-</span>,
    },
    {
      key: "isActive",
      header: "الحالة",
      sortable: true,
      render: (acc) => acc.isActive !== false ? (
        <Badge className="bg-status-success-surface text-status-success-foreground text-xs">نشط</Badge>
      ) : (
        <Badge className="bg-status-error-surface text-status-error-foreground text-xs">موقوف</Badge>
      ),
    },
    {
      key: "currentBalance",
      header: "الرصيد",
      sortable: true,
      render: (acc) => (
        <span className={`font-semibold text-sm ${Number(acc.currentBalance || 0) >= 0 ? "text-status-success-foreground" : "text-status-error-foreground"}`}>
          {formatCurrency(Number(acc.currentBalance || 0))}
        </span>
      ),
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (acc) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => handleOpenEdit(acc)} className="p-1 rounded hover:bg-status-info-surface text-muted-foreground hover:text-status-info-foreground">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setDeleteAccount({ id: acc.id, code: acc.code, name: acc.name })} className="p-1 rounded hover:bg-status-error-surface text-muted-foreground hover:text-status-error-foreground">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const handleOpenEdit = (acc: any) => {
    navigate(`/finance/accounts/${acc.id}/edit`);
  };

  // R.2 iter 2 — delete is handled by ConfirmDeleteDialog below. The
  // ad-hoc `handleDelete` + manual `setDeleteError` path used to live
  // here; it's been replaced by the centralised dialog which:
  //   • shows the impact preview from `/impact-preview`
  //   • calls `DELETE /finance/accounts/:id` via `useApiMutation`
  //   • on `409 CONFLICT` with `meta.blockers` (Phase C.7b delete guard
  //     for accounts referenced by journal_lines) surfaces the blockers
  //     list inside the dialog instead of flashing a flat toast
  //   • invalidates the `accounts` query on success

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <>
      <PageShell
        title="شجرة الحسابات"
        subtitle="دليل الحسابات المحاسبي — عرض شجري أو مسطح مع التصفية والإجراءات السريعة"
        breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "شجرة الحسابات" }]}
        loading={isLoading}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 me-1" />
              طباعة
            </Button>
            <Button
              size="sm"
              variant={viewMode === "tree" ? "default" : "outline"}
              onClick={() => setViewMode("tree")}
            >
              <GitBranch className="h-4 w-4 me-1" />
              شجري
            </Button>
            <Button
              size="sm"
              variant={viewMode === "flat" ? "default" : "outline"}
              onClick={() => setViewMode("flat")}
            >
              <Layers className="h-4 w-4 me-1" />
              مسطح
            </Button>
            <GuardedButton perm="finance:create" size="sm" asChild>
              <Link href="/finance/accounts/create">
                <Plus className="h-4 w-4 me-1" />
                إضافة حساب
              </Link>
            </GuardedButton>
          </>
        }
      >
      <FinanceTabsNav />
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-status-info-surface rounded-lg"><Layers className="h-5 w-5 text-status-info-foreground" /></div>
          <div><p className="text-xs text-muted-foreground">إجمالي الحسابات</p><p className="text-xl font-bold">{formatNumber(totalAccounts)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-status-info-surface rounded-lg"><TrendingUp className="h-5 w-5 text-status-info" /></div>
          <div><p className="text-xs text-muted-foreground">الأصول</p><p className="text-xl font-bold text-status-info-foreground">{formatNumber(assetCount)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-status-error-surface rounded-lg"><TrendingDown className="h-5 w-5 text-status-error" /></div>
          <div><p className="text-xs text-muted-foreground">الخصوم</p><p className="text-xl font-bold text-status-error-foreground">{formatNumber(liabilityCount)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-status-success-surface rounded-lg"><BookOpen className="h-5 w-5 text-status-success" /></div>
          <div><p className="text-xs text-muted-foreground">الإيرادات</p><p className="text-xl font-bold text-status-success-foreground">{formatNumber(revenueCount)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 bg-indigo-50 rounded-lg"><CheckCircle className="h-5 w-5 text-indigo-500" /></div>
          <div><p className="text-xs text-muted-foreground">تحليلية</p><p className="text-xl font-bold text-indigo-600">{formatNumber(analyticalCount)}</p></div>
        </CardContent></Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو الرمز أو النوع...",
          extraFilters: [
            {
              key: "type",
              label: "النوع",
              options: Object.entries(typeMap).map(([k, v]) => ({ value: k, label: v })),
            },
          ],
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() => exportToCSV((sortedFlat || []) as any[], [
          { key: "code", label: "الرمز" },
          { key: "name", label: "الاسم" },
          { key: "nameEn", label: "الاسم (إنجليزي)" },
          { key: "type", label: "النوع" },
          { key: "level", label: "المستوى" },
          { key: "allowPosting", label: "يقبل حركة" },
          { key: "isAnalytical", label: "تحليلي" },
          { key: "costCenter", label: "مركز التكلفة" },
          { key: "isActive", label: "نشط" },
          { key: "currentBalance", label: "الرصيد الحالي" },
        ], "شجرة_الحسابات")}
        resultCount={filtered?.length}
      />

      {hasActiveSearch && filtered.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-status-warning-surface border border-status-warning-surface rounded-lg px-3 py-2">
          <Search className="h-4 w-4 text-status-warning-foreground" />
          <span>تم العثور على <strong className="text-status-neutral-foreground">{filtered.length}</strong> حساب مطابق — يتم عرض الحسابات الأصلية للحفاظ على التسلسل الشجري</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Layers className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد حسابات</p>
            </div>
          ) : viewMode === "tree" ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-surface-subtle border-b text-xs text-muted-foreground font-medium">
                <span className="w-4" />
                <span className="w-16">الرمز</span>
                <span className="flex-1">الاسم</span>
                <span className="w-20 text-center">النوع</span>
                <span className="w-16 text-center">فرعي</span>
                <span className="w-16 text-center">نشاط</span>
                <span className="w-28 text-start">الرصيد</span>
                <span className="w-16" />
              </div>
              <div>{tree.map((node: any) => <AccountNode key={node.code || node.id} node={node} level={0} highlightIds={highlightIds} onEdit={handleOpenEdit} onDelete={(n: any) => setDeleteAccount({ id: n.id, code: n.code, name: n.name })} />)}</div>
            </>
          ) : (
            <div className="p-3">
              <DataTable
                columns={flatColumns}
                data={sortedFlat}
                onRowClick={(acc) => navigate(`/finance/ledger/${acc.code}`)}
                noToolbar
                emptyMessage="لا توجد حسابات"
              />
            </div>
          )}
        </CardContent>
      </Card>
      </PageShell>

      {/* R.2 iter 2 — canonical delete dialog. When the server refuses
          with 409 CONFLICT + meta.blockers (accounts with journal
          lines), the dialog surfaces the blockers inside itself
          instead of showing a flat error message. */}
      <ConfirmDeleteDialog
        open={deleteAccount !== null}
        onOpenChange={(v) => !v && setDeleteAccount(null)}
        entity={{
          type: "chart_of_accounts",
          id: deleteAccount?.id ?? 0,
          name: deleteAccount
            ? `${deleteAccount.code} ${deleteAccount.name}`
            : "",
        }}
        deletePath={`/finance/accounts/${deleteAccount?.id ?? 0}`}
        invalidateKeys={[["accounts"]]}
        successMessage="تم حذف الحساب"
        onDeleted={() => setDeleteAccount(null)}
      />
    </>
  );
}
